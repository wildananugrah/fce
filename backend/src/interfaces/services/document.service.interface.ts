export interface IDocumentService {
	upload(
		workspaceId: string,
		brandId: string,
		file: File,
		productId?: string,
		sourceType?: string,
	): Promise<any>;
	listByBrand(brandId: string): Promise<any[]>;
	getById(id: string): Promise<any>;
	getChunks(documentId: string): Promise<any[]>;
}
