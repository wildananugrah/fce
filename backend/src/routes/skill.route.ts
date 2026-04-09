import { Hono } from "hono";
import type { PrismaClient } from "@prisma/client";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

// ─── Global Skills Routes (/api/skills) ─────────────────────────

export function createSkillRoutes(prisma: PrismaClient) {
	const app = new Hono();

	// GET / — List all skills
	app.get("/", async (c) => {
		const search = c.req.query("search") ?? "";
		const category = c.req.query("category") ?? "";

		const where: Record<string, unknown> = {};
		if (search) {
			where.OR = [
				{ name: { contains: search, mode: "insensitive" } },
				{ description: { contains: search, mode: "insensitive" } },
				{ slug: { contains: search, mode: "insensitive" } },
			];
		}
		if (category) {
			where.category = category;
		}

		const skills = await prisma.aiSkill.findMany({
			where: where as any,
			orderBy: [{ category: "asc" }, { name: "asc" }],
			select: {
				id: true,
				slug: true,
				name: true,
				description: true,
				category: true,
				isSystem: true,
				createdAt: true,
			},
		});
		return c.json({ data: skills });
	});

	// GET /:id — Get skill detail
	app.get("/:id", async (c) => {
		const skill = await prisma.aiSkill.findUnique({ where: { id: c.req.param("id") } });
		if (!skill) return c.json({ error: "Skill not found" }, 404);
		return c.json({ data: skill });
	});

	// POST / — Create custom skill
	app.post("/", async (c) => {
		const body = await c.req.json();
		const { name, slug, description, content, category } = body;

		if (!name || !content) {
			return c.json({ error: "name and content are required" }, 400);
		}

		const skillSlug = slug || name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

		const skill = await prisma.aiSkill.create({
			data: {
				slug: skillSlug,
				name: name.trim(),
				description: (description ?? "").trim(),
				content: content.trim(),
				category: category ?? "other",
				isSystem: false,
			},
		});
		return c.json({ data: skill }, 201);
	});

	// PATCH /:id — Update skill (custom only)
	app.patch("/:id", async (c) => {
		const existing = await prisma.aiSkill.findUnique({ where: { id: c.req.param("id") } });
		if (!existing) return c.json({ error: "Skill not found" }, 404);

		const body = await c.req.json();
		const skill = await prisma.aiSkill.update({
			where: { id: c.req.param("id") },
			data: {
				name: body.name?.trim() ?? existing.name,
				description: body.description?.trim() ?? existing.description,
				content: body.content?.trim() ?? existing.content,
				category: body.category ?? existing.category,
			},
		});
		return c.json({ data: skill });
	});

	// DELETE /:id — Delete custom skill only
	app.delete("/:id", async (c) => {
		const existing = await prisma.aiSkill.findUnique({ where: { id: c.req.param("id") } });
		if (!existing) return c.json({ error: "Skill not found" }, 404);
		if (existing.isSystem) return c.json({ error: "Cannot delete system skills" }, 403);

		await prisma.aiSkill.delete({ where: { id: c.req.param("id") } });
		return c.json({ data: { success: true } });
	});

	return app;
}

// ─── Workspace Skill Mapping Routes (/api/workspaces/:id/skills) ──

export function createWorkspaceSkillRoutes(prisma: PrismaClient) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — List workspace skill mappings (grouped by generator)
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const mappings = await prisma.workspaceSkillMapping.findMany({
			where: { workspaceId },
			include: {
				skill: {
					select: { id: true, slug: true, name: true, description: true, category: true },
				},
			},
			orderBy: { skill: { name: "asc" } },
		});
		return c.json({ data: mappings });
	});

	// GET /generator/:generator — Get active skills for a specific generator
	app.get("/generator/:generator", async (c) => {
		const workspaceId = c.get("workspaceId");
		const generator = c.req.param("generator");

		const mappings = await prisma.workspaceSkillMapping.findMany({
			where: { workspaceId, generator, isActive: true },
			include: { skill: true },
			orderBy: { skill: { name: "asc" } },
		});
		return c.json({ data: mappings });
	});

	// POST /map — Map a skill to a generator
	app.post("/map", async (c) => {
		const workspaceId = c.get("workspaceId");
		const body = await c.req.json();
		const { skillId, generator } = body;

		if (!skillId || !generator) {
			return c.json({ error: "skillId and generator are required" }, 400);
		}
		if (!["topic", "content", "campaign"].includes(generator)) {
			return c.json({ error: "generator must be topic, content, or campaign" }, 400);
		}

		// Check if skill exists
		const skill = await prisma.aiSkill.findUnique({ where: { id: skillId } });
		if (!skill) return c.json({ error: "Skill not found" }, 404);

		// Upsert mapping
		const mapping = await prisma.workspaceSkillMapping.upsert({
			where: {
				workspaceId_skillId_generator: { workspaceId, skillId, generator },
			},
			update: { isActive: true },
			create: { workspaceId, skillId, generator, isActive: true },
			include: {
				skill: {
					select: { id: true, slug: true, name: true, description: true, category: true },
				},
			},
		});
		return c.json({ data: mapping }, 201);
	});

	// DELETE /map/:mappingId — Remove a mapping
	app.delete("/map/:mappingId", async (c) => {
		const workspaceId = c.get("workspaceId");
		const mappingId = c.req.param("mappingId");

		const mapping = await prisma.workspaceSkillMapping.findFirst({
			where: { id: mappingId, workspaceId },
		});
		if (!mapping) return c.json({ error: "Mapping not found" }, 404);

		await prisma.workspaceSkillMapping.delete({ where: { id: mappingId } });
		return c.json({ data: { success: true } });
	});

	return app;
}
