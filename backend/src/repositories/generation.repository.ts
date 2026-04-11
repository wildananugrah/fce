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
			where: { workspaceId },
			include: {
				brand: { select: { id: true, name: true } },
				product: { select: { id: true, name: true } },
			},
			orderBy: { createdAt: "desc" },
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

	async findOutputsByWorkspace(workspaceId: string, status?: string) {
		// Two-step query to avoid Prisma WASM "out of bounds" bug
		// with deeply nested includes + relation filters
		const requestIds = await this.prisma.generationRequest.findMany({
			where: { workspaceId },
			select: { id: true },
		});

		if (requestIds.length === 0) return [];

		return this.prisma.generationOutput.findMany({
			where: {
				requestId: { in: requestIds.map((r) => r.id) },
				...(status ? { status } : {}),
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
			orderBy: { createdAt: "desc" },
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
	}): Promise<OutputFeedbackEvent> {
		return this.prisma.outputFeedbackEvent.create({
			data,
		});
	}
}
