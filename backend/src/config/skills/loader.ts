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
