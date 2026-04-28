# Skills System SSOT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move skills from per-workspace DB-managed (`AiSkill` + `WorkspaceSkillMapping`) to system-level config under `backend/src/config/skills/`. Per-generator manifests gate which skills inject into each prompt. The 40 starter skills come from `coreyhaines31/marketingskills`. Brand-brain and product-brain auto-fill flows gain skill injection (they don't have it today).

**Architecture:** Markdown library with optional frontmatter, typed manifest, in-memory registry loaded at server boot. Boot fails fast if a manifest references a missing slug. Existing `MAX_SKILL_CONTEXT_CHARS` cap and rendering format preserved. Chat @-mentions switch from UUIDs to slugs over the wire (`requestedSkillIds` → `requestedSkillSlugs`); frontend in-memory variable names stay as `skillIds` (now holding slugs) to keep the diff small — semantic shift only.

**Tech Stack:** TypeScript, Bun, Hono, Prisma 7. New dev dependency: `gray-matter` (~30KB) for YAML frontmatter parsing — alternative is a 30-line inline parser; the plan uses `gray-matter` for simplicity.

Spec: `docs/superpowers/specs/2026-04-28-skills-system-ssot-design.md`

---

## File Structure

**Create (one-shot, deleted after Task 1):**
- `backend/scripts/fetch-corey-skills.ts` — fetches and writes the 40 markdown files.

**Create:**
- `backend/src/config/skills/library/<slug>.md` — 40 markdown files (Task 1).
- `backend/src/config/skills/manifests.ts` — typed slug arrays per generator.
- `backend/src/config/skills/loader.ts` — reads library, builds in-memory registry, validates manifests.
- `backend/src/routes/skill-list.route.ts` — minimal `GET /api/skills/chat`.

**Modify (backend):**
- `backend/src/utils/skill-context-builder.ts` — rewrite to use registry + slugs.
- `backend/src/utils/ai-activity-logger.ts` — input field rename `skillIds` → `skillSlugs`.
- `backend/src/jobs/topic-generation.job.ts` — pass registry, generator key `"topic"`.
- `backend/src/jobs/topic-regeneration.job.ts` — pass registry, generator key `"topic"`.
- `backend/src/jobs/content-generation.job.ts` — pass registry, generator key `"content"`.
- `backend/src/jobs/brand-scraping.job.ts` — NEW skill injection, generator key `"brandBrain"`.
- `backend/src/routes/product.route.ts` — NEW skill injection in `/scrape-preview` + `/generate-brain`, generator key `"productBrain"`.
- `backend/src/services/chat.service.ts` — accept slugs, call `buildSkillContextFromSlugs`.
- `backend/src/repositories/workspace.repository.ts` — remove default-skill seeding block.
- `backend/src/index.ts` — load registry at boot, pass into consumers, drop old skill route mount, mount new chat-skills route.
- `backend/prisma/schema.prisma` — drop `AiSkill` + `WorkspaceSkillMapping` models + `Workspace.skillMappings` relation.

**Delete (backend):**
- `backend/src/routes/skill.route.ts`
- `backend/scripts/seed-skills.ts`
- `backend/scripts/fetch-corey-skills.ts` (deleted at end of Task 1, after the markdown files are committed)

**Modify (frontend):**
- `frontend/src/hooks/useAvailableSkills.ts` — repointed at `/api/skills/chat`. Returns `{ slug, name, description }`.
- `frontend/src/hooks/useChatStream.ts` — body field rename `skillIds` → `skillSlugs` on the wire only; in-memory state field unchanged.
- `frontend/src/components/campaigns/chat/ChatInput.tsx` — collects slugs (variable still named `skillIds`).
- `frontend/src/components/campaigns/chat/ChatPanel.tsx` — passes through unchanged (variable name preserved).
- `frontend/src/components/campaigns/chat/SkillMentionMenu.tsx` — uses `slug` from `SkillSummary` instead of `id` for the inserted token.
- `frontend/src/components/campaigns/chat/blocks/MentionedText.tsx` — looks up by slug instead of id.
- `frontend/src/App.tsx` — drop the Workspace Settings → Skills route entry.

**Delete (frontend):**
- `frontend/src/components/workspace-settings/SkillsTab.tsx`
- `frontend/src/components/skills/SkillFormModal.tsx`
- `frontend/src/components/skills/SkillDetailModal.tsx`
- `frontend/src/components/skills/ActiveSkillsBadges.tsx` — was a per-workspace concept; with the manifest approach, "active skills" is global state and not user-relevant.
- The skills tab references in `WorkspaceSettingsPage.tsx` (or wherever the SkillsTab is mounted as a tab).
- Imports of `ActiveSkillsBadges` from `TopicsPage.tsx` and `GeneratePage.tsx`, plus the JSX usage.

---

## Task 1: Fetch the 40 starter skills from Corey's repo

**Files:**
- Create: `/Users/bellinnn/Documents/projects/fce/backend/scripts/fetch-corey-skills.ts`
- Create: `/Users/bellinnn/Documents/projects/fce/backend/src/config/skills/library/<slug>.md` × 40

- [ ] **Step 1: Write the fetch script**

Create `backend/scripts/fetch-corey-skills.ts`:

```ts
/**
 * One-shot: fetch all skills from coreyhaines31/marketingskills and write
 * them to backend/src/config/skills/library/<slug>.md.
 *
 *   bun run scripts/fetch-corey-skills.ts
 *
 * Skips files that already exist (idempotent if you've added local edits).
 * Source: https://github.com/coreyhaines31/marketingskills/tree/main/skills
 *
 * After this script runs successfully and the markdown files are committed,
 * delete this script — its job is done.
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const REPO = "coreyhaines31/marketingskills";
const BRANCH = "main";
const SKILLS_DIR_API = `https://api.github.com/repos/${REPO}/contents/skills?ref=${BRANCH}`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/skills`;
const TARGET_DIR = join(import.meta.dir, "..", "src", "config", "skills", "library");

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
	console.log(`Fetching skills from ${REPO}…`);
	await mkdir(TARGET_DIR, { recursive: true });

	const res = await fetch(SKILLS_DIR_API, {
		headers: { Accept: "application/vnd.github+json" },
	});
	if (!res.ok) {
		console.error(`GitHub API error: ${res.status} ${res.statusText}`);
		process.exit(1);
	}
	const entries = (await res.json()) as GitHubEntry[];
	const slugs = entries.filter((e) => e.type === "dir").map((e) => e.name).sort();

	console.log(`Found ${slugs.length} skills.`);
	let written = 0;
	let skipped = 0;
	let failed = 0;

	for (const slug of slugs) {
		const target = join(TARGET_DIR, `${slug}.md`);
		if (await fileExists(target)) {
			skipped++;
			continue;
		}
		const url = `${RAW_BASE}/${slug}/SKILL.md`;
		const r = await fetch(url);
		if (!r.ok) {
			console.error(`  ✗ ${slug}: ${r.status}`);
			failed++;
			continue;
		}
		const body = await r.text();
		await writeFile(target, body, "utf8");
		written++;
		console.log(`  ✓ ${slug}`);
	}

	console.log(`\nDone. Written ${written}, skipped (already exist) ${skipped}, failed ${failed}.`);
	if (failed > 0) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
```

- [ ] **Step 2: Run the script**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
bun run scripts/fetch-corey-skills.ts
```

Expected: `Found 40 skills.` followed by 40 ✓ lines, then `Done. Written 40, skipped 0, failed 0.`

- [ ] **Step 3: Verify the files**

```bash
ls /Users/bellinnn/Documents/projects/fce/backend/src/config/skills/library | wc -l
```

Expected: `40`.

```bash
head -10 /Users/bellinnn/Documents/projects/fce/backend/src/config/skills/library/ab-test-setup.md
```

Expected: starts with `---\nname: ab-test-setup\ndescription: ...` (frontmatter present).

- [ ] **Step 4: Delete the fetch script**

```bash
rm /Users/bellinnn/Documents/projects/fce/backend/scripts/fetch-corey-skills.ts
```

The script's job is done. Keeping it would imply ongoing use; it's a one-shot.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/config/skills/library
git commit -m "feat(skills): seed library with 40 marketing skills from coreyhaines31/marketingskills

Files mirror skills/<slug>/SKILL.md from the source repo, written
to backend/src/config/skills/library/<slug>.md. Frontmatter is
preserved as-is — the loader's fallback chain handles the
slug-equals-name case by deriving from the H1 in the body."
```

---

## Task 2: Loader + manifests (no consumers yet)

**Files:**
- Create: `/Users/bellinnn/Documents/projects/fce/backend/src/config/skills/manifests.ts`
- Create: `/Users/bellinnn/Documents/projects/fce/backend/src/config/skills/loader.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/package.json` (add `gray-matter` dependency)

- [ ] **Step 1: Add `gray-matter` dependency**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
bun add gray-matter
```

This will modify `package.json` and `bun.lock`. Don't commit yet — bundle into the loader commit.

- [ ] **Step 2: Write the manifest**

Create `backend/src/config/skills/manifests.ts`:

```ts
/**
 * Per-generator skill manifests. Slugs must match library/<slug>.md filenames.
 * The loader validates every slug at boot and refuses to start if any are
 * missing.
 *
 * Adding a skill: list its slug here. To remove, delete the entry.
 * To delete a skill entirely, also remove its .md file from library/.
 */

export type GeneratorName = "brandBrain" | "productBrain" | "topic" | "content" | "chat";

export const skillManifests: Record<GeneratorName, readonly string[]> = {
	brandBrain: [
		"customer-research",
		"competitor-alternatives",
		"competitor-profiling",
		"marketing-psychology",
		"pricing-strategy",
		"product-marketing-context",
	],
	productBrain: [
		"product-marketing-context",
		"copywriting",
		"pricing-strategy",
		"marketing-ideas",
	],
	topic: [
		"content-strategy",
		"social-content",
		"ad-creative",
		"marketing-ideas",
		"customer-research",
	],
	content: [
		"copywriting",
		"copy-editing",
		"social-content",
		"ad-creative",
		"marketing-psychology",
	],
	chat: [
		"copywriting",
		"content-strategy",
		"marketing-ideas",
		"customer-research",
	],
};
```

These are first-pass curations from the spec. You'll likely tune them after the smoke test in Task 12 — the manifest is the safest place in the codebase to iterate.

- [ ] **Step 3: Write the loader**

Create `backend/src/config/skills/loader.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { skillManifests, type GeneratorName } from "./manifests";

export interface SkillEntry {
	slug: string;
	name: string;
	description: string;
	content: string;
}

export type SkillRegistry = ReadonlyMap<string, SkillEntry>;

const LIBRARY_DIR = join(import.meta.dir, "library");

function deriveTitleCase(slug: string): string {
	return slug
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function deriveNameFromBody(body: string): string | null {
	// Look for the first H1 line.
	for (const line of body.split("\n")) {
		const match = line.match(/^#\s+(.+)$/);
		if (match) return match[1].trim();
	}
	return null;
}

function deriveDescriptionFromBody(body: string, maxLen = 200): string {
	// First non-empty paragraph after stripping H1s and frontmatter remnants.
	const lines = body.split("\n");
	let para = "";
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("#")) {
			if (para) break;
			continue;
		}
		if (!trimmed) {
			if (para) break;
			continue;
		}
		para += (para ? " " : "") + trimmed;
	}
	if (para.length > maxLen) {
		return para.slice(0, maxLen).trim() + "…";
	}
	return para;
}

async function parseSkillFile(slug: string, raw: string): Promise<SkillEntry> {
	let frontmatter: Record<string, unknown> = {};
	let body = raw;
	try {
		const parsed = matter(raw);
		frontmatter = parsed.data;
		body = parsed.content;
	} catch {
		// Malformed frontmatter — treat as no frontmatter, use whole file as body.
		body = raw;
	}

	const fmName = typeof frontmatter.name === "string" ? frontmatter.name : null;
	const fmDescription = typeof frontmatter.description === "string" ? frontmatter.description : null;

	// Name fallback: frontmatter (if not equal to slug) → H1 → titleCase(slug).
	let name: string;
	if (fmName && fmName !== slug) {
		name = fmName;
	} else {
		name = deriveNameFromBody(body) ?? deriveTitleCase(slug);
	}

	const description = fmDescription ?? deriveDescriptionFromBody(body);

	return {
		slug,
		name,
		description,
		content: body.trim(),
	};
}

export async function loadSkillRegistry(): Promise<SkillRegistry> {
	const files = await readdir(LIBRARY_DIR);
	const mdFiles = files.filter((f) => f.endsWith(".md"));

	const registry = new Map<string, SkillEntry>();
	for (const file of mdFiles) {
		const slug = file.replace(/\.md$/, "");
		const raw = await readFile(join(LIBRARY_DIR, file), "utf8");
		const entry = await parseSkillFile(slug, raw);
		registry.set(slug, entry);
	}

	// Validate every manifest slug exists.
	for (const [generator, slugs] of Object.entries(skillManifests) as [
		GeneratorName,
		readonly string[],
	][]) {
		for (const slug of slugs) {
			if (!registry.has(slug)) {
				throw new Error(
					`Skill manifest "${generator}" references unknown slug "${slug}". ` +
						`Add backend/src/config/skills/library/${slug}.md or remove it from the manifest.`,
				);
			}
		}
	}

	return registry;
}

export function filterByManifest(registry: SkillRegistry, generator: GeneratorName): SkillEntry[] {
	const slugs = skillManifests[generator];
	const out: SkillEntry[] = [];
	for (const slug of slugs) {
		const entry = registry.get(slug);
		if (entry) out.push(entry);
	}
	return out;
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: same baseline as before (typically 8). The loader compiles but isn't called yet.

- [ ] **Step 5: Manual sanity-check the loader against the real files**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
bun run -e 'import { loadSkillRegistry, filterByManifest } from "./src/config/skills/loader.ts"; const reg = await loadSkillRegistry(); console.log("Loaded:", reg.size); console.log("Topic skills:", filterByManifest(reg, "topic").map(s => `${s.slug}: ${s.name}`));'
```

Expected: `Loaded: 40` and the topic skills list with derived names like `content-strategy: Content Strategy`. Confirms (a) all 40 files loaded, (b) the manifest's slugs all exist, (c) name derivation works.

If it errors with "unknown slug", a slug in the manifest is wrong — fix the manifest (or the filename).

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/config/skills/manifests.ts \
        backend/src/config/skills/loader.ts \
        backend/package.json backend/bun.lock
git commit -m "feat(skills): add loader and per-generator manifests

In-memory SkillRegistry built at server boot from library/*.md.
Validates every manifest slug exists; fails fast with a clear
error pointing at the missing file. Frontmatter is optional —
falls back to H1 then titleCase(slug) for name, and to first
paragraph for description.

No consumers yet; subsequent commits wire it through."
```

---

## Task 3: Rewrite `skill-context-builder.ts` to use registry + slugs

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/utils/skill-context-builder.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/utils/ai-activity-logger.ts`

This task INTENTIONALLY breaks all current callers — they're fixed in Tasks 4-7. Tsc count rises during this task and falls back at Task 7.

- [ ] **Step 1: Rewrite `skill-context-builder.ts`**

Replace the entire contents of `backend/src/utils/skill-context-builder.ts`:

```ts
import type { SkillRegistry } from "../config/skills/loader";
import { filterByManifest } from "../config/skills/loader";
import type { GeneratorName } from "../config/skills/manifests";

// Cap the total skill context at ~8000 characters to keep prompts predictable
// regardless of how many skills are mapped to a generator. Unchanged from the
// previous implementation.
const MAX_SKILL_CONTEXT_CHARS = 8000;

export interface SkillContextResult {
	context: string;
	skillSlugs: string[];
	skillNames: string[];
	includedCount: number;
	truncatedCount: number;
}

/**
 * Build the skill-context block for a generator. Reads from the in-memory
 * registry filtered by the manifest entry for that generator.
 */
export function buildSkillContext(
	registry: SkillRegistry,
	generator: GeneratorName,
): SkillContextResult {
	return renderSkills(filterByManifest(registry, generator));
}

/**
 * Build the skill-context block from an explicit list of skill slugs (e.g.
 * @-mentions in chat). Unknown slugs are silently dropped. Same formatting +
 * char cap as `buildSkillContext`.
 */
export function buildSkillContextFromSlugs(
	registry: SkillRegistry,
	slugs: string[],
): SkillContextResult {
	if (slugs.length === 0) {
		return { context: "", skillSlugs: [], skillNames: [], includedCount: 0, truncatedCount: 0 };
	}
	const skills = slugs
		.map((slug) => registry.get(slug))
		.filter((s): s is NonNullable<typeof s> => s !== undefined);
	return renderSkills(skills);
}

type SkillLike = { slug: string; name: string; content: string };

function renderSkills(skills: SkillLike[]): SkillContextResult {
	const skillSlugs = skills.map((s) => s.slug);
	const skillNames = skills.map((s) => s.name);

	let context = "";
	let charCount = 0;
	let includedCount = 0;

	for (const skill of skills) {
		if (charCount >= MAX_SKILL_CONTEXT_CHARS) break;

		const block = `### Skill: ${skill.name}\n${skill.content}`;
		const separator = includedCount === 0 ? "" : "\n\n---\n\n";
		const addition = separator + block;

		const remaining = MAX_SKILL_CONTEXT_CHARS - charCount;
		if (addition.length <= remaining) {
			context += addition;
			charCount += addition.length;
			includedCount += 1;
		} else {
			context += addition.slice(0, remaining);
			charCount = MAX_SKILL_CONTEXT_CHARS;
			includedCount += 1;
			break;
		}
	}

	return {
		context,
		skillSlugs,
		skillNames,
		includedCount,
		truncatedCount: skills.length - includedCount,
	};
}
```

- [ ] **Step 2: Rename input field on `ai-activity-logger.ts`**

In `backend/src/utils/ai-activity-logger.ts`, find lines 16-17:

```ts
	skillIds?: string[];
	skillNames?: string[];
```

Rename `skillIds` to `skillSlugs`:

```ts
	skillSlugs?: string[];
	skillNames?: string[];
```

Then around lines 53-54, find:

```ts
				skillIds: input.skillIds ?? undefined,
				skillNames: input.skillNames ?? undefined,
```

Update the LEFT-hand side to keep storing in the DB column `skillIds` (the column stays — see spec), and the RIGHT-hand side to read from `input.skillSlugs`:

```ts
				skillIds: input.skillSlugs ?? undefined,
				skillNames: input.skillNames ?? undefined,
```

The `AiProviderLog.skillIds: String[]` column stays — it now stores slugs going forward. Old rows still have UUIDs (audit data; treat as opaque).

- [ ] **Step 3: Typecheck — expect new errors in callers**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: HIGHER than baseline (probably 12-15). Errors live in:
- `topic-generation.job.ts` (uses `buildSkillContext(prisma, ...)` and `skillResult.skillIds`)
- `topic-regeneration.job.ts` (passes `skillIds` to logger)
- `content-generation.job.ts` (same as topic)
- `chat.service.ts` (uses `buildSkillContextFromIds`)

This is intentional. Tasks 4-7 fix them.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/utils/skill-context-builder.ts \
        backend/src/utils/ai-activity-logger.ts
git commit -m "refactor(skills): rewrite skill-context-builder for registry + slugs

Drops the prisma + workspaceId arguments. New signature takes a
SkillRegistry and either a generator key (read manifest) or an
explicit slug list (chat). SkillContextResult.skillIds is renamed
to skillSlugs.

ai-activity-logger's input field renamed too (skillIds → skillSlugs);
the AiProviderLog DB column keeps its name and stores slugs going
forward. Pre-existing rows with UUIDs stay as audit data.

Callers break here; subsequent commits fix them."
```

---

## Task 4: Wire registry through composition root + topic + content jobs

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/index.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/jobs/topic-generation.job.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/jobs/topic-regeneration.job.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/jobs/content-generation.job.ts`

- [ ] **Step 1: Load registry at boot**

In `/Users/bellinnn/Documents/projects/fce/backend/src/index.ts`, near the top of `main()` after `prisma` is created (around the line `const logger = new WinstonLogger(...)`), add:

```ts
import { loadSkillRegistry } from "./config/skills/loader";
import type { SkillRegistry } from "./config/skills/loader";
```

…and inside `main()`:

```ts
	const skillRegistry: SkillRegistry = await loadSkillRegistry();
	logger.info(`Loaded ${skillRegistry.size} skills`);
```

If the loader throws (manifest references missing slug), the server fails to start with the clear error message — that's the desired fail-fast behavior.

- [ ] **Step 2: Pass registry into TopicGenerationJob and TopicRegenerationJob constructors**

In `topic-generation.job.ts`, find the constructor (around line 30). Add a `skillRegistry` parameter:

```ts
import { buildSkillContext } from "../utils/skill-context-builder";
import type { SkillRegistry } from "../config/skills/loader";
```

```ts
	constructor(
		// ...existing fields...
		private skillRegistry: SkillRegistry,
	) {}
```

Find the existing call (line 150):

```ts
const skillResult = await buildSkillContext(this.prisma, workspaceId, "topic");
```

Change to:

```ts
const skillResult = buildSkillContext(this.skillRegistry, "topic");
```

Note the `await` is dropped — the new `buildSkillContext` is sync.

Find the AI activity log call (around line 248):

```ts
					skillIds: skillResult.skillIds,
					skillNames: skillResult.skillNames,
```

Change to:

```ts
					skillSlugs: skillResult.skillSlugs,
					skillNames: skillResult.skillNames,
```

Repeat all three changes (constructor, builder call, log call) in `topic-regeneration.job.ts`. Note that topic-regeneration's existing call site passes `skillIds: []` and `skillNames: []` (around line 128) — change to `skillSlugs: []` and `skillNames: []`.

- [ ] **Step 3: Same wiring in `content-generation.job.ts`**

Constructor: add `private skillRegistry: SkillRegistry`. Import accordingly.

Line 162:

```ts
const skillResult = buildSkillContext(this.skillRegistry, "content");
```

Lines 271-272:

```ts
					skillSlugs: skillResult.skillSlugs,
					skillNames: skillResult.skillNames,
```

- [ ] **Step 4: Update composition root to pass registry**

In `backend/src/index.ts`, find the three job constructions:

```ts
	const topicGenerationJob = new TopicGenerationJob(
		prisma,
		aiProviderFactory,
		notificationService,
		logger,
		urlInspirationService,
	);
```

Add `skillRegistry` as the next argument:

```ts
	const topicGenerationJob = new TopicGenerationJob(
		prisma,
		aiProviderFactory,
		notificationService,
		logger,
		urlInspirationService,
		skillRegistry,
	);
```

Same for `topicRegenerationJob` and `contentGenerationJob`. The exact existing signatures may differ — match the convention of "registry as last arg" if there's no preceding pattern.

- [ ] **Step 5: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: dropped relative to Task 3 (the topic + content errors are gone). Chat service still has errors — fixed in Task 7.

- [ ] **Step 6: Run tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -3
```

If existing tests on `topic-generation.job.ts` or `content-generation.job.ts` exist and break, update them — pass a mock registry. Pattern:

```ts
const mockRegistry: SkillRegistry = new Map([
	["copywriting", { slug: "copywriting", name: "Copywriting", description: "...", content: "..." }],
]);
```

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/index.ts \
        backend/src/jobs/topic-generation.job.ts \
        backend/src/jobs/topic-regeneration.job.ts \
        backend/src/jobs/content-generation.job.ts
git commit -m "feat(skills): wire registry through topic + content generation jobs

Composition root loads SkillRegistry at boot and passes into
the three jobs. Each job calls buildSkillContext(registry, key)
sync, and logs skillSlugs (was skillIds)."
```

---

## Task 5: Skill injection in BrandScrapingJob (NEW behavior)

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/jobs/brand-scraping.job.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/index.ts`

`BrandScrapingJob` is the brand-brain auto-fill — runs when a user pastes a website URL on the New Brand page. Today it doesn't read skills; this task adds that.

- [ ] **Step 1: Read the job's existing prompt-building code**

```bash
sed -n '1,80p' /Users/bellinnn/Documents/projects/fce/backend/src/jobs/brand-scraping.job.ts
```

Note where the prompt is built (look for `systemPrompt`, `userPrompt`, or a call to `provider.scrape` or `provider.generateBrandBrain`). The skill context goes into the system prompt.

- [ ] **Step 2: Inject skill context**

Add imports at the top:

```ts
import { buildSkillContext } from "../utils/skill-context-builder";
import type { SkillRegistry } from "../config/skills/loader";
```

Add to the constructor (last argument, matching topic/content jobs):

```ts
	constructor(
		// ...existing fields...
		private skillRegistry: SkillRegistry,
	) {}
```

Inside `handle()`, after the workspaceId is known, build the skill context:

```ts
const skillResult = buildSkillContext(this.skillRegistry, "brandBrain");
```

Then prepend `skillResult.context` to the system prompt the AI provider uses. The exact integration depends on whether `BrandScrapingJob` builds its own prompt or delegates entirely to the provider:
- **If the job builds the prompt:** insert `skillResult.context + "\n\n"` at the top of the system prompt string.
- **If the provider builds the prompt:** the provider needs a new `skillContext` parameter. In that case, also update `IBrandScraper` interface and both `AnthropicProvider.scrape` and `GeminiProvider.scrape` to accept and use it.

(Read the existing job and pick the simpler integration. Most likely: the job builds the user-facing prompt and passes it to the provider; the system prompt lives inside the provider — so a new optional param is needed.)

If you add a parameter:

```ts
// In IBrandScraper
scrape(input: BrandScrapingInput & { skillContext?: string }): Promise<BrandScrapingOutput>;

// In each provider's scrape method
const systemPrompt = (input.skillContext ? input.skillContext + "\n\n" : "") + DEFAULT_SYSTEM_PROMPT;
```

If the test suite exists for `BrandScrapingJob`, update mocks accordingly.

Also add the AI activity log fields if logging exists in this job:

```ts
				skillSlugs: skillResult.skillSlugs,
				skillNames: skillResult.skillNames,
```

- [ ] **Step 3: Update composition root**

In `backend/src/index.ts`, find:

```ts
	const brandScrapingJob = new BrandScrapingJob(
```

Add `skillRegistry` as the new last argument.

- [ ] **Step 4: Typecheck and run tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -3
```

Expected: tsc count dropped (one more job's errors gone). Tests stay green.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/jobs/brand-scraping.job.ts backend/src/index.ts
# If you also modified provider interface and impls, add those:
# git add backend/src/interfaces/providers/brand-scraper.interface.ts \
#         backend/src/providers/anthropic.provider.ts \
#         backend/src/providers/gemini.provider.ts
git commit -m "feat(skills): inject brandBrain skills into BrandScrapingJob

Loads the brandBrain manifest from the registry and prepends the
skill context to the brand-scraping prompt. Logs skillSlugs +
skillNames on the AI activity log so usage shows up in token
tracking."
```

---

## Task 6: Skill injection in product brain routes (NEW behavior)

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/routes/product.route.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/index.ts`

The product routes `/scrape-preview` and `/generate-brain` call `aiGenerator.scrapeProduct(...)` and `aiGenerator.generateProductBrain(...)`. Today they don't read skills; this task adds that.

- [ ] **Step 1: Pass registry into route factory**

In `backend/src/routes/product.route.ts`, find `createProductRoutes(...)`. Add a `skillRegistry: SkillRegistry` parameter:

```ts
import type { SkillRegistry } from "../config/skills/loader";
import { buildSkillContext } from "../utils/skill-context-builder";
```

```ts
export function createProductRoutes(
	productService: IProductService,
	aiProviderFactory: AiProviderFactory,
	storageProvider: IStorageProvider,
	bucket: string,
	prisma?: PrismaClient,
	skillRegistry?: SkillRegistry,  // NEW (optional only because of how prisma is optional today; reuse same convention)
) {
```

(If the existing signature has a different convention — e.g., a config object — adapt to match. The point is the registry is in scope inside the handlers.)

- [ ] **Step 2: Inject in `/scrape-preview`**

Find the `/scrape-preview` handler (around line 60-90 per prior grep). After fetching the brand (added in the language SSOT change), build the skill context and add to the call:

```ts
const skillResult = skillRegistry ? buildSkillContext(skillRegistry, "productBrain") : { context: "", skillSlugs: [], skillNames: [], includedCount: 0, truncatedCount: 0 };

const result = await aiGenerator.scrapeProduct({
	urls: urlList,
	language: brand.language,
	skillContext: skillResult.context,  // NEW
});
```

The `scrapeProduct` provider input needs a new optional `skillContext?: string` field. Update:
- `backend/src/interfaces/providers/...` — wherever `scrapeProduct` lives in the provider interface (search for it).
- `backend/src/providers/anthropic.provider.ts` — `scrapeProduct` method, prepend context to system prompt.
- `backend/src/providers/gemini.provider.ts` — same.

Provider integration pattern (match what was used in BrandScrapingJob in Task 5):

```ts
const systemPrompt = (input.skillContext ? input.skillContext + "\n\n" : "") + DEFAULT_PRODUCT_SCRAPE_SYSTEM;
```

- [ ] **Step 3: Inject in `/generate-brain`**

Same pattern. After fetching the brand:

```ts
const skillResult = skillRegistry ? buildSkillContext(skillRegistry, "productBrain") : { context: "", skillSlugs: [], skillNames: [], includedCount: 0, truncatedCount: 0 };

const result = await aiGenerator.generateProductBrain({
	productName,
	brandName,
	productType,
	priceTier,
	summary,
	language: brand.language,
	skillContext: skillResult.context,  // NEW
});
```

Update `generateProductBrain` provider interface + both Anthropic and Gemini implementations to accept and use `skillContext`.

If AI activity logging exists in these handlers, add `skillSlugs: skillResult.skillSlugs, skillNames: skillResult.skillNames`.

- [ ] **Step 4: Update composition root**

In `backend/src/index.ts`, find the route mount:

```ts
	workspaceScoped.route(
		"/products",
		createProductRoutes(productService, aiProviderFactory, storageProvider, env.minioBucket, prisma),
	);
```

Add `skillRegistry`:

```ts
	workspaceScoped.route(
		"/products",
		createProductRoutes(productService, aiProviderFactory, storageProvider, env.minioBucket, prisma, skillRegistry),
	);
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: tsc count dropping toward baseline. Chat service still in error state.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/product.route.ts backend/src/index.ts \
        backend/src/providers/anthropic.provider.ts backend/src/providers/gemini.provider.ts \
        backend/src/interfaces/providers/  # whichever interface files changed
git commit -m "feat(skills): inject productBrain skills into product /scrape-preview + /generate-brain

Both product routes now build the productBrain skill context from
the manifest and prepend it to the system prompt of scrapeProduct
and generateProductBrain on each AI provider. The provider
interfaces gained an optional skillContext parameter."
```

---

## Task 7: ChatService — slugs instead of UUIDs

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/services/chat.service.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/index.ts`

- [ ] **Step 1: Update ChatService constructor and imports**

In `backend/src/services/chat.service.ts`:

```ts
import { buildSkillContextFromSlugs } from "../utils/skill-context-builder";
import type { SkillRegistry } from "../config/skills/loader";
```

Replace the `buildSkillContextFromIds` import with `buildSkillContextFromSlugs`. Add `skillRegistry: SkillRegistry` to the constructor.

- [ ] **Step 2: Rename body field on the input shape**

The `ChatStreamInput` (or equivalent) type has `skillIds?: string[]`. Find the type definition and rename to `skillSlugs?: string[]`:

```bash
grep -n "skillIds" /Users/bellinnn/Documents/projects/fce/backend/src/types/chat.types.ts /Users/bellinnn/Documents/projects/fce/backend/src/services/chat.service.ts | head -10
```

Update the type to:

```ts
skillSlugs?: string[];
```

- [ ] **Step 3: Update the chat method body**

Around line 86-88 of `chat.service.ts`:

```ts
		const requestedSkillIds = Array.from(new Set(input.skillIds ?? [])).slice(0, 5);
		const skillCtx = await buildSkillContextFromIds(this.prisma, requestedSkillIds);
```

Change to:

```ts
		const requestedSkillSlugs = Array.from(new Set(input.skillSlugs ?? [])).slice(0, 5);
		const skillCtx = buildSkillContextFromSlugs(this.skillRegistry, requestedSkillSlugs);
```

(Note: drops `await` — new function is sync.)

Around line 97 — change `skillIds: skillCtx.skillIds` to `skillSlugs: skillCtx.skillSlugs` if the chat message storage shape uses `skillIds`. Same for line 145-146 and the default-empty `skillCtx` literal at line 583-586.

If the chat message DB column is `skillIds: String[]`, that name STAYS — same logic as `AiProviderLog.skillIds`. The internal variable references can stay as `skillIds` if that's where the rename gets noisy; the wire field is `skillSlugs` from the route handler in.

- [ ] **Step 4: Update the chat route to accept `skillSlugs`**

The route handler that calls into `chatService` reads `skillIds` (or whatever) from the body. Find it:

```bash
grep -n "skillIds\|skillSlugs" /Users/bellinnn/Documents/projects/fce/backend/src/routes/campaign-chat.route.ts
```

Rename the body destructure so the wire field is `skillSlugs`. The frontend will send `skillSlugs` in Task 8.

- [ ] **Step 5: Update composition root**

In `backend/src/index.ts`, find:

```ts
	const chatService = new ChatService(
```

Add `skillRegistry` to the constructor args.

- [ ] **Step 6: Typecheck and run tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -3
```

Expected: tsc back to BASELINE (the count from before Task 3). All callers fixed.

If chat service tests reference `buildSkillContextFromIds` or `skillIds` in mocks, update them to `buildSkillContextFromSlugs` / `skillSlugs`.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/chat.service.ts backend/src/index.ts \
        backend/src/routes/campaign-chat.route.ts \
        backend/src/types/chat.types.ts
git commit -m "refactor(chat): chat accepts skill slugs instead of UUIDs

Wire field renamed from skillIds to skillSlugs. The DB column for
chat-message skill IDs keeps its name and stores slugs going forward,
matching AiProviderLog.skillIds. ChatService now uses
buildSkillContextFromSlugs against the in-memory registry — drops
the prisma round-trip."
```

---

## Task 8: New `/api/skills/chat` endpoint + drop old skill route + workspace seeding cleanup

**Files:**
- Create: `/Users/bellinnn/Documents/projects/fce/backend/src/routes/skill-list.route.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/index.ts`
- Delete: `/Users/bellinnn/Documents/projects/fce/backend/src/routes/skill.route.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/repositories/workspace.repository.ts`

- [ ] **Step 1: Create the new lightweight route**

Create `backend/src/routes/skill-list.route.ts`:

```ts
import { Hono } from "hono";
import type { SkillRegistry } from "../config/skills/loader";
import { filterByManifest } from "../config/skills/loader";

/**
 * GET /api/skills/chat — returns the chat manifest's skills as
 * { slug, name, description }[] for the chat composer's @-mention autocomplete.
 *
 * Other generators don't need a public endpoint; their skills are wired
 * server-side at job time.
 */
export function createSkillListRoutes(skillRegistry: SkillRegistry) {
	const app = new Hono();

	app.get("/chat", (c) => {
		const skills = filterByManifest(skillRegistry, "chat").map((s) => ({
			slug: s.slug,
			name: s.name,
			description: s.description,
		}));
		return c.json({ data: skills });
	});

	return app;
}
```

- [ ] **Step 2: Mount the new route, drop the old one**

In `backend/src/index.ts`, find:

```ts
import { createSkillRoutes, createWorkspaceSkillRoutes } from "./routes/skill.route";
```

Replace with:

```ts
import { createSkillListRoutes } from "./routes/skill-list.route";
```

Find the mount points:

```ts
	app.route("/api/skills", createSkillRoutes(prisma));
```

Replace with:

```ts
	app.route("/api/skills", createSkillListRoutes(skillRegistry));
```

Find:

```ts
	workspaceScoped.route("/skills", createWorkspaceSkillRoutes(prisma));
```

Delete the line entirely.

- [ ] **Step 3: Delete the old route file**

```bash
rm /Users/bellinnn/Documents/projects/fce/backend/src/routes/skill.route.ts
```

- [ ] **Step 4: Remove default-skill seeding from `WorkspaceRepository.create`**

In `backend/src/repositories/workspace.repository.ts`, find the block (around line 55):

```ts
			const defaultSkills = await tx.aiSkill.findMany({
				where: { slug: { in: ["humanizer"] }, isSystem: true },
				select: { id: true },
			});
			for (const skill of defaultSkills) {
				await tx.workspaceSkillMapping.create({
					data: {
						workspaceId: workspace.id,
						skillId: skill.id,
						generator: "content",
						isActive: true,
					},
				});
			}
```

Delete that entire block. New workspaces no longer seed any per-workspace skill mappings — the manifest decides which skills apply globally.

- [ ] **Step 5: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: at baseline. There may be NEW errors here if anything else (e.g., a route, service, or test) still references `prisma.aiSkill` or `prisma.workspaceSkillMapping`. Find with:

```bash
grep -rn "prisma\.aiSkill\|prisma\.workspaceSkillMapping\|tx\.aiSkill\|tx\.workspaceSkillMapping" /Users/bellinnn/Documents/projects/fce/backend/src
```

Each match is a leftover; remove or replace. (Tests in `backend/tests/` may also have references — fix them too.)

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/skill-list.route.ts \
        backend/src/index.ts \
        backend/src/repositories/workspace.repository.ts
git rm backend/src/routes/skill.route.ts
git commit -m "feat(skills): drop old skill routes; add minimal /api/skills/chat

The list/detail/mapping endpoints are obsolete now that the
config drives generator wiring. /api/skills/chat returns just
the chat manifest's skills for the chat composer autocomplete.

Workspace creation no longer seeds any per-workspace skill
mappings — the global manifest decides what each generator uses."
```

---

## Task 9: Frontend — repoint useAvailableSkills + chat composer to slugs

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/frontend/src/hooks/useAvailableSkills.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/frontend/src/hooks/useChatStream.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/frontend/src/components/campaigns/chat/ChatInput.tsx`
- Modify: `/Users/bellinnn/Documents/projects/fce/frontend/src/components/campaigns/chat/ChatPanel.tsx`
- Modify: `/Users/bellinnn/Documents/projects/fce/frontend/src/components/campaigns/chat/SkillMentionMenu.tsx`
- Modify: `/Users/bellinnn/Documents/projects/fce/frontend/src/components/campaigns/chat/blocks/MentionedText.tsx`
- Modify: `/Users/bellinnn/Documents/projects/fce/frontend/src/components/campaigns/chat/Message.tsx`

The chat composer's user-facing UI doesn't change. What changes:
- The hook fetches from `/api/skills/chat` instead of `/api/skills`.
- The `SkillSummary` type's `id` field is dropped; lookups switch to `slug`.
- The wire body field is renamed from `skillIds` to `skillSlugs`.

In-memory variable names like `skillIds` STAY — the values are now slugs (semantic shift only). This keeps the diff small.

- [ ] **Step 1: Repoint `useAvailableSkills`**

Replace the contents of `frontend/src/hooks/useAvailableSkills.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";

export interface SkillSummary {
  slug: string;
  name: string;
  description: string;
}

let cache: SkillSummary[] | null = null;
let inflight: Promise<SkillSummary[]> | null = null;

async function loadSkills(): Promise<SkillSummary[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api<SkillSummary[]>("/api/skills/chat")
    .then((rows) => {
      cache = Array.isArray(rows) ? rows : [];
      return cache;
    })
    .catch(() => {
      cache = [];
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useAvailableSkills() {
  const [skills, setSkills] = useState<SkillSummary[]>(cache ?? []);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    loadSkills().then((list) => {
      if (mounted.current) setSkills(list);
    });
    return () => { mounted.current = false; };
  }, []);
  return { skills };
}
```

Removed: `id` and `category` fields. `SkillSummary` is now `{ slug, name, description }`.

- [ ] **Step 2: Update `SkillMentionMenu.tsx`**

This component renders the autocomplete menu and inserts a token when a skill is picked. Find where it builds the inserted text — likely `@${skill.id}` or stores `skill.id` somewhere. Replace with `skill.slug`:

```bash
grep -n "skill\.id\|\.id\b" /Users/bellinnn/Documents/projects/fce/frontend/src/components/campaigns/chat/SkillMentionMenu.tsx
```

Replace each `skill.id` with `skill.slug`. Same for any `keys` in lookup maps.

- [ ] **Step 3: Update `ChatInput.tsx`**

Around line 178:

```ts
    const skillIds = collectSkillIds(text);
    onSend(text, attachments, skillIds);
```

Find `collectSkillIds`. It probably regexes the message text for `@<id>` patterns and looks up against `useAvailableSkills`. Update it to extract slugs (the inserted token format from Step 2 is now slug-based). The variable name `skillIds` can stay; it now holds slugs.

If your ChatInput stores skill references in a state like `mentionedSkillIds`, leave the name. Just change what's stored from UUID to slug.

- [ ] **Step 4: Update `useChatStream.ts`**

Around line 85:

```ts
    skillIds,
```

Rename the WIRE field on the body to match the backend's new `skillSlugs`:

```ts
    skillSlugs: skillIds,  // local variable name keeps `skillIds`, body field is `skillSlugs`
```

Or, if cleaner, just rename the local variable too. Either is fine.

- [ ] **Step 5: Update `MentionedText.tsx`**

Around line 23-30:

```ts
  for (const id of skillIds ?? []) {
    const skill = skills.find((s) => s.id === id);
```

Replace with:

```ts
  for (const slug of skillIds ?? []) {  // `skillIds` is now slugs in-flight
    const skill = skills.find((s) => s.slug === slug);
```

(The variable name `skillIds` on the message object can stay — it reflects what the backend sends, which is slugs in `skillIds: String[]` because that's the column name.)

- [ ] **Step 6: Update `ChatPanel.tsx` and `Message.tsx`**

These pass the chat message's `skillIds` field through to `MentionedText`. No code change needed — the field name stays. Verify by reading each file briefly.

If any TypeScript types declare `skillIds: string[]` (the message shape), they're unchanged — values are now slugs but type is `string[]` either way.

- [ ] **Step 7: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npx tsc -b 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/hooks frontend/src/components/campaigns/chat
git commit -m "refactor(frontend): chat skills use slugs end-to-end

useAvailableSkills fetches from /api/skills/chat and returns
{ slug, name, description } (no id, no category). SkillMentionMenu
inserts skill.slug tokens. MentionedText looks up by slug.
useChatStream sends skillSlugs on the wire (in-memory variables
keep skillIds names; values are now slugs)."
```

---

## Task 10: Frontend — drop the Workspace Settings Skills page + ActiveSkillsBadges

**Files:**
- Delete: `/Users/bellinnn/Documents/projects/fce/frontend/src/components/workspace-settings/SkillsTab.tsx`
- Delete: `/Users/bellinnn/Documents/projects/fce/frontend/src/components/skills/SkillFormModal.tsx`
- Delete: `/Users/bellinnn/Documents/projects/fce/frontend/src/components/skills/SkillDetailModal.tsx`
- Delete: `/Users/bellinnn/Documents/projects/fce/frontend/src/components/skills/ActiveSkillsBadges.tsx`
- Modify: `/Users/bellinnn/Documents/projects/fce/frontend/src/pages/WorkspaceSettingsPage.tsx` — remove SkillsTab import + tab entry
- Modify: `/Users/bellinnn/Documents/projects/fce/frontend/src/pages/TopicsPage.tsx` — remove ActiveSkillsBadges import and JSX
- Modify: `/Users/bellinnn/Documents/projects/fce/frontend/src/pages/GeneratePage.tsx` — same
- Modify: `/Users/bellinnn/Documents/projects/fce/frontend/src/App.tsx` — remove `/skills` route entry

- [ ] **Step 1: Delete the skill management components**

```bash
cd /Users/bellinnn/Documents/projects/fce
rm frontend/src/components/workspace-settings/SkillsTab.tsx
rm frontend/src/components/skills/SkillFormModal.tsx
rm frontend/src/components/skills/SkillDetailModal.tsx
rm frontend/src/components/skills/ActiveSkillsBadges.tsx
```

If `frontend/src/components/skills/` is now empty after deletion, remove the directory.

- [ ] **Step 2: Update `WorkspaceSettingsPage.tsx`**

```bash
grep -n "SkillsTab\|/skills" /Users/bellinnn/Documents/projects/fce/frontend/src/pages/WorkspaceSettingsPage.tsx
```

Remove the import line and the tab entry that references SkillsTab. The exact JSX depends on how the page composes tabs — likely a `tabs` array or a switch on the active tab. Drop the `skills` tab.

- [ ] **Step 3: Update `TopicsPage.tsx` and `GeneratePage.tsx`**

```bash
grep -n "ActiveSkillsBadges" /Users/bellinnn/Documents/projects/fce/frontend/src/pages/TopicsPage.tsx /Users/bellinnn/Documents/projects/fce/frontend/src/pages/GeneratePage.tsx
```

Remove the import and the JSX usage in each file.

- [ ] **Step 4: Update `App.tsx`**

If there's a `/skills` standalone route (a redirect to workspace settings — see CLAUDE.md mentions `/skills` redirecting), drop it:

```bash
grep -n "/skills" /Users/bellinnn/Documents/projects/fce/frontend/src/App.tsx
```

Remove the route entry.

- [ ] **Step 5: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npx tsc -b 2>&1 | tail -5
```

Expected: clean. If errors mention "Cannot find module './SkillsTab'" or similar, finish removing the imports.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src
git commit -m "feat(frontend): drop Workspace Settings Skills tab + ActiveSkillsBadges

The per-workspace skill picker is gone — manifests in
backend/src/config/skills/manifests.ts decide globally which
skills each generator uses. Skills are no longer a user-facing
configurable concept; ActiveSkillsBadges on Topics + Generate
pages reflected per-workspace state that doesn't exist anymore."
```

---

## Task 11: Schema migration — drop AiSkill + WorkspaceSkillMapping

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/prisma/schema.prisma`
- Delete: `/Users/bellinnn/Documents/projects/fce/backend/scripts/seed-skills.ts`

- [ ] **Step 1: Verify nothing references the models**

```bash
grep -rn "model AiSkill\|model WorkspaceSkillMapping\|prisma\.aiSkill\|prisma\.workspaceSkillMapping\|tx\.aiSkill\|tx\.workspaceSkillMapping\|AiSkill\b\|WorkspaceSkillMapping" /Users/bellinnn/Documents/projects/fce/backend
```

Expected: matches only in `prisma/schema.prisma` itself (the model definitions and the `Workspace.skillMappings` relation field). All code references should be gone after Tasks 3-8.

If anything else turns up, fix it before proceeding — don't drop tables that the live code still queries.

- [ ] **Step 2: Drop the models from schema**

In `backend/prisma/schema.prisma`:

1. Remove the `Workspace.skillMappings` relation field from the `Workspace` model (around line 83 — the line `skillMappings WorkspaceSkillMapping[]`).

2. Remove the `model AiSkill { ... }` block entirely (line 700-715).

3. Remove the `model WorkspaceSkillMapping { ... }` block entirely (line 717-730).

4. Remove the `// ─── AI Skills System ───` comment header line.

- [ ] **Step 3: Push the schema**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx prisma db push
```

Expected: prompts something like "The following table(s) will be dropped: ai_skills, workspace_skill_mappings. Apply this destructive change? (y/n)". Type `y`.

If you want to skip the prompt for a CI-friendly run:

```bash
bunx prisma db push --accept-data-loss
```

Use the prompt locally so a human approves the destructive change.

- [ ] **Step 4: Verify the drop**

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c "\dt public.ai_skills public.workspace_skill_mappings"
```

Expected: "Did not find any relations." for both. (Or just empty output if psql doesn't error.)

- [ ] **Step 5: Delete the seed script**

```bash
rm /Users/bellinnn/Documents/projects/fce/backend/scripts/seed-skills.ts
```

- [ ] **Step 6: Run tests + typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -3
```

Expected: tsc at baseline. Tests stay green.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/prisma/schema.prisma
git rm backend/scripts/seed-skills.ts
git commit -m "feat(db): drop AiSkill + WorkspaceSkillMapping tables

Skills now live in backend/src/config/skills/library/*.md, scoped
per-generator via manifests.ts. The DB-backed model is gone.
seed-skills.ts is dead — deleted.

AiProviderLog.skillIds keeps its column name but stores slugs
going forward; old rows with UUIDs stay as audit data."
```

---

## Task 12: Manual smoke verification (user-side)

No automated tests cover the live AI flow.

- [ ] **Step 1: Restart the backend with hot reload**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun run --hot src/index.ts
```

Watch the boot log for `Loaded 40 skills` (or however many are in `library/`). If the loader fails on a missing manifest slug, fix the manifest and restart.

- [ ] **Step 2: Smoke a topic generation**

In the browser, generate one topic. Backend logs should show the topic-generation job firing with skill context attached (look for the AI prompt content; the system prompt should include `### Skill: Content Strategy` etc.). The AI activity log row's `skillIds` column should contain slugs like `["content-strategy", "social-content"]`.

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c "SELECT generator, skill_ids FROM ai_provider_logs ORDER BY created_at DESC LIMIT 3;"
```

Expected: recent rows for `topic` show slugs in `skill_ids`.

- [ ] **Step 3: Smoke a content generation**

Same pattern. Verify `skill_ids` for the `content` generator log row holds slugs from the `content` manifest.

- [ ] **Step 4: Smoke brand-brain auto-fill**

Create a new brand using the URL auto-fill flow. The brand-scraping job runs. Check the AI provider log:

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c "SELECT generator, skill_ids FROM ai_provider_logs WHERE generator = 'brand_scraping' ORDER BY created_at DESC LIMIT 1;"
```

Expected: row exists with brandBrain manifest slugs in `skill_ids`. (Pre-task, this row had `null` or empty.)

- [ ] **Step 5: Smoke product-brain auto-fill**

On a brand, paste a product URL into the New Product form's Auto-fill. Check the log:

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c "SELECT generator, skill_ids FROM ai_provider_logs WHERE generator IN ('product_scraping', 'product_brain') ORDER BY created_at DESC LIMIT 2;"
```

Expected: rows show productBrain manifest slugs.

- [ ] **Step 6: Smoke chat @-mention**

Open the campaign chat. Type `@` and verify the autocomplete shows the chat manifest's skills (the names should look like "Copywriting", "Customer Research", etc. — derived from H1/title-case if frontmatter name was slug-equal).

Pick a skill, send a message. Check the chat message DB row (or the response) — `skillIds` should hold the slug of the selected skill. The AI response should reflect the skill's content.

- [ ] **Step 7: Verify Workspace Settings → Skills tab is GONE**

Navigate to Workspace Settings. Confirm there's no Skills tab. Check `/api/skills` returns 404 (the old route is gone) and `/api/skills/chat` returns the chat manifest's skills.

- [ ] **Step 8: Final sanity sweep**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -3
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
cd /Users/bellinnn/Documents/projects/fce/frontend && npx tsc -b
```

Expected: tests at baseline, tsc unchanged, frontend clean.

- [ ] **Step 9: (If smoke surfaces an issue)**

Fix and commit `fix(skills): <specific issue>`.

---

## Summary

- 12 tasks, ~75 steps total.
- Backend: ~12 files modified, 2 deleted (skill route + seed-skills script), one new dev dependency (`gray-matter`), 40 new markdown files in `config/skills/library/`.
- Frontend: 7 files modified, 4 components deleted (SkillsTab + Skill modals + ActiveSkillsBadges).
- 11 functional commits + 0–1 fix commits if smoke surfaces issues.
- 1 destructive Prisma migration (`AiSkill` + `WorkspaceSkillMapping` dropped).
- New behavior: brand-brain and product-brain auto-fill flows now read skills (didn't before).
