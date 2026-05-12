# Brand Brain Auto-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a brand-level reference (file or link) is added, automatically regenerate the brand brain using all stored document chunks, creating a new active brain version and notifying the user via SSE.

**Architecture:** Chain two existing jobs — after `document-extraction` or `link-scraping` completes, enqueue a new `brand-brain-refresh` job that reads all brand chunks, calls the AI scraper, and creates a new `BrandBrainVersion`. The frontend listens via SSE, shows a navigation-blocking banner while processing, and reloads brain fields when done.

**Tech Stack:** Bun, Hono, PgBoss, Prisma, React 19, Tailwind CSS 4, `useSSE` hook (existing), `useUnsavedAsync` hook (existing)

---

## File Map

| Action | Path |
|--------|------|
| **Modify** | `backend/src/interfaces/services/document.service.interface.ts` |
| **Modify** | `backend/src/services/document.service.ts` |
| **Modify** | `backend/src/routes/document.route.ts` |
| **Modify** | `backend/src/jobs/document-extraction.job.ts` |
| **Modify** | `backend/src/jobs/link-scraping.job.ts` |
| **Create** | `backend/src/jobs/brand-brain-refresh.job.ts` |
| **Modify** | `backend/src/index.ts` |
| **Modify** | `frontend/src/hooks/useSSE.ts` |
| **Modify** | `frontend/src/components/products/ProductReferences.tsx` |
| **Modify** | `frontend/src/components/brands/BrandBrainForm.tsx` |

---

## Task 1: Thread `userId` + `productId` through document service and job payloads

The `document-extraction` and `link-scraping` jobs need `userId`, `brandId`, and `productId` in their payloads so they can conditionally enqueue the brain refresh. Currently these fields are missing from both payloads.

**Files:**
- Modify: `backend/src/interfaces/services/document.service.interface.ts`
- Modify: `backend/src/services/document.service.ts`
- Modify: `backend/src/routes/document.route.ts`

- [ ] **Step 1: Update IDocumentService interface**

In `backend/src/interfaces/services/document.service.interface.ts`, add `userId?` to `upload()` and `addLink()`:

```typescript
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
	addLink(
		workspaceId: string,
		brandId: string,
		url: string,
		productId?: string,
		userId?: string,
	): Promise<any>;
	delete(id: string): Promise<void>;
}
```

- [ ] **Step 2: Update DocumentService.upload() to pass userId + productId to job payload**

In `backend/src/services/document.service.ts`, add `userId?` to `upload()` and include it plus `brandId`, `workspaceId`, `productId` in the `document-extraction` job payload:

```typescript
async upload(
    workspaceId: string,
    brandId: string,
    file: File,
    productId?: string,
    sourceType?: string,
    userId?: string,
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
        brandId,
        workspaceId,
        productId: productId || null,
        userId: userId || null,
    });
    return doc;
}
```

- [ ] **Step 3: Update DocumentService.addLink() to pass userId + productId to job payload**

```typescript
async addLink(
    workspaceId: string,
    brandId: string,
    url: string,
    productId?: string,
    userId?: string,
) {
    const doc = await this.documentRepository.create({
        workspaceId,
        brandId,
        productId: productId || null,
        fileName: url,
        fileType: "text/html",
        fileUrl: url,
        fileSize: null,
        sourceType: "link",
    });
    await this.boss.send("link-scraping", {
        documentId: doc.id,
        url,
        brandId,
        workspaceId,
        productId: productId || null,
        userId: userId || null,
    });
    return doc;
}
```

- [ ] **Step 4: Update document.route.ts to pass userId**

In `backend/src/routes/document.route.ts`, update both handlers to pass `userId`:

```typescript
app.post("/upload", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const formData = await c.req.parseBody();
    const file = formData.file as File;
    const brandId = formData.brandId as string;
    const productId = (formData.productId as string) || undefined;
    const sourceType = (formData.sourceType as string) || undefined;
    if (!file || !brandId) return c.json({ error: "file and brandId are required" }, 400);
    const doc = await documentService.upload(workspaceId, brandId, file, productId, sourceType, userId);
    return c.json({ data: doc }, 201);
});
```

```typescript
app.post("/link", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const body = await c.req.json();
    const { brandId, url, productId } = body;
    if (!brandId || !url) return c.json({ error: "brandId and url are required" }, 400);
    const doc = await documentService.addLink(workspaceId, brandId, url, productId, userId);
    return c.json({ data: doc }, 201);
});
```

- [ ] **Step 5: Run type check**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep -E "document.service|document.route|document.service.interface" | head -10
```

Expected: no errors in these files.

- [ ] **Step 6: Commit**

```bash
git add backend/src/interfaces/services/document.service.interface.ts \
        backend/src/services/document.service.ts \
        backend/src/routes/document.route.ts
git commit -m "feat: thread userId and productId through document service and job payloads"
```

---

## Task 2: Create BrandBrainRefreshJob

**Files:**
- Create: `backend/src/jobs/brand-brain-refresh.job.ts`

- [ ] **Step 1: Create the job file**

```typescript
// backend/src/jobs/brand-brain-refresh.job.ts
import type { PrismaClient } from "@prisma/client";
import type { SkillRegistry } from "../config/skills/loader";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import type { AiProviderFactory } from "../services/ai-provider-factory.service";
import { buildSkillContext } from "../utils/skill-context-builder";

interface BrandBrainRefreshJobData {
	brandId: string;
	workspaceId: string;
	userId: string;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_CONTEXT_CHARS = 10_000;

export class BrandBrainRefreshJob {
	constructor(
		private prisma: PrismaClient,
		private aiFactory: AiProviderFactory,
		private notificationService: INotificationService,
		private logger: ILogger,
		private skillRegistry: SkillRegistry,
	) {}

	async handle(data: BrandBrainRefreshJobData): Promise<void> {
		const { brandId, workspaceId, userId } = data;
		try {
			// 1. Fetch brand
			const brand = await this.prisma.brand.findUnique({
				where: { id: brandId },
				select: { websiteUrl: true, language: true },
			});
			if (!brand) {
				this.logger.warn("BrandBrainRefreshJob: brand not found, skipping", { brandId });
				return;
			}

			// 2. Load all completed brand-level document chunks (skip product-only docs)
			const docs = await this.prisma.brandDocument.findMany({
				where: { brandId, productId: null, extractionStatus: "completed" },
				include: { chunks: { orderBy: { chunkIndex: "asc" } } },
			});

			// 3. Build merged context — skip image types, cap at MAX_CONTEXT_CHARS
			let mergedContext = "";
			outer: for (const doc of docs) {
				if (IMAGE_TYPES.has(doc.fileType ?? "")) continue;
				for (const chunk of doc.chunks) {
					if (mergedContext.length >= MAX_CONTEXT_CHARS) break outer;
					mergedContext += chunk.contentText + "\n";
				}
			}
			mergedContext = mergedContext.slice(0, MAX_CONTEXT_CHARS);

			// 4. Exit early if nothing to analyze
			if (!mergedContext.trim() && !brand.websiteUrl) {
				this.logger.info("BrandBrainRefreshJob: no content to analyze, skipping", { brandId });
				return;
			}

			// 5. Build skill context
			const skillResult = buildSkillContext(this.skillRegistry, "brandBrain");

			// 6. Call AI scraper with merged context and optional website URL
			const brandScraper = await this.aiFactory.getBrandScraper(workspaceId);
			const scraped = await brandScraper.scrape({
				...(mergedContext.trim() ? { fileText: mergedContext } : {}),
				...(brand.websiteUrl ? { url: brand.websiteUrl } : {}),
				language: brand.language ?? undefined,
				skillContext: skillResult.context,
			});

			// 7. Determine next version and deactivate current
			const latest = await this.prisma.brandBrainVersion.findFirst({
				where: { brandId },
				orderBy: { version: "desc" },
			});
			const nextVersion = (latest?.version ?? 0) + 1;
			await this.prisma.brandBrainVersion.updateMany({
				where: { brandId, isActive: true },
				data: { isActive: false },
			});

			// 8. Build messaging rules and create new brain version
			const messagingRules: Record<string, string[]> = {};
			if (scraped.dos?.length) messagingRules.do = scraped.dos;
			if (scraped.donts?.length) messagingRules.dont = scraped.donts;

			await this.prisma.brandBrainVersion.create({
				data: {
					brandId,
					version: nextVersion,
					personality: scraped.personality ?? null,
					tone: scraped.tone ?? null,
					audiencePersonas: scraped.targetAudience
						? [{ name: "Primary", traits: [scraped.targetAudience] }]
						: null,
					values: scraped.values ? (scraped.values as any) : null,
					messagingRules: Object.keys(messagingRules).length > 0 ? messagingRules : null,
					vocabulary: {
						...(scraped.vocabulary ?? {}),
						summary: scraped.summary ?? undefined,
						brandPromise: scraped.brandPromise ?? undefined,
						usp: scraped.usp ?? undefined,
						contentPillars: scraped.contentPillars ?? [],
						marketingStrategy: scraped.marketingStrategy ?? undefined,
					},
					isActive: true,
					status: "draft",
				},
			});

			// 9. Notify user via SSE
			this.notificationService.notify(userId, {
				type: "brand_brain_updated",
				data: { brandId, version: nextVersion },
			});

			this.logger.info("BrandBrainRefreshJob completed", { brandId, version: nextVersion });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error("BrandBrainRefreshJob failed", { brandId, error: message });
			// No error notification — brain stays on current version silently
		}
	}
}
```

- [ ] **Step 2: Run type check**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "brand-brain-refresh" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/jobs/brand-brain-refresh.job.ts
git commit -m "feat: add BrandBrainRefreshJob to regenerate brand brain from all reference documents"
```

---

## Task 3: Register brand-brain-refresh queue and worker in index.ts

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Add the import**

At the top of `backend/src/index.ts`, find the existing job imports (e.g. `import { BrandScrapingJob }`) and add:

```typescript
import { BrandBrainRefreshJob } from "./jobs/brand-brain-refresh.job";
```

- [ ] **Step 2: Instantiate the job handler**

In the `// ─── Job Handlers ────` section (around line 404), after the `brandScrapingJob` instantiation, add:

```typescript
const brandBrainRefreshJob = new BrandBrainRefreshJob(
	prisma,
	aiProviderFactory,
	notificationService,
	logger,
	skillRegistry,
);
```

- [ ] **Step 3: Create the queue**

In the `// ─── Create PgBoss Queues ───` section (around line 467), add:

```typescript
await boss.createQueue("brand-brain-refresh");
```

- [ ] **Step 4: Register the worker**

In the `// ─── Register PgBoss Workers ─────` section, after the `brand-scraping` worker registration, add:

```typescript
await boss.work(
	"brand-brain-refresh",
	{ localConcurrency: 2, pollingIntervalSeconds: 2 },
	async (jobs) => {
		for (const job of jobs) await brandBrainRefreshJob.handle(job.data as any);
	},
);
```

- [ ] **Step 5: Run type check**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "index.ts" | head -10
```

Expected: no errors in `index.ts`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: register brand-brain-refresh queue and worker in index.ts"
```

---

## Task 4: Chain brand-brain-refresh from document-extraction and link-scraping jobs

Inject `boss: PgBoss` into both jobs and enqueue `brand-brain-refresh` after successful completion — but only for brand-level documents (no `productId`).

**Files:**
- Modify: `backend/src/jobs/document-extraction.job.ts`
- Modify: `backend/src/jobs/link-scraping.job.ts`
- Modify: `backend/src/index.ts` (update constructor calls)

- [ ] **Step 1: Update DocumentExtractionJob to accept boss and enqueue refresh**

Replace `backend/src/jobs/document-extraction.job.ts` entirely:

```typescript
import type { PgBoss } from "pg-boss";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IDocumentRepository } from "../interfaces/repositories/document.repository.interface";

interface DocumentExtractionJobData {
	documentId: string;
	fileUrl: string;
	fileName: string;
	fileType: string;
	brandId?: string | null;
	workspaceId?: string | null;
	productId?: string | null;
	userId?: string | null;
}

export class DocumentExtractionJob {
	constructor(
		private documentRepository: IDocumentRepository,
		private logger: ILogger,
		private boss: PgBoss,
	) {}

	async handle(data: DocumentExtractionJobData) {
		const { documentId, fileUrl, fileName, fileType, brandId, workspaceId, productId, userId } =
			data;
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
				chunks.map((content, index) => ({ chunkIndex: index, contentText: content })),
			);
			await this.documentRepository.updateExtractionStatus(documentId, "completed");
			this.logger.info("Document extraction completed", {
				documentId,
				chunkCount: chunks.length,
			});

			// Trigger brand brain refresh for brand-level docs only (no productId)
			if (brandId && workspaceId && userId && !productId) {
				await this.boss.send("brand-brain-refresh", { brandId, workspaceId, userId });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error("Document extraction failed", { documentId, error: message });
			await this.documentRepository.updateExtractionStatus(documentId, "failed");
		}
	}

	private async extractPdf(fileUrl: string): Promise<string> {
		const response = await fetch(fileUrl);
		const buffer = Buffer.from(await response.arrayBuffer());
		const { PDFParse } = await import("pdf-parse");
		const parser = new PDFParse({ data: new Uint8Array(buffer) });
		const result = await parser.getText();
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

- [ ] **Step 2: Update LinkScrapingJob to accept boss and enqueue refresh**

Replace `backend/src/jobs/link-scraping.job.ts` entirely:

```typescript
import type { PgBoss } from "pg-boss";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IDocumentRepository } from "../interfaces/repositories/document.repository.interface";

interface LinkScrapingJobData {
	documentId: string;
	url: string;
	brandId?: string | null;
	workspaceId?: string | null;
	productId?: string | null;
	userId?: string | null;
}

export class LinkScrapingJob {
	constructor(
		private documentRepository: IDocumentRepository,
		private logger: ILogger,
		private boss: PgBoss,
	) {}

	async handle(data: LinkScrapingJobData): Promise<void> {
		const { documentId, url, brandId, workspaceId, productId, userId } = data;
		try {
			this.logger.info("Starting link scraping", { documentId, url });
			await this.documentRepository.updateExtractionStatus(documentId, "processing");

			const response = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.9",
				},
				signal: AbortSignal.timeout(15000),
				redirect: "follow",
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
			}

			const html = await response.text();

			const text = html
				.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
				.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
				.replace(/<[^>]+>/g, " ")
				.replace(/&nbsp;/g, " ")
				.replace(/&amp;/g, "&")
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/\s+/g, " ")
				.trim();

			if (!text) {
				throw new Error("No text content extracted from URL");
			}

			const chunks = this.chunkText(text, 500, 50);
			await this.documentRepository.createChunks(
				documentId,
				chunks.map((content, index) => ({ chunkIndex: index, contentText: content })),
			);

			await this.documentRepository.updateExtractionStatus(documentId, "completed");
			this.logger.info("Link scraping completed", { documentId, chunkCount: chunks.length });

			// Trigger brand brain refresh for brand-level docs only (no productId)
			if (brandId && workspaceId && userId && !productId) {
				await this.boss.send("brand-brain-refresh", { brandId, workspaceId, userId });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.warn(`Link scraping failed, storing URL as reference: ${message}`, {
				documentId,
				url,
			});

			try {
				await this.documentRepository.createChunks(documentId, [
					{
						chunkIndex: 0,
						contentText: `Reference URL: ${url} (Note: page content could not be scraped due to bot protection. Use this URL as context.)`,
					},
				]);
				await this.documentRepository.updateExtractionStatus(documentId, "completed");
				this.logger.info("Link stored as URL reference (fallback)", { documentId, url });

				// Still trigger refresh even on fallback — the URL chunk is valid context
				if (brandId && workspaceId && userId && !productId) {
					await this.boss.send("brand-brain-refresh", { brandId, workspaceId, userId });
				}
			} catch {
				await this.documentRepository.updateExtractionStatus(documentId, "failed");
			}
		}
	}

	private chunkText(text: string, chunkSize: number, overlap: number): string[] {
		const chunks: string[] = [];
		let start = 0;
		while (start < text.length) {
			chunks.push(text.slice(start, start + chunkSize));
			start += chunkSize - overlap;
		}
		return chunks;
	}
}
```

- [ ] **Step 3: Update index.ts constructor calls to pass boss**

In `backend/src/index.ts`, find the existing instantiation lines:

```typescript
const documentExtractionJob = new DocumentExtractionJob(documentRepository, logger);
const linkScrapingJob = new LinkScrapingJob(documentRepository, logger);
```

Replace with:

```typescript
const documentExtractionJob = new DocumentExtractionJob(documentRepository, logger, boss);
const linkScrapingJob = new LinkScrapingJob(documentRepository, logger, boss);
```

- [ ] **Step 4: Run type check — must be clean**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep -E "document-extraction|link-scraping|index.ts" | head -15
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/jobs/document-extraction.job.ts \
        backend/src/jobs/link-scraping.job.ts \
        backend/src/index.ts
git commit -m "feat: chain brand-brain-refresh from document-extraction and link-scraping jobs"
```

---

## Task 5: Add brand_brain_updated to useSSE event types

**Files:**
- Modify: `frontend/src/hooks/useSSE.ts`

- [ ] **Step 1: Add the event type**

In `frontend/src/hooks/useSSE.ts`, find the `EVENT_TYPES` array (around line 11). Add `"brand_brain_updated"` to it, after the existing brand scraping entries:

```typescript
const EVENT_TYPES = [
  // Content generation
  "generation_complete",
  "generation_failed",
  // Campaign
  "campaign_complete",
  // Topic generation
  "topics_generated",
  "topic_generation_complete",
  "topic_generation_failed",
  // Topic regeneration (single topic)
  "topic_regenerated",
  "topic_regeneration_failed",
  "topic_preview_regenerated",
  "topic_preview_regeneration_failed",
  // Brand scraping
  "brand_scraped",
  // Brand brain auto-refresh from references
  "brand_brain_updated",
  // Research runs
  "research_run_complete",
  "research_run_failed",
  // Campaign PDF generation
  "campaign_pdf_progress",
  "campaign_pdf_complete",
  "campaign_pdf_failed",
  // Competitor analyzer
  "creator_enrichment_completed",
  "competitor_pipeline_stage_changed",
  "competitor_pipeline_video_analyzed",
  "competitor_pipeline_completed",
  "competitor_pipeline_failed",
] as const;
```

- [ ] **Step 2: Run frontend type check**

```bash
cd frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSSE.ts
git commit -m "feat: add brand_brain_updated to useSSE event types"
```

---

## Task 6: Add onReferenceAdded prop to ProductReferences

**Files:**
- Modify: `frontend/src/components/products/ProductReferences.tsx`

- [ ] **Step 1: Add the prop to the interface and call it after upload/link-add**

In `frontend/src/components/products/ProductReferences.tsx`:

1. Update `ProductReferencesProps` (line 22) to add the optional prop:

```typescript
interface ProductReferencesProps {
  workspaceId: string;
  productId?: string;
  brandId: string;
  onReferenceAdded?: () => void;
}
```

2. Destructure it in the function signature:

```typescript
export function ProductReferences({ workspaceId, productId, brandId, onReferenceAdded }: ProductReferencesProps) {
```

3. In `handleUpload` (line 70), after `await loadDocs()` succeeds, add `onReferenceAdded?.()`. Only call it for brand-level refs (no `productId`). Replace the `handleUpload` function:

```typescript
const handleUpload = async (file: File) => {
  setUploading(true);
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("brandId", brandId);
    if (productId) formData.append("productId", productId);

    const token = getAccessToken();
    const res = await fetch(`/api/workspaces/${workspaceId}/documents/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      body: formData,
    });

    if (!res.ok) throw new Error("Upload failed");
    await loadDocs();
    if (!productId) onReferenceAdded?.();
  } catch {
    // silent
  } finally {
    setUploading(false);
  }
};
```

4. In `handleAddLink` (line 95), after `await loadDocs()` succeeds, add the same call. Replace the `handleAddLink` function:

```typescript
const handleAddLink = async () => {
  if (!linkUrl.trim()) return;
  setAddingLink(true);
  try {
    await api(`/api/workspaces/${workspaceId}/documents/link`, {
      method: "POST",
      body: JSON.stringify({ brandId, ...(productId ? { productId } : {}), url: linkUrl.trim() }),
    });
    setLinkUrl("");
    await loadDocs();
    if (!productId) onReferenceAdded?.();
  } catch {
    // silent
  } finally {
    setAddingLink(false);
  }
};
```

- [ ] **Step 2: Run type check**

```bash
cd frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/products/ProductReferences.tsx
git commit -m "feat: add onReferenceAdded callback to ProductReferences for brand-level uploads"
```

---

## Task 7: Update BrandBrainForm — SSE listener, brainRefreshing state, banner, useUnsavedAsync

**Files:**
- Modify: `frontend/src/components/brands/BrandBrainForm.tsx`

- [ ] **Step 1: Add useSSE import**

At the top of `frontend/src/components/brands/BrandBrainForm.tsx`, add after the existing hook imports:

```typescript
import { useSSE } from "../../hooks/useSSE";
```

Also add `useCallback` to the React import if not already there:

```typescript
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
```

- [ ] **Step 2: Add brainRefreshing state**

Inside the `BrandBrainForm` function, after the existing `const [pendingFile, setPendingFile] = useState<File | null>(null);` line, add:

```typescript
const [brainRefreshing, setBrainRefreshing] = useState(false);
```

- [ ] **Step 3: Add useUnsavedAsync block for brainRefreshing**

After the existing `useUnsavedAsync(scraping, ...)` call, add:

```typescript
useUnsavedAsync(
  brainRefreshing,
  "Brand brain is being updated from references — leave anyway? Your progress will be lost.",
);
```

- [ ] **Step 4: Add a reloadBrainVersion helper**

After the existing `update` function, add:

```typescript
const reloadBrainVersion = useCallback(async () => {
  if (!editBrand?.id) return;
  try {
    const brand = await api<EditBrand>(
      `/api/workspaces/${workspaceId}/brands/${editBrand.id}`,
    );
    const brain =
      brand.brainVersions?.find((v) => v.isActive) ?? brand.brainVersions?.[0];
    const vocab = brain?.vocabulary ?? {};
    const rules = brain?.messagingRules ?? {};
    const audience = brain?.audiencePersonas;
    const audienceText = Array.isArray(audience)
      ? audience.map((a: any) => a.traits?.join(", ") ?? a.name).join("; ")
      : "";
    setForm((prev) => ({
      ...prev,
      name: brand.name,
      industry: brand.category ?? prev.industry,
      summary: (vocab as any).summary ?? prev.summary,
      tone: brain?.tone ?? prev.tone,
      personality: brain?.personality ?? prev.personality,
      contentLanguage: (vocab as any).contentLanguage ?? prev.contentLanguage,
      platforms: (vocab as any).preferred ?? prev.platforms,
      targetAudience: audienceText || prev.targetAudience,
      brandValues: Array.isArray(brain?.values) ? brain.values : prev.brandValues,
      brandPromise: (vocab as any).brandPromise ?? prev.brandPromise,
      usp: (vocab as any).usp ?? prev.usp,
      contentPillars: (vocab as any).contentPillars ?? prev.contentPillars,
      marketingStrategy: (vocab as any).marketingStrategy ?? prev.marketingStrategy,
      dos: Array.isArray(rules.do) ? rules.do : prev.dos,
      donts: Array.isArray(rules.dont) ? rules.dont : prev.donts,
    }));
  } catch {
    // silent — form keeps current values
  }
}, [editBrand?.id, workspaceId]);
```

- [ ] **Step 5: Add SSE listener**

After the `reloadBrainVersion` definition, add:

```typescript
useSSE((event) => {
  if (
    event.type === "brand_brain_updated" &&
    (event.data as any).brandId === editBrand?.id
  ) {
    setBrainRefreshing(false);
    reloadBrainVersion();
  }
});
```

- [ ] **Step 6: Add the refreshing banner to the References tab**

In the JSX, find the `activeTab === "references"` section. It currently renders `<ProductReferences ... />`. Add a refreshing banner above it and pass `onReferenceAdded`:

Find this block (the references tab render):
```tsx
{activeTab === "references" && isEditMode && editBrand && (
  <ProductReferences
    workspaceId={workspaceId}
    brandId={editBrand.id}
  />
)}
```

Replace it with:
```tsx
{activeTab === "references" && isEditMode && editBrand && (
  <div className="space-y-4">
    {brainRefreshing && (
      <div className="bg-indigo-50 border border-indigo-100 rounded-md px-4 py-3 flex items-center gap-2.5">
        <Loader2 size={14} className="text-indigo-600 animate-spin shrink-0" />
        <div>
          <p className="text-xs font-medium text-indigo-700">
            Updating brand brain from references…
          </p>
          <p className="text-[10px] text-indigo-500 mt-0.5">
            Your brand brain will refresh once analysis is done.
          </p>
        </div>
      </div>
    )}
    <ProductReferences
      workspaceId={workspaceId}
      brandId={editBrand.id}
      onReferenceAdded={() => setBrainRefreshing(true)}
    />
  </div>
)}
```

Note: `Loader2` is already imported in `BrandBrainForm.tsx`.

- [ ] **Step 7: Run type check**

```bash
cd frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/brands/BrandBrainForm.tsx
git commit -m "feat: add brain-refreshing banner and SSE listener to BrandBrainForm References tab"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run backend type check and tests**

```bash
cd backend && bunx tsc --noEmit && bun test 2>&1 | tail -10
```

Expected: no new type errors; all tests pass (1 pre-existing failure in chat.service.test.ts is unrelated).

- [ ] **Step 2: Run frontend type check and lint**

```bash
cd frontend && npm run typecheck && npm run lint 2>&1 | grep -E "BrandBrainForm|ProductReferences|useSSE" | head -10
```

Expected: no errors in the feature files.

- [ ] **Step 3: Manual smoke test**

1. Start backend: `cd backend && bun run --hot src/index.ts`
2. Start frontend: `cd frontend && npm run dev`
3. Open a brand in edit mode → References tab
4. Upload a PDF — confirm "Uploading..." appears
5. After upload: confirm the banner "Updating brand brain from references…" appears
6. Try to navigate away — confirm the browser alert blocks leaving
7. Wait ~30–60 seconds for the job to complete
8. Confirm the banner disappears
9. Switch to Overview tab — confirm Brand Summary, Brand Voice, etc. have been updated with content from the PDF

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: brand brain auto-refresh — full implementation complete"
```
