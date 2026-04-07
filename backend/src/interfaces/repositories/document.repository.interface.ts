export interface IDocumentRepository {
	create(data: {
		workspaceId: string;
		brandId: string;
		productId?: string | null;
		fileName: string;
		fileType: string;
		fileUrl: string;
		fileSize?: number | null;
		sourceType?: string | null;
	}): Promise<any>;
	findByWorkspace(workspaceId: string): Promise<any[]>;
	findByBrand(brandId: string): Promise<any[]>;
	findById(id: string): Promise<any | null>;
	updateExtractionStatus(id: string, status: string): Promise<any>;
	createChunks(
		documentId: string,
		chunks: { chunkIndex: number; contentText: string; metadataJson?: any; retrievalTags?: any }[],
	): Promise<void>;
	findChunksByDocument(documentId: string): Promise<any[]>;
	findChunksByBrand(brandId: string): Promise<any[]>;
}
