export interface IDocumentService {
	upload(
		workspaceId: string,
		brandId: string,
		file: File,
		productId?: string,
		sourceType?: string,
		userId?: string,
	): Promise<any>;
	listByBrand(brandId: string): Promise<any[]>;
	getById(id: string): Promise<any>;
	getChunks(documentId: string): Promise<any[]>;
	listByProduct(productId: string): Promise<any[]>;
	addLink(workspaceId: string, brandId: string, url: string, productId?: string, userId?: string): Promise<any>;
	delete(id: string): Promise<void>;
}
