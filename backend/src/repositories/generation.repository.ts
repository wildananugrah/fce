import type {
	GenerationOutput,
	GenerationRequest,
	OutputFeedbackEvent,
	PrismaClient,
} from "@prisma/client";
import type { IGenerationRepository } from "../interfaces/repositories/generation.repository.interface";

export class GenerationRepository implements IGenerationRepository {
	constructor(private prisma: PrismaClient) {}

	async findByWorkspace(workspaceId: string) {
		return this.prisma.generationRequest.findMany({
			where: {
				workspaceId,
				archivedAt: null,
				brand: { archivedAt: null },
				// Content-generator list = "work in progress". We keep requests
				// that don't have outputs yet (pending / processing / failed
				// jobs) AND requests whose output is still in the "generated"
				// state — i.e. the user hasn't clicked Send to Library on them.
				// Outputs promoted to draft/in_review/approved/rejected live in
				// the Library now and should disappear from this list.
				OR: [
					{ outputs: { none: {} } },
					{ outputs: { some: { status: "generated" } } },
				],
			},
			include: {
				brand: { select: { id: true, name: true } },
				product: { select: { id: true, name: true } },
			},
			orderBy: { createdAt: "desc" },
		});
	}

	async findArchivedByWorkspace(workspaceId: string) {
		// Requests archived on their own — requests whose brand is archived
		// collapse under the brand row in trash.
		return this.prisma.generationRequest.findMany({
			where: {
				workspaceId,
				archivedAt: { not: null },
				brand: { archivedAt: null },
			},
			include: {
				brand: { select: { id: true, name: true } },
				product: { select: { id: true, name: true } },
			},
			orderBy: { archivedAt: "desc" },
		});
	}

	async findById(
		id: string,
	): Promise<(GenerationRequest & { outputs: GenerationOutput[] }) | null> {
		return this.prisma.generationRequest.findUnique({
			where: { id },
			include: {
				outputs: {
					include: {
						feedbackEvents: true,
						sections: { orderBy: { sectionOrder: "asc" } },
					},
				},
			},
		});
	}

	async deleteMany(workspaceId: string, ids: string[]): Promise<number> {
		const result = await this.prisma.generationRequest.deleteMany({
			where: { workspaceId, id: { in: ids } },
		});
		return result.count;
	}

	async archiveMany(workspaceId: string, ids: string[]): Promise<number> {
		const result = await this.prisma.generationRequest.updateMany({
			where: { workspaceId, id: { in: ids } },
			data: { archivedAt: new Date() },
		});
		return result.count;
	}

	async restoreMany(workspaceId: string, ids: string[]): Promise<number> {
		const result = await this.prisma.generationRequest.updateMany({
			where: { workspaceId, id: { in: ids } },
			data: { archivedAt: null },
		});
		return result.count;
	}

	async archiveManyOutputs(workspaceId: string, outputIds: string[]): Promise<number> {
		const result = await this.prisma.generationOutput.updateMany({
			where: { id: { in: outputIds }, request: { workspaceId } },
			data: { archivedAt: new Date() },
		});
		return result.count;
	}

	async restoreManyOutputs(workspaceId: string, outputIds: string[]): Promise<number> {
		const result = await this.prisma.generationOutput.updateMany({
			where: { id: { in: outputIds }, request: { workspaceId } },
			data: { archivedAt: null },
		});
		return result.count;
	}

	async create(data: {
		workspaceId: string;
		brandId: string;
		productId?: string;
		platform: string;
		contentType: string;
		framework: string;
		hookType: string;
		language?: string;
		prompt?: string;
	}): Promise<GenerationRequest> {
		return this.prisma.generationRequest.create({
			data: {
				...data,
				status: "pending",
			},
		});
	}

	async findOutputsByWorkspace(workspaceId: string, status?: string, projectId?: string) {
		// Two-step query to avoid Prisma WASM "out of bounds" bug
		// with deeply nested includes + relation filters. The first query
		// already narrows to live (non-archived) requests whose brand is also
		// live, so archived brands/products don't leak into the library.
		const brandFilter: { archivedAt: null; projectId?: string } = { archivedAt: null };
		if (projectId) brandFilter.projectId = projectId;
		const requestIds = await this.prisma.generationRequest.findMany({
			where: {
				workspaceId,
				archivedAt: null,
				brand: brandFilter,
			},
			select: { id: true },
		});

		if (requestIds.length === 0) return [];

		return this.prisma.generationOutput.findMany({
			where: {
				requestId: { in: requestIds.map((r) => r.id) },
				archivedAt: null,
				...(status
					? status.includes(",")
						? { status: { in: status.split(",") } }
						: { status }
					: {}),
			},
			include: {
				request: {
					include: {
						brand: { select: { id: true, name: true } },
						product: { select: { id: true, name: true } },
						contentTopic: { select: { pillar: true, publishDate: true } },
					},
				},
				sections: { orderBy: { sectionOrder: "asc" } },
			},
			orderBy: { createdAt: "desc" },
		});
	}

	async findArchivedOutputsByWorkspace(workspaceId: string) {
		// Outputs archived on their own, where the parent request + brand are
		// still live (otherwise the brand's own trash row collapses them).
		const requestIds = await this.prisma.generationRequest.findMany({
			where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
			select: { id: true },
		});
		if (requestIds.length === 0) return [];

		return this.prisma.generationOutput.findMany({
			where: {
				requestId: { in: requestIds.map((r) => r.id) },
				archivedAt: { not: null },
			},
			include: {
				request: {
					include: {
						brand: { select: { id: true, name: true } },
						product: { select: { id: true, name: true } },
					},
				},
				sections: { orderBy: { sectionOrder: "asc" } },
			},
			orderBy: { archivedAt: "desc" },
		});
	}

	async findOutputById(id: string): Promise<GenerationOutput | null> {
		return this.prisma.generationOutput.findUnique({
			where: { id },
		});
	}

	async updateOutput(id: string, data: { status: string }): Promise<GenerationOutput> {
		return this.prisma.generationOutput.update({
			where: { id },
			data,
		});
	}

	async updateManyOutputStatus(
		workspaceId: string,
		ids: string[],
		status: string,
	): Promise<number> {
		const result = await this.prisma.generationOutput.updateMany({
			where: {
				id: { in: ids },
				request: { workspaceId },
			},
			data: { status },
		});
		return result.count;
	}

	async deleteManyOutputs(workspaceId: string, ids: string[]): Promise<number> {
		const result = await this.prisma.generationOutput.deleteMany({
			where: {
				id: { in: ids },
				request: { workspaceId },
			},
		});
		return result.count;
	}

	async addFeedback(data: {
		outputId: string;
		eventType: string;
		before?: any;
		after?: any;
		userId?: string;
		note?: string;
	}): Promise<OutputFeedbackEvent> {
		return this.prisma.outputFeedbackEvent.create({
			data,
		});
	}

	async findStatusChangesByOutput(outputId: string) {
		const events = await this.prisma.outputFeedbackEvent.findMany({
			where: { outputId, eventType: "status_change" },
			orderBy: { createdAt: "desc" },
		});
		const userIds = Array.from(
			new Set(events.map((e) => e.userId).filter((id): id is string => !!id)),
		);
		const users =
			userIds.length > 0
				? await this.prisma.user.findMany({
						where: { id: { in: userIds } },
						select: { id: true, fullName: true, email: true },
					})
				: [];
		const userMap = new Map(users.map((u) => [u.id, u]));
		return events.map((e) => ({
			...e,
			user: e.userId ? (userMap.get(e.userId) ?? null) : null,
		}));
	}

	async findDefaultProjectId(workspaceId: string): Promise<string | null> {
		const project = await this.prisma.project.findFirst({
			where: { workspaceId, slug: "default" },
			select: { id: true },
		});
		return project?.id ?? null;
	}
}
