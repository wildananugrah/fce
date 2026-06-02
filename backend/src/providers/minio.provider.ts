import {
	CreateBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";

export class MinioStorageProvider implements IStorageProvider {
	private client: S3Client;
	private endpoint: string;
	private publicUrl: string;
	private ensuredBuckets = new Set<string>();

	constructor(endpoint: string, accessKey: string, secretKey: string, publicUrl?: string) {
		this.endpoint = endpoint;
		this.publicUrl = publicUrl || endpoint;
		this.client = new S3Client({
			endpoint,
			region: "us-east-1",
			credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
			forcePathStyle: true,
		});
	}

	private async ensureBucket(bucket: string): Promise<"exists" | "created"> {
		if (this.ensuredBuckets.has(bucket)) return "exists";
		let created = false;
		try {
			await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
		} catch {
			try {
				await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
				created = true;
			} catch (createErr: unknown) {
				const code = (createErr as { name?: string }).name;
				if (code !== "BucketAlreadyOwnedByYou" && code !== "BucketAlreadyExists") {
					throw createErr;
				}
			}
		}
		this.ensuredBuckets.add(bucket);
		return created ? "created" : "exists";
	}

	async init(...buckets: string[]): Promise<Map<string, "exists" | "created">> {
		const results = new Map<string, "exists" | "created">();
		for (const bucket of buckets) {
			results.set(bucket, await this.ensureBucket(bucket));
		}
		return results;
	}

	async upload(bucket: string, key: string, data: Buffer, contentType: string): Promise<string> {
		await this.ensureBucket(bucket);
		await this.client.send(
			new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType }),
		);
		return this.getUrl(bucket, key);
	}

	getUrl(bucket: string, key: string): string {
		return `${this.publicUrl}/${bucket}/${key}`;
	}

	async delete(bucket: string, key: string): Promise<void> {
		await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
	}

	async getSignedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string> {
		const command = new GetObjectCommand({ Bucket: bucket, Key: key });
		const signed = await getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
		// The S3 client builds the URL from the internal endpoint (e.g. localhost:9002).
		// Replace it with the public URL so browsers and external callers can reach the file.
		return signed.replace(this.endpoint, this.publicUrl);
	}
}
