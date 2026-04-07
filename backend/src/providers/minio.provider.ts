import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";

export class MinioStorageProvider implements IStorageProvider {
	private client: S3Client;
	private endpoint: string;

	constructor(endpoint: string, accessKey: string, secretKey: string) {
		this.endpoint = endpoint;
		this.client = new S3Client({
			endpoint,
			region: "us-east-1",
			credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
			forcePathStyle: true,
		});
	}

	async upload(bucket: string, key: string, data: Buffer, contentType: string): Promise<string> {
		await this.client.send(
			new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType }),
		);
		return this.getUrl(bucket, key);
	}

	getUrl(bucket: string, key: string): string {
		return `${this.endpoint}/${bucket}/${key}`;
	}

	async delete(bucket: string, key: string): Promise<void> {
		await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
	}
}
