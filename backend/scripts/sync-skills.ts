/**
 * Sync skills from coreyhaines31/marketingskills into the local skill library.
 *
 *   bun run scripts/sync-skills.ts                  # add new skills only (skip existing)
 *   bun run scripts/sync-skills.ts --overwrite      # also overwrite existing files
 *   bun run scripts/sync-skills.ts --only=ab-test-setup,ad-creative
 *                                                    # only sync the listed slugs
 *   bun run scripts/sync-skills.ts --dry-run        # show what would change
 *
 * What it does:
 *   - Lists `skills/<slug>/` folders from the GitHub API.
 *   - Downloads `skills/<slug>/SKILL.md` for each one.
 *   - Writes to backend/src/config/skills/library/<slug>.md.
 *   - Skips files that already exist (unless --overwrite).
 *
 * After running, you may want to update backend/src/config/skills/manifests.ts
 * to add the new slug(s) to one or more generators (brandBrain, productBrain,
 * topic, content, chat). The loader's boot-time validation will tell you if you
 * referenced a slug whose .md file is missing.
 *
 * Source: https://github.com/coreyhaines31/marketingskills/tree/main/skills
 *
 * If you fork or replace the source repo, edit the constants below.
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const REPO = "coreyhaines31/marketingskills";
const BRANCH = "main";
const SKILLS_DIR_API = `https://api.github.com/repos/${REPO}/contents/skills?ref=${BRANCH}`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/skills`;
const TARGET_DIR = join(import.meta.dir, "..", "src", "config", "skills", "library");

const args = new Set(process.argv.slice(2));
const OVERWRITE = args.has("--overwrite");
const DRY_RUN = args.has("--dry-run");
const ONLY = (() => {
	const flag = process.argv.find((a) => a.startsWith("--only="));
	return flag ? new Set(flag.slice("--only=".length).split(",").map((s) => s.trim())) : null;
})();

interface GitHubEntry {
	name: string;
	type: "dir" | "file";
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function main() {
	console.log(`Source:  https://github.com/${REPO}@${BRANCH}/skills`);
	console.log(`Target:  ${TARGET_DIR}`);
	console.log(`Mode:    ${DRY_RUN ? "dry-run" : OVERWRITE ? "overwrite" : "skip-existing"}`);
	if (ONLY) console.log(`Only:    ${[...ONLY].join(", ")}`);
	console.log();

	if (!DRY_RUN) await mkdir(TARGET_DIR, { recursive: true });

	const res = await fetch(SKILLS_DIR_API, {
		headers: { Accept: "application/vnd.github+json" },
	});
	if (!res.ok) {
		console.error(`GitHub API error: ${res.status} ${res.statusText}`);
		process.exit(1);
	}
	const entries = (await res.json()) as GitHubEntry[];
	const allSlugs = entries.filter((e) => e.type === "dir").map((e) => e.name).sort();
	const slugs = ONLY ? allSlugs.filter((s) => ONLY.has(s)) : allSlugs;

	console.log(`Source has ${allSlugs.length} skills; processing ${slugs.length}.\n`);
	let written = 0;
	let skipped = 0;
	let failed = 0;

	for (const slug of slugs) {
		const target = join(TARGET_DIR, `${slug}.md`);
		const exists = await fileExists(target);

		if (exists && !OVERWRITE) {
			console.log(`  · ${slug} (exists, skipped — pass --overwrite to update)`);
			skipped++;
			continue;
		}

		const url = `${RAW_BASE}/${slug}/SKILL.md`;
		const r = await fetch(url);
		if (!r.ok) {
			console.error(`  ✗ ${slug}: HTTP ${r.status}`);
			failed++;
			continue;
		}
		const body = await r.text();

		if (DRY_RUN) {
			console.log(`  ${exists ? "↻" : "✚"} ${slug} (${body.length} bytes${DRY_RUN ? ", not written" : ""})`);
			written++;
			continue;
		}

		await writeFile(target, body, "utf8");
		console.log(`  ${exists ? "↻ overwritten" : "✚ added"} ${slug} (${body.length} bytes)`);
		written++;
	}

	console.log(
		`\nDone. ${DRY_RUN ? "Would write" : "Wrote"} ${written}, skipped ${skipped}, failed ${failed}.`,
	);
	if (!DRY_RUN && written > 0) {
		console.log(
			`\nRemember to update backend/src/config/skills/manifests.ts if you want any newly-added slugs to take effect for a generator.`,
		);
	}
	if (failed > 0) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
