export interface IStorageProvider {
	upload(bucket: string, key: string, data: Buffer, contentType: string): Promise<string>;
	getUrl(bucket: string, key: string): string;
	delete(bucket: string, key: string): Promise<void>;
}
