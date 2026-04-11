import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const CATEGORY_MAP: Record<string, string> = {
	"content-strategy": "strategy",
	"launch-strategy": "strategy",
	"marketing-ideas": "strategy",
	"pricing-strategy": "strategy",
	copywriting: "content",
	"copy-editing": "content",
	"social-content": "content",
	"ad-creative": "content",
	"ai-seo": "seo",
	"seo-audit": "seo",
	"programmatic-seo": "seo",
	"schema-markup": "seo",
	"site-architecture": "seo",
	"page-cro": "conversion",
	"form-cro": "conversion",
	"popup-cro": "conversion",
	"signup-flow-cro": "conversion",
	"onboarding-cro": "conversion",
	"paywall-upgrade-cro": "conversion",
	"ab-test-setup": "conversion",
	"cold-email": "outreach",
	"email-sequence": "outreach",
	"lead-magnets": "outreach",
	"paid-ads": "outreach",
	"customer-research": "research",
	"competitor-alternatives": "research",
	"marketing-psychology": "research",
	"product-marketing-context": "research",
	"churn-prevention": "growth",
	"referral-program": "growth",
	"free-tool-strategy": "growth",
	"community-marketing": "growth",
	revops: "growth",
	"sales-enablement": "growth",
	"analytics-tracking": "growth",
};

function parseFrontmatter(content: string): { name: string; description: string; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) return { name: "", description: "", body: content };

	const frontmatter = match[1];
	const body = match[2].trim();

	let name = "";
	let description = "";

	// Parse name
	const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
	if (nameMatch) name = nameMatch[1].trim();

	// Parse description (may be multi-line quoted)
	const descMatch = frontmatter.match(/^description:\s*"?([\s\S]*?)(?:"\s*$|\n\w)/m);
	if (descMatch) {
		description = descMatch[1].trim().replace(/^["']|["']$/g, "");
	}

	return { name, description, body };
}

async function main() {
	const skillsDir = join(import.meta.dir, "../data/marketing-skills");
	const dirs = await readdir(skillsDir);

	let created = 0;
	let updated = 0;

	for (const dir of dirs.sort()) {
		const skillPath = join(skillsDir, dir, "SKILL.md");
		let skillContent: string;
		try {
			skillContent = await readFile(skillPath, "utf-8");
		} catch {
			continue; // Skip if no SKILL.md
		}

		const { name, description, body } = parseFrontmatter(skillContent);
		const slug = dir;
		const category = CATEGORY_MAP[slug] ?? "other";

		// Read reference files
		const refsDir = join(skillsDir, dir, "references");
		const referenceFiles: { name: string; content: string }[] = [];
		try {
			const refFiles = await readdir(refsDir);
			for (const refFile of refFiles.sort()) {
				if (!refFile.endsWith(".md")) continue;
				const refContent = await readFile(join(refsDir, refFile), "utf-8");
				referenceFiles.push({ name: refFile.replace(".md", ""), content: refContent });
			}
		} catch {
			// No references directory
		}

		const displayName = name || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

		const existing = await prisma.aiSkill.findUnique({ where: { slug } });
		if (existing) {
			await prisma.aiSkill.update({
				where: { slug },
				data: {
					name: displayName,
					description: description || `${displayName} marketing skill`,
					content: body,
					category,
					referenceFiles: referenceFiles.length > 0 ? referenceFiles : undefined,
					isSystem: true,
				},
			});
			updated++;
		} else {
			await prisma.aiSkill.create({
				data: {
					slug,
					name: displayName,
					description: description || `${displayName} marketing skill`,
					content: body,
					category,
					referenceFiles: referenceFiles.length > 0 ? referenceFiles : undefined,
					isSystem: true,
				},
			});
			created++;
		}

		console.log(`  ${existing ? "Updated" : "Created"}: ${slug} (${category})`);
	}

	console.log(`\nDone! Created: ${created}, Updated: ${updated}`);
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());
