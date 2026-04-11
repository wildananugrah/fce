import type { PgBoss } from "pg-boss";
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";
import type { IDocumentRepository } from "../interfaces/repositories/document.repository.interface";
import type { IDocumentService } from "../interfaces/services/document.service.interface";

export class DocumentService implements IDocumentService {
	constructor(
		private documentRepository: IDocumentRepository,
		private storageProvider: IStorageProvider,
		private boss: PgBoss,
		private bucket: string,
	) {}

	async upload(
		workspaceId: string,
		brandId: string,
		file: File,
		productId?: string,
		sourceType?: string,
	) {
		const buffer = Buffer.from(await file.arrayBuffer());
		const key = `${workspaceId}/${brandId}/${Date.now()}-${file.name}`;
		const fileUrl = await this.storageProvider.upload(this.bucket, key, buffer, file.type);
		const doc = await this.documentRepository.create({
			workspaceId,
			brandId,
			productId: productId || null,
			fileName: file.name,
			fileType: file.type,
			fileUrl,
			fileSize: file.size,
			sourceType: sourceType || null,
		});
		await this.boss.send("document-extraction", {
			documentId: doc.id,
			fileUrl,
			fileName: file.name,
			fileType: file.type,
		});
		return doc;
	}

	async listByBrand(brandId: string) {
		return this.documentRepository.findByBrand(brandId);
	}

	async getById(id: string) {
		const doc = await this.documentRepository.findById(id);
		if (!doc) throw new Error("Document not found");
		return doc;
	}

	async getChunks(documentId: string) {
		return this.documentRepository.findChunksByDocument(documentId);
	}
}
