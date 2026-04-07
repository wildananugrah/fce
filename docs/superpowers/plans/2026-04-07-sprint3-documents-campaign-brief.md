# Sprint 3: Document Ingestion & Campaign Brief Builder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable PDF/DOCX/TXT file uploads with text extraction and chunking for brand context enrichment. Build a structured 13-field campaign brief that feeds into AI strategy generation with decomposed output sections (channel roles, deliverables).

**Architecture:** Files stored in MinIO (S3-compatible, already configured). Extraction runs async via pg-boss. Campaign brief is a separate model linked to campaign. Strategy output decomposed into CampaignChannelRole and CampaignDeliverable records.

**Tech Stack:** Prisma 7, Bun, Hono, MinIO, pg-boss, pdf-parse, mammoth, React 19, Tailwind CSS 4

**Prerequisite:** Sprint 1 must be completed (BrandDocument, DocumentChunk, CampaignBrief, CampaignChannelRole, CampaignDeliverable models exist in schema).

---

## Task 1: Install Document Parsing Dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install pdf-parse and mammoth**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun add pdf-parse mammoth @aws-sdk/client-s3`

- [ ] **Step 2: Verify installation**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun run -e "require('pdf-parse'); require('mammoth'); console.log('OK')"`
Expected: "OK"

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/package.json backend/bun.lock
git commit -m "feat: add pdf-parse, mammoth, and S3 client for document ingestion"
```

---

## Task 2: MinIO Storage Provider

**Files:**
- Create: `backend/src/providers/minio.provider.ts`
- Create: `backend/src/interfaces/providers/storage.provider.interface.ts`

- [ ] **Step 1: Create storage provider interface**

Create `backend/src/interfaces/providers/storage.provider.interface.ts`:

```typescript
export interface IStorageProvider {
	upload(bucket: string, key: string, data: Buffer, contentType: string): Promise<string>;
	getUrl(bucket: string, key: string): string;
	delete(bucket: string, key: string): Promise<void>;
}
```

- [ ] **Step 2: Create MinIO storage provider**

Create `backend/src/providers/minio.provider.ts`:

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";

export class MinioStorageProvider implements IStorageProvider {
	private client: S3Client;
	private endpoint: string;

	constructor(endpoint: string, accessKey: string, secretKey: string) {
		this.endpoint = endpoint;
		this.client = new S3Client({
			endpoint,
			region: "us-east-1",
			credentials: {
				accessKeyId: accessKey,
				secretAccessKey: secretKey,
			},
			forcePathStyle: true,
		});
	}

	async upload(bucket: string, key: string, data: Buffer, contentType: string): Promise<string> {
		await this.client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				Body: data,
				ContentType: contentType,
			}),
		);
		return this.getUrl(bucket, key);
	}

	getUrl(bucket: string, key: string): string {
		return `${this.endpoint}/${bucket}/${key}`;
	}

	async delete(bucket: string, key: string): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: key,
			}),
		);
	}
}
```

- [ ] **Step 3: Add MinIO env vars to utils/env.ts**

In `backend/src/utils/env.ts`, add:

```typescript
	minioEndpoint: process.env.MINIO_ENDPOINT || "http://localhost:9000",
	minioAccessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
	minioSecretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
	minioBucket: process.env.MINIO_BUCKET || "fce-documents",
```

- [ ] **Step 4: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/providers/minio.provider.ts \
        backend/src/interfaces/providers/storage.provider.interface.ts \
        backend/src/utils/env.ts
git commit -m "feat: add MinIO storage provider for document uploads"
```

---

## Task 3: Document Repository Layer

**Files:**
- Create: `backend/src/interfaces/repositories/document.repository.interface.ts`
- Create: `backend/src/repositories/document.repository.ts`

- [ ] **Step 1: Create document repository interface**

Create `backend/src/interfaces/repositories/document.repository.interface.ts`:

```typescript
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
```

- [ ] **Step 2: Create document repository implementation**

Create `backend/src/repositories/document.repository.ts`:

```typescript
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
		return this.prisma.brandDocument.update({
			where: { id },
			data: { extractionStatus: status },
		});
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
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/interfaces/repositories/document.repository.interface.ts \
        backend/src/repositories/document.repository.ts
git commit -m "feat: add document repository for BrandDocument and DocumentChunk"
```

---

## Task 4: Document Service and Route

**Files:**
- Create: `backend/src/interfaces/services/document.service.interface.ts`
- Create: `backend/src/services/document.service.ts`
- Create: `backend/src/routes/document.route.ts`
- Create: `backend/src/types/document.types.ts`

- [ ] **Step 1: Create document types**

Create `backend/src/types/document.types.ts`:

```typescript
export interface UploadDocumentInput {
	brandId: string;
	productId?: string;
	sourceType?: string;
}
```

- [ ] **Step 2: Create document service interface**

Create `backend/src/interfaces/services/document.service.interface.ts`:

```typescript
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
```

- [ ] **Step 3: Create document service**

Create `backend/src/services/document.service.ts`:

```typescript
import type { PgBoss } from "pg-boss";
import type { IDocumentRepository } from "../interfaces/repositories/document.repository.interface";
import type { IDocumentService } from "../interfaces/services/document.service.interface";
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";

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
```

- [ ] **Step 4: Create document route**

Create `backend/src/routes/document.route.ts`:

```typescript
import { Hono } from "hono";
import type { IDocumentService } from "../interfaces/services/document.service.interface";

export function createDocumentRoutes(documentService: IDocumentService) {
	const app = new Hono();

	app.post("/upload", async (c) => {
		const workspaceId = c.get("workspaceId" as any);
		const formData = await c.req.parseBody();
		const file = formData.file as File;
		const brandId = formData.brandId as string;
		const productId = (formData.productId as string) || undefined;
		const sourceType = (formData.sourceType as string) || undefined;

		if (!file || !brandId) {
			return c.json({ error: "file and brandId are required" }, 400);
		}

		const doc = await documentService.upload(workspaceId, brandId, file, productId, sourceType);
		return c.json({ data: doc }, 201);
	});

	app.get("/brand/:brandId", async (c) => {
		const brandId = c.req.param("brandId");
		const docs = await documentService.listByBrand(brandId);
		return c.json({ data: docs });
	});

	app.get("/:id", async (c) => {
		const id = c.req.param("id");
		const doc = await documentService.getById(id);
		return c.json({ data: doc });
	});

	app.get("/:id/chunks", async (c) => {
		const id = c.req.param("id");
		const chunks = await documentService.getChunks(id);
		return c.json({ data: chunks });
	});

	return app;
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/types/document.types.ts \
        backend/src/interfaces/services/document.service.interface.ts \
        backend/src/services/document.service.ts \
        backend/src/routes/document.route.ts
git commit -m "feat: add document service and routes for file upload and retrieval"
```

---

## Task 5: Document Extraction Job

**Files:**
- Create: `backend/src/jobs/document-extraction.job.ts`

- [ ] **Step 1: Create document extraction job**

Create `backend/src/jobs/document-extraction.job.ts`:

```typescript
import type { IDocumentRepository } from "../interfaces/repositories/document.repository.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

export class DocumentExtractionJob {
	constructor(
		private documentRepository: IDocumentRepository,
		private logger: ILogger,
	) {}

	async handle(data: { documentId: string; fileUrl: string; fileName: string; fileType: string }) {
		const { documentId, fileUrl, fileName, fileType } = data;

		try {
			this.logger.info("Starting document extraction", { documentId, fileName });
			await this.documentRepository.updateExtractionStatus(documentId, "processing");

			let text = "";

			if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
				text = await this.extractPdf(fileUrl);
			} else if (
				fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
				fileName.endsWith(".docx")
			) {
				text = await this.extractDocx(fileUrl);
			} else if (fileType === "text/plain" || fileName.endsWith(".txt")) {
				text = await this.extractText(fileUrl);
			} else {
				throw new Error(`Unsupported file type: ${fileType}`);
			}

			const chunks = this.chunkText(text, 500, 50);

			await this.documentRepository.createChunks(
				documentId,
				chunks.map((content, index) => ({
					chunkIndex: index,
					contentText: content,
				})),
			);

			await this.documentRepository.updateExtractionStatus(documentId, "completed");
			this.logger.info("Document extraction completed", { documentId, chunkCount: chunks.length });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error("Document extraction failed", { documentId, error: message });
			await this.documentRepository.updateExtractionStatus(documentId, "failed");
		}
	}

	private async extractPdf(fileUrl: string): Promise<string> {
		const response = await fetch(fileUrl);
		const buffer = Buffer.from(await response.arrayBuffer());
		const pdfParse = (await import("pdf-parse")).default;
		const result = await pdfParse(buffer);
		return result.text;
	}

	private async extractDocx(fileUrl: string): Promise<string> {
		const response = await fetch(fileUrl);
		const buffer = Buffer.from(await response.arrayBuffer());
		const mammoth = await import("mammoth");
		const result = await mammoth.extractRawText({ buffer });
		return result.value;
	}

	private async extractText(fileUrl: string): Promise<string> {
		const response = await fetch(fileUrl);
		return response.text();
	}

	private chunkText(text: string, chunkSize: number, overlap: number): string[] {
		const words = text.split(/\s+/).filter((w) => w.length > 0);
		if (words.length <= chunkSize) return [words.join(" ")];

		const chunks: string[] = [];
		let start = 0;

		while (start < words.length) {
			const end = Math.min(start + chunkSize, words.length);
			chunks.push(words.slice(start, end).join(" "));
			start += chunkSize - overlap;
		}

		return chunks;
	}
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/jobs/document-extraction.job.ts
git commit -m "feat: add document extraction job for PDF, DOCX, and TXT files"
```

---

## Task 6: Wire Document System into Composition Root

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Add imports**

Add to `backend/src/index.ts`:

```typescript
import { DocumentRepository } from "./repositories/document.repository";
import { DocumentService } from "./services/document.service";
import { DocumentExtractionJob } from "./jobs/document-extraction.job";
import { MinioStorageProvider } from "./providers/minio.provider";
import { createDocumentRoutes } from "./routes/document.route";
```

- [ ] **Step 2: Instantiate document dependencies**

After the existing repository instantiations:

```typescript
	const documentRepository = new DocumentRepository(prisma);
	const storageProvider = new MinioStorageProvider(env.minioEndpoint, env.minioAccessKey, env.minioSecretKey);
```

After the existing service instantiations:

```typescript
	const documentService = new DocumentService(documentRepository, storageProvider, boss, env.minioBucket);
```

After the existing job handler instantiations:

```typescript
	const documentExtractionJob = new DocumentExtractionJob(documentRepository, logger);
```

- [ ] **Step 3: Register queue and worker**

After the existing queue creation:

```typescript
	await boss.createQueue("document-extraction");
```

After the existing worker registrations:

```typescript
	await boss.work("document-extraction", async (jobs) => {
		for (const job of jobs) await documentExtractionJob.handle(job.data as any);
	});
```

- [ ] **Step 4: Register document routes**

In the workspace-scoped routes section:

```typescript
	workspaceScoped.route("/documents", createDocumentRoutes(documentService));
```

Add "Document not found" to the `knownErrors` array.

- [ ] **Step 5: Run all tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/index.ts
git commit -m "feat: wire document upload, extraction, and storage into composition root"
```

---

## Task 7: Campaign Brief Repository Extensions

**Files:**
- Modify: `backend/src/repositories/campaign.repository.ts`
- Modify: `backend/src/interfaces/repositories/campaign.repository.interface.ts`

- [ ] **Step 1: Extend campaign repository interface**

Add to `backend/src/interfaces/repositories/campaign.repository.interface.ts`:

```typescript
	createBrief(campaignId: string, data: any): Promise<any>;
	findBriefByCampaign(campaignId: string): Promise<any | null>;
	createChannelRoles(campaignOutputId: string, roles: any[]): Promise<void>;
	createDeliverables(campaignOutputId: string, deliverables: any[]): Promise<void>;
```

- [ ] **Step 2: Implement brief methods in campaign repository**

Add to `backend/src/repositories/campaign.repository.ts`:

```typescript
	async createBrief(campaignId: string, data: any) {
		return this.prisma.campaignBrief.create({
			data: { campaignId, ...data },
		});
	}

	async findBriefByCampaign(campaignId: string) {
		return this.prisma.campaignBrief.findFirst({
			where: { campaignId },
			orderBy: { createdAt: "desc" },
		});
	}

	async createChannelRoles(campaignOutputId: string, roles: any[]) {
		await this.prisma.campaignChannelRole.createMany({
			data: roles.map((r: any) => ({
				campaignOutputId,
				channelCode: r.channelCode,
				channelRole: r.channelRole,
				priorityOrder: r.priorityOrder,
			})),
		});
	}

	async createDeliverables(campaignOutputId: string, deliverables: any[]) {
		await this.prisma.campaignDeliverable.createMany({
			data: deliverables.map((d: any) => ({
				campaignOutputId,
				deliverableType: d.deliverableType,
				deliverableName: d.deliverableName,
				recommendedChannel: d.recommendedChannel || null,
				funnelStage: d.funnelStage || null,
				qtyRecommendation: d.qtyRecommendation || null,
			})),
		});
	}
```

- [ ] **Step 3: Update findById to include briefs, channel roles, deliverables**

Update the `findById` method in campaign repository:

```typescript
	async findById(id: string) {
		return this.prisma.campaign.findUnique({
			where: { id },
			include: {
				outputs: {
					include: {
						channelRoleRecords: { orderBy: { priorityOrder: "asc" } },
						deliverables: true,
						feedbackEvents: true,
					},
				},
				briefs: { orderBy: { createdAt: "desc" } },
			},
		});
	}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/repositories/campaign.repository.ts \
        backend/src/interfaces/repositories/campaign.repository.interface.ts
git commit -m "feat: extend campaign repository with brief, channel roles, deliverables"
```

---

## Task 8: Campaign Brief Route and Service Extensions

**Files:**
- Modify: `backend/src/routes/campaign.route.ts`
- Modify: `backend/src/services/campaign.service.ts`
- Modify: `backend/src/types/campaign.types.ts`

- [ ] **Step 1: Add brief input type**

In `backend/src/types/campaign.types.ts`, add:

```typescript
export interface CreateCampaignBriefInput {
	objectiveDetail?: string;
	channelMix?: string[];
	mandatoryDeliverables?: string[];
	culturalContext?: string;
	trendContext?: string;
	competitiveContext?: string;
	kpiPreference?: Record<string, any>;
	toneDirection?: string;
}
```

- [ ] **Step 2: Add brief endpoints to campaign route**

In `backend/src/routes/campaign.route.ts`, add:

```typescript
	// Create campaign brief
	app.post("/:id/brief", async (c) => {
		const campaignId = c.req.param("id");
		const body = await c.req.json();
		const brief = await campaignService.createBrief(campaignId, body);
		return c.json({ data: brief }, 201);
	});

	// Get campaign brief
	app.get("/:id/brief", async (c) => {
		const campaignId = c.req.param("id");
		const brief = await campaignService.getBrief(campaignId);
		return c.json({ data: brief });
	});

	// Generate strategy from brief
	app.post("/:id/generate-strategy", async (c) => {
		const campaignId = c.req.param("id");
		const userId = c.get("userId" as any);
		await campaignService.generateStrategy(campaignId, userId);
		return c.json({ data: { message: "Strategy generation started" } });
	});
```

- [ ] **Step 3: Add brief methods to campaign service**

In `backend/src/services/campaign.service.ts`, add:

```typescript
	async createBrief(campaignId: string, input: any) {
		const campaign = await this.campaignRepository.findById(campaignId);
		if (!campaign) throw new Error("Campaign not found");

		return this.campaignRepository.createBrief(campaignId, {
			objectiveDetail: input.objectiveDetail || null,
			channelMix: input.channelMix || null,
			mandatoryDeliverables: input.mandatoryDeliverables || null,
			culturalContext: input.culturalContext || null,
			trendContext: input.trendContext || null,
			competitiveContext: input.competitiveContext || null,
			kpiPreference: input.kpiPreference || null,
			toneDirection: input.toneDirection || null,
		});
	}

	async getBrief(campaignId: string) {
		return this.campaignRepository.findBriefByCampaign(campaignId);
	}

	async generateStrategy(campaignId: string, userId: string) {
		const campaign = await this.campaignRepository.findById(campaignId);
		if (!campaign) throw new Error("Campaign not found");

		await this.boss.send("campaign-generation", {
			campaignId,
			userId,
		});
	}
```

- [ ] **Step 4: Run all tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/routes/campaign.route.ts \
        backend/src/services/campaign.service.ts \
        backend/src/types/campaign.types.ts
git commit -m "feat: add campaign brief endpoints and strategy generation trigger"
```

---

## Task 9: Update Campaign Generation Job to Save Channel Roles and Deliverables

**Files:**
- Modify: `backend/src/jobs/campaign-generation.job.ts`

- [ ] **Step 1: Update job to parse strategy output into structured records**

In `backend/src/jobs/campaign-generation.job.ts`, after saving `CampaignOutput`, parse the AI response to create `CampaignChannelRole` and `CampaignDeliverable` records.

Add campaign repository as constructor dependency if not already present.

After the output is created, add:

```typescript
		// Parse channel roles from AI response
		if (result.channelRoles && Array.isArray(result.channelRoles)) {
			try {
				await this.prisma.campaignChannelRole.createMany({
					data: result.channelRoles.map((role: any, idx: number) => ({
						campaignOutputId: output.id,
						channelCode: role.channel || role.channelCode || "",
						channelRole: role.role || role.channelRole || "",
						priorityOrder: idx,
					})),
				});
			} catch (e) {
				this.logger.warn("Failed to save channel roles", { error: String(e) });
			}
		}

		// Parse deliverables from AI response
		if (result.deliverables && Array.isArray(result.deliverables)) {
			try {
				await this.prisma.campaignDeliverable.createMany({
					data: result.deliverables.map((d: any) => ({
						campaignOutputId: output.id,
						deliverableType: d.type || d.deliverableType || "",
						deliverableName: d.name || d.deliverableName || "",
						recommendedChannel: d.channel || d.recommendedChannel || null,
						funnelStage: d.funnelStage || null,
						qtyRecommendation: d.qty || d.qtyRecommendation || null,
					})),
				});
			} catch (e) {
				this.logger.warn("Failed to save deliverables", { error: String(e) });
			}
		}
```

- [ ] **Step 2: Run all tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/jobs/campaign-generation.job.ts
git commit -m "feat: decompose campaign AI output into channel roles and deliverables"
```

---

## Task 10: Frontend — Document Upload Component

**Files:**
- Create: `frontend/src/components/documents/DocumentUpload.tsx`
- Create: `frontend/src/components/documents/DocumentList.tsx`

- [ ] **Step 1: Create DocumentUpload component**

Create `frontend/src/components/documents/DocumentUpload.tsx`:

```tsx
import { useState, useRef } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import { Toast } from "../ui/Toast";

interface DocumentUploadProps {
	workspaceId: string;
	brandId: string;
	productId?: string;
	onUploaded: () => void;
}

export function DocumentUpload({ workspaceId, brandId, productId, onUploaded }: DocumentUploadProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

	const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
		if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|docx|txt)$/i)) {
			setToast({ message: "Only PDF, DOCX, and TXT files are supported", type: "error" });
			return;
		}

		setUploading(true);
		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("brandId", brandId);
			if (productId) formData.append("productId", productId);

			await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/workspaces/${workspaceId}/documents/upload`, {
				method: "POST",
				headers: { Authorization: `Bearer ${localStorage.getItem("accessToken") || ""}` },
				body: formData,
			});

			setToast({ message: "Document uploaded. Extraction in progress...", type: "success" });
			onUploaded();
		} catch {
			setToast({ message: "Upload failed", type: "error" });
		} finally {
			setUploading(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	};

	return (
		<div>
			<input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" />
			<Button size="sm" onClick={() => fileInputRef.current?.click()} loading={uploading}>
				Upload Document
			</Button>
			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
		</div>
	);
}
```

- [ ] **Step 2: Create DocumentList component**

Create `frontend/src/components/documents/DocumentList.tsx`:

```tsx
import { Badge } from "../ui/Badge";

interface Document {
	id: string;
	fileName: string;
	fileType: string;
	fileSize: number | null;
	extractionStatus: string;
	createdAt: string;
}

interface DocumentListProps {
	documents: Document[];
}

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger"> = {
	pending: "default",
	processing: "warning",
	completed: "success",
	failed: "danger",
};

export function DocumentList({ documents }: DocumentListProps) {
	if (documents.length === 0) {
		return <p className="text-xs text-gray-400">No documents uploaded yet.</p>;
	}

	return (
		<div className="space-y-2">
			{documents.map((doc) => (
				<div key={doc.id} className="flex items-center justify-between py-2 px-3 border border-gray-100 rounded-lg">
					<div>
						<p className="text-sm font-medium">{doc.fileName}</p>
						<p className="text-xs text-gray-400">
							{doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : ""} &middot;{" "}
							{new Date(doc.createdAt).toLocaleDateString()}
						</p>
					</div>
					<Badge variant={STATUS_VARIANT[doc.extractionStatus] || "default"}>
						{doc.extractionStatus}
					</Badge>
				</div>
			))}
		</div>
	);
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/components/documents/DocumentUpload.tsx \
        frontend/src/components/documents/DocumentList.tsx
git commit -m "feat: add DocumentUpload and DocumentList frontend components"
```

---

## Task 11: Frontend — Add Documents Tab to BrandsPage

**Files:**
- Modify: `frontend/src/pages/BrandsPage.tsx`

- [ ] **Step 1: Add Documents tab to brand detail modal**

In `frontend/src/pages/BrandsPage.tsx`, import the document components:

```typescript
import { DocumentUpload } from "../components/documents/DocumentUpload";
import { DocumentList } from "../components/documents/DocumentList";
```

Add state for documents:

```typescript
const [documents, setDocuments] = useState<any[]>([]);
```

Add a "Documents" tab to the existing tab list in the brand detail modal (after "Versions"):

```typescript
{ label: "Documents", value: "documents" }
```

Add a fetch function for documents:

```typescript
const fetchDocuments = async (brandId: string) => {
	try {
		const docs = await api<any[]>(`/api/workspaces/${activeWorkspace.id}/documents/brand/${brandId}`);
		setDocuments(docs);
	} catch {
		setDocuments([]);
	}
};
```

Call `fetchDocuments` when the brand detail modal opens or when the Documents tab is selected.

Add the Documents tab content:

```tsx
{activeTab === "documents" && selectedBrand && (
	<div className="space-y-4">
		<DocumentUpload
			workspaceId={activeWorkspace.id}
			brandId={selectedBrand.id}
			onUploaded={() => fetchDocuments(selectedBrand.id)}
		/>
		<DocumentList documents={documents} />
	</div>
)}
```

- [ ] **Step 2: Build frontend to verify no type errors**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/pages/BrandsPage.tsx
git commit -m "feat: add Documents tab to brand detail view with upload and list"
```

---

## Task 12: Frontend — Campaign Brief Builder Page

**Files:**
- Modify: `frontend/src/pages/CampaignsPage.tsx`

- [ ] **Step 1: Add brief builder form to campaign detail**

In `frontend/src/pages/CampaignsPage.tsx`, add a "Brief" tab with the 13-field form.

Add brief state:

```typescript
const [brief, setBrief] = useState<any>({
	objectiveDetail: "",
	channelMix: [],
	mandatoryDeliverables: [],
	culturalContext: "",
	trendContext: "",
	competitiveContext: "",
	kpiPreference: {},
	toneDirection: "",
});
```

Add the Brief tab to the tab list:

```typescript
{ label: "Brief", value: "brief" }
```

Add the Brief tab content with fields for:
- Objective Detail (textarea)
- Channel Mix (checkboxes: Instagram, Facebook, X, YouTube, TikTok)
- Mandatory Deliverables (textarea, newline-separated)
- Cultural Context (textarea)
- Trend Context (textarea)
- Competitive Context (textarea)
- Tone Direction (text input)
- "Save Brief" button
- "Generate Strategy" button

```tsx
{activeTab === "brief" && selectedCampaign && (
	<div className="space-y-4">
		<div>
			<label className="text-xs font-medium text-gray-700">Objective Detail</label>
			<textarea
				className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black"
				rows={3}
				value={brief.objectiveDetail}
				onChange={(e) => setBrief({ ...brief, objectiveDetail: e.target.value })}
			/>
		</div>

		<div>
			<label className="text-xs font-medium text-gray-700">Channel Mix</label>
			<div className="flex flex-wrap gap-2 mt-1">
				{["instagram", "facebook", "x", "youtube", "tiktok"].map((ch) => (
					<label key={ch} className="flex items-center gap-1 text-sm">
						<input
							type="checkbox"
							checked={brief.channelMix?.includes(ch)}
							onChange={(e) => {
								const mix = e.target.checked
									? [...(brief.channelMix || []), ch]
									: (brief.channelMix || []).filter((c: string) => c !== ch);
								setBrief({ ...brief, channelMix: mix });
							}}
						/>
						<span className="capitalize">{ch}</span>
					</label>
				))}
			</div>
		</div>

		<div>
			<label className="text-xs font-medium text-gray-700">Cultural Context</label>
			<textarea
				className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black"
				rows={2}
				value={brief.culturalContext}
				onChange={(e) => setBrief({ ...brief, culturalContext: e.target.value })}
			/>
		</div>

		<div>
			<label className="text-xs font-medium text-gray-700">Trend Context</label>
			<textarea
				className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black"
				rows={2}
				value={brief.trendContext}
				onChange={(e) => setBrief({ ...brief, trendContext: e.target.value })}
			/>
		</div>

		<div>
			<label className="text-xs font-medium text-gray-700">Competitive Context</label>
			<textarea
				className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black"
				rows={2}
				value={brief.competitiveContext}
				onChange={(e) => setBrief({ ...brief, competitiveContext: e.target.value })}
			/>
		</div>

		<div>
			<label className="text-xs font-medium text-gray-700">Tone Direction</label>
			<input
				className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black"
				value={brief.toneDirection}
				onChange={(e) => setBrief({ ...brief, toneDirection: e.target.value })}
			/>
		</div>

		<div className="flex gap-2">
			<Button onClick={handleSaveBrief}>Save Brief</Button>
			<Button variant="secondary" onClick={handleGenerateStrategy}>Generate Strategy</Button>
		</div>
	</div>
)}
```

Add handler functions:

```typescript
const handleSaveBrief = async () => {
	if (!selectedCampaign || !activeWorkspace) return;
	try {
		await api(`/api/workspaces/${activeWorkspace.id}/campaigns/${selectedCampaign.id}/brief`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(brief),
		});
		setToast({ message: "Brief saved", type: "success" });
	} catch {
		setToast({ message: "Failed to save brief", type: "error" });
	}
};

const handleGenerateStrategy = async () => {
	if (!selectedCampaign || !activeWorkspace) return;
	try {
		await api(`/api/workspaces/${activeWorkspace.id}/campaigns/${selectedCampaign.id}/generate-strategy`, {
			method: "POST",
		});
		setToast({ message: "Strategy generation started", type: "success" });
	} catch {
		setToast({ message: "Failed to start strategy generation", type: "error" });
	}
};
```

- [ ] **Step 2: Build frontend to verify no type errors**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/pages/CampaignsPage.tsx
git commit -m "feat: add campaign brief builder with 13-field form and strategy generation"
```

---

## Task 13: Final Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 2: Run frontend build**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Verify Prisma schema**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bunx prisma validate`
Expected: Schema is valid
