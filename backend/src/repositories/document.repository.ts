import type { PrismaClient } from "@prisma/client";
import type { IDocumentRepository } from "../interfaces/repositories/document.repository.interface";

export class DocumentRepository implements IDocumentRepository {
	constructor(private prisma: PrismaClient) {}

	async create(data: any) {
		return this.prisma.brandDocument.create({ data });
	}

	async findByWorkspace(workspaceId: string) {
		return this.prisma.brandDocument.findMany({
			where: { workspaceId },
			orderBy: { createdAt: "desc" },
		});
	}

	async findByBrand(brandId: string) {
		return this.prisma.brandDocument.findMany({
			where: { brandId },
			orderBy: { createdAt: "desc" },
		});
	}

	async findById(id: string) {
		return this.prisma.brandDocument.findUnique({
			where: { id },
			include: { chunks: { orderBy: { chunkIndex: "asc" } } },
		});
	}

	async updateExtractionStatus(id: string, status: string) {
		return this.prisma.brandDocument.update({ where: { id }, data: { extractionStatus: status } });
	}

	async createChunks(documentId: string, chunks: any[]) {
		await this.prisma.documentChunk.createMany({
			data: chunks.map((c) => ({
				documentId,
				chunkIndex: c.chunkIndex,
				contentText: c.contentText,
				metadataJson: c.metadataJson || null,
				retrievalTags: c.retrievalTags || null,
			})),
		});
	}

	async findChunksByDocument(documentId: string) {
		return this.prisma.documentChunk.findMany({
			where: { documentId },
			orderBy: { chunkIndex: "asc" },
		});
	}

	async findChunksByBrand(brandId: string) {
		return this.prisma.documentChunk.findMany({
			where: { document: { brandId } },
			orderBy: { chunkIndex: "asc" },
		});
	}

	async findByProduct(productId: string) {
		return this.prisma.brandDocument.findMany({
			where: { productId },
			orderBy: { createdAt: "desc" },
			include: { chunks: { orderBy: { chunkIndex: "asc" } } },
		});
	}

	async delete(id: string) {
		await this.prisma.brandDocument.delete({ where: { id } });
	}
}
