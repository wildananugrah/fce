# Product References & Token Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tabbed product drawer with references (files + links), inject reference content into AI generators, and display token usage per user and per generation.

**Architecture:** Product drawer gets a sidebar menu (Details + References). References reuse the existing `BrandDocument` + `DocumentChunk` models with `productId` filter. A new link-scraping job handles URL content extraction. AI providers return token counts which get logged and displayed. Smart character-limited context injection in generation jobs.

**Tech Stack:** TypeScript, Hono, Prisma 7, pg-boss, React 19, Tailwind CSS 4, MinIO

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/components/products/ProductDrawer.tsx` | Tabbed drawer (Details + References) |
| Create | `frontend/src/components/products/ProductReferences.tsx` | File upload, link input, reference list |
| Modify | `frontend/src/pages/ProductsPage.tsx` | Use ProductDrawer |
| Create | `backend/src/jobs/link-scraping.job.ts` | Fetch URL, extract text, create chunks |
| Modify | `backend/src/index.ts` | Wire link-scraping job |
| Modify | `backend/src/routes/document.route.ts` | Add product document endpoints |
| Modify | `backend/src/services/document.service.ts` | Add listByProduct, addLink |
| Modify | `backend/src/repositories/document.repository.ts` | Add findByProduct query |
| Modify | `backend/src/interfaces/repositories/document.repository.interface.ts` | Add findByProduct |
| Modify | `backend/src/interfaces/services/document.service.interface.ts` | Add listByProduct, addLink |
| Modify | `backend/src/jobs/topic-generation.job.ts` | Inject product references |
| Modify | `backend/src/jobs/content-generation.job.ts` | Inject product references |
| Modify | `backend/src/providers/anthropic.provider.ts` | Return token usage |
| Modify | `backend/src/providers/gemini.provider.ts` | Return token usage |
| Modify | `backend/src/jobs/topic-generation.job.ts` | Pass token usage to logger |
| Modify | `backend/src/jobs/content-generation.job.ts` | Pass token usage to logger |
| Modify | `backend/src/routes/ai-log.route.ts` | Add usage summary endpoint |
| Modify | `frontend/src/pages/SettingsPage.tsx` | Add token usage section |
| Modify | `frontend/src/components/generation/GenerationResultRow.tsx` | Show token badge |

---

### Task 1: Backend — Product Document Endpoints

**Files:**
- Modify: `backend/src/interfaces/repositories/document.repository.interface.ts`
- Modify: `backend/src/repositories/document.repository.ts`
- Modify: `backend/src/interfaces/services/document.service.interface.ts`
- Modify: `backend/src/services/document.service.ts`
- Modify: `backend/src/routes/document.route.ts`

- [ ] **Step 1: Add findByProduct to repository interface**

Read `backend/src/interfaces/repositories/document.repository.interface.ts` and add:

```typescript
findByProduct(productId: string): Promise<BrandDocumentRecord[]>;
```

- [ ] **Step 2: Implement findByProduct in repository**

In `backend/src/repositories/document.repository.ts`, add:

```typescript
async findByProduct(productId: string) {
    return this.prisma.brandDocument.findMany({
        where: { productId },
        orderBy: { createdAt: "desc" },
        include: { chunks: { orderBy: { chunkIndex: "asc" } } },
    });
}
```

- [ ] **Step 3: Add listByProduct and addLink to service interface**

In `backend/src/interfaces/services/document.service.interface.ts`, add:

```typescript
listByProduct(productId: string): Promise<any[]>;
addLink(workspaceId: string, brandId: string, url: string, productId?: string): Promise<any>;
```

- [ ] **Step 4: Implement listByProduct and addLink in service**

In `backend/src/services/document.service.ts`, add:

```typescript
async listByProduct(productId: string) {
    return this.documentRepository.findByProduct(productId);
}

async addLink(workspaceId: string, brandId: string, url: string, productId?: string) {
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
    });
    return doc;
}
```

- [ ] **Step 5: Add routes for product documents and link adding**

In `backend/src/routes/document.route.ts`, add:

```typescript
// GET /product/:productId — list documents for a product
app.get("/product/:productId", async (c) => {
    const productId = c.req.param("productId");
    const docs = await documentService.listByProduct(productId);
    return c.json({ data: docs });
});

// POST /link — add a link reference
app.post("/link", async (c) => {
    const workspaceId = c.get("workspaceId");
    const body = await c.req.json();
    const { brandId, url, productId } = body;
    if (!brandId || !url) return c.json({ error: "brandId and url are required" }, 400);
    const doc = await documentService.addLink(workspaceId, brandId, url, productId);
    return c.json({ data: doc }, 201);
});

// DELETE /:id — delete a document
app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    await documentService.delete(id);
    return c.json({ success: true });
});
```

Also add `delete` to the service and repository if not already present.

- [ ] **Step 6: Commit**

```bash
git add backend/src/interfaces/ backend/src/repositories/document.repository.ts backend/src/services/document.service.ts backend/src/routes/document.route.ts
git commit -m "feat: add product document endpoints and link reference support"
```

---

### Task 2: Backend — Link Scraping Job

**Files:**
- Create: `backend/src/jobs/link-scraping.job.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create link scraping job**

Create `backend/src/jobs/link-scraping.job.ts`:

```typescript
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IDocumentRepository } from "../interfaces/repositories/document.repository.interface";

export class LinkScrapingJob {
    constructor(
        private documentRepository: IDocumentRepository,
        private logger: ILogger,
    ) {}

    async handle(data: { documentId: string; url: string }): Promise<void> {
        const { documentId, url } = data;
        try {
            this.logger.info("Starting link scraping", { documentId, url });
            await this.documentRepository.updateExtractionStatus(documentId, "processing");

            const response = await fetch(url, {
                headers: { "User-Agent": "FCE-Bot/1.0" },
                signal: AbortSignal.timeout(15000),
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch URL: ${response.status}`);
            }

            const html = await response.text();

            // Basic HTML text extraction — strip tags and normalize whitespace
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

            // Chunk the text (same as document extraction: 500 chars, 50 overlap)
            const chunks = this.chunkText(text, 500, 50);
            await this.documentRepository.createChunks(
                documentId,
                chunks.map((content, index) => ({ chunkIndex: index, contentText: content })),
            );

            await this.documentRepository.updateExtractionStatus(documentId, "completed");
            this.logger.info("Link scraping completed", { documentId, chunkCount: chunks.length });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error("Link scraping failed", { documentId, error: message });
            await this.documentRepository.updateExtractionStatus(documentId, "failed");
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

- [ ] **Step 2: Wire in composition root**

In `backend/src/index.ts`, add import:

```typescript
import { LinkScrapingJob } from "./jobs/link-scraping.job";
```

After the document-extraction job worker registration, add:

```typescript
const linkScrapingJob = new LinkScrapingJob(documentRepository, logger);
await boss.work("link-scraping", async (job) => {
    await linkScrapingJob.handle(job.data as any);
});
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/jobs/link-scraping.job.ts backend/src/index.ts
git commit -m "feat: add link scraping job for URL reference extraction"
```

---

### Task 3: Backend — Inject Product References into AI Generators

**Files:**
- Modify: `backend/src/jobs/topic-generation.job.ts`
- Modify: `backend/src/jobs/content-generation.job.ts`

- [ ] **Step 1: Add reference fetching helper**

In both job files, after fetching product brain versions, add reference content fetching. The pattern (add to both jobs, after the product context building section):

```typescript
// Fetch product reference content
let productReferenceContext = "";
const productReferenceImages: string[] = [];
const allProductIds = productIds ?? (request?.productId ? [request.productId] : []);
if (allProductIds.length > 0) {
    const MAX_REFERENCE_CHARS = 5000;
    let charCount = 0;

    for (const pid of allProductIds) {
        const docs = await this.prisma.brandDocument.findMany({
            where: { productId: pid },
            include: { chunks: { orderBy: { chunkIndex: "asc" } } },
        });

        for (const doc of docs) {
            // Images → collect for multimodal
            if (doc.sourceType === "image" || doc.fileType.startsWith("image/")) {
                productReferenceImages.push(doc.fileUrl);
                continue;
            }

            // Text chunks → concatenate with limit
            for (const chunk of doc.chunks) {
                if (charCount >= MAX_REFERENCE_CHARS) break;
                const remaining = MAX_REFERENCE_CHARS - charCount;
                const text = chunk.contentText.slice(0, remaining);
                productReferenceContext += text + "\n";
                charCount += text.length;
            }
        }
    }
}
```

Then append to the generation input:

For topic generation job — add to `generationInput`:
```typescript
const generationInput = {
    // ... existing fields ...
    referenceImages: [
        ...(referenceImages ?? []),
        ...productReferenceImages,
    ].length > 0 ? [...(referenceImages ?? []), ...productReferenceImages] : undefined,
};
```

And append reference context to the prompt builder input by extending the product contexts:
```typescript
if (productReferenceContext) {
    if (!generationInput.productContexts) generationInput.productContexts = [];
    generationInput.productContexts.push(`Product reference materials:\n${productReferenceContext}`);
}
```

For content generation job — same pattern but using `productContext`:
```typescript
if (productReferenceContext) {
    productContext = (productContext ?? "") + `\n\nProduct reference materials:\n${productReferenceContext}`;
}
```

And merge reference images:
```typescript
referenceImages: [
    ...(referenceImages ?? []),
    ...productReferenceImages,
].length > 0 ? [...(referenceImages ?? []), ...productReferenceImages] : undefined,
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/jobs/topic-generation.job.ts backend/src/jobs/content-generation.job.ts
git commit -m "feat: inject product reference content and images into AI generators"
```

---

### Task 4: Backend — Token Usage from AI Providers

**Files:**
- Modify: `backend/src/providers/anthropic.provider.ts`
- Modify: `backend/src/providers/gemini.provider.ts`
- Modify: `backend/src/jobs/topic-generation.job.ts`
- Modify: `backend/src/jobs/content-generation.job.ts`

- [ ] **Step 1: Update Anthropic provider to return token usage**

The Anthropic provider's generate methods currently return parsed JSON directly. Update them to return an object with both the result and usage. Change the provider to store usage on the instance after each call:

Add a property to the class:

```typescript
public lastUsage: { inputTokens: number; outputTokens: number } | null = null;
```

In each generate method (generateContent, generateTopics, generateCampaign), after getting the response, store usage:

```typescript
this.lastUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
};
```

- [ ] **Step 2: Update Gemini provider to return token usage**

Same pattern. Add:

```typescript
public lastUsage: { inputTokens: number; outputTokens: number } | null = null;
```

In each generate method, after getting the response:

```typescript
this.lastUsage = {
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
};
```

- [ ] **Step 3: Update generation jobs to pass token usage to logger**

In both `topic-generation.job.ts` and `content-generation.job.ts`, after calling `this.topicGenerator.generate()` or `this.contentGenerator.generate()`, access the usage:

```typescript
const usage = (this.topicGenerator as any).lastUsage;
```

Then pass to `logAiActivity`:

```typescript
await logAiActivity(this.prisma, { ... }, {
    responseJson: output,
    durationMs,
    status: "success",
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
});
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/providers/ backend/src/jobs/
git commit -m "feat: extract and log token usage from AI provider responses"
```

---

### Task 5: Backend — Token Usage Summary Endpoint

**Files:**
- Modify: `backend/src/routes/ai-log.route.ts`

- [ ] **Step 1: Add usage summary endpoint**

Read `backend/src/routes/ai-log.route.ts` and add an endpoint:

```typescript
// GET /usage — token usage summary for current user
app.get("/usage", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const logs = await prisma.aiProviderLog.findMany({
        where: { workspaceId, userId },
        select: {
            inputTokens: true,
            outputTokens: true,
            estimatedCost: true,
            generator: true,
            createdAt: true,
        },
    });

    const totalInput = logs.reduce((sum, l) => sum + (l.inputTokens ?? 0), 0);
    const totalOutput = logs.reduce((sum, l) => sum + (l.outputTokens ?? 0), 0);
    const totalCost = logs.reduce((sum, l) => sum + Number(l.estimatedCost ?? 0), 0);

    return c.json({
        data: {
            totalInputTokens: totalInput,
            totalOutputTokens: totalOutput,
            totalTokens: totalInput + totalOutput,
            totalCost,
            generationCount: logs.length,
        },
    });
});
```

Note: This route needs access to `prisma`. Check how the ai-log route is set up — it may need the prisma client passed through or use a service.

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/ai-log.route.ts
git commit -m "feat: add token usage summary endpoint"
```

---

### Task 6: Frontend — ProductDrawer with Tabs

**Files:**
- Create: `frontend/src/components/products/ProductDrawer.tsx`
- Modify: `frontend/src/pages/ProductsPage.tsx`

- [ ] **Step 1: Create ProductDrawer component**

Create `frontend/src/components/products/ProductDrawer.tsx` with a tabbed drawer layout. Use the `Drawer` component as the container, but add a sidebar inside:

```tsx
import { useState } from "react";
import { Drawer } from "../ui/Drawer";
import { ProductForm, type ProductFormData } from "./ProductForm";
import { ProductReferences } from "./ProductReferences";
import { Package, FileText } from "lucide-react";

interface ProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  brands: { id: string; name: string }[];
  workspaceId: string;
  mode?: "create" | "edit";
  initial?: ProductFormData;
  productId?: string;
  brandId?: string;
  onSubmit: (data: ProductFormData) => void;
}

const TABS = [
  { key: "details", label: "Details", icon: Package },
  { key: "references", label: "References", icon: FileText },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ProductDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  brands,
  workspaceId,
  mode,
  initial,
  productId,
  brandId,
  onSubmit,
}: ProductDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("details");

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="flex h-full">
        {/* Sidebar tabs */}
        <div className="w-40 border-r border-gray-200 py-2 shrink-0">
          {TABS.map((tab) => {
            // Hide References tab in create mode
            if (tab.key === "references" && mode !== "edit") return null;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                  activeTab === tab.key
                    ? "bg-gray-100 text-black font-medium border-r-2 border-black"
                    : "text-gray-500 hover:text-black hover:bg-gray-50"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "details" && (
            <ProductForm
              brands={brands}
              workspaceId={workspaceId}
              mode={mode}
              initial={initial}
              onSubmit={onSubmit}
              onCancel={onClose}
            />
          )}
          {activeTab === "references" && productId && brandId && (
            <ProductReferences
              workspaceId={workspaceId}
              productId={productId}
              brandId={brandId}
            />
          )}
        </div>
      </div>
    </Drawer>
  );
}
```

- [ ] **Step 2: Update ProductsPage to use ProductDrawer**

In `frontend/src/pages/ProductsPage.tsx`, replace the `Drawer` + `ProductForm` usage with `ProductDrawer`:

Import:
```typescript
import { ProductDrawer } from "../components/products/ProductDrawer";
```

Replace create drawer:
```tsx
<ProductDrawer
  isOpen={showCreate}
  onClose={() => setShowCreate(false)}
  title="New Product"
  brands={brands}
  workspaceId={activeWorkspace.id}
  mode="create"
  onSubmit={handleCreateProduct}
/>
```

Replace edit drawer:
```tsx
<ProductDrawer
  isOpen
  onClose={() => setSelectedProduct(null)}
  title="Edit Product"
  subtitle={selectedProduct.name}
  brands={brands}
  workspaceId={activeWorkspace.id}
  mode="edit"
  productId={selectedProduct.id}
  brandId={selectedProduct.brandId}
  initial={{...}}
  onSubmit={(data) => handleEditProduct(selectedProduct, data)}
/>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/products/ProductDrawer.tsx frontend/src/pages/ProductsPage.tsx
git commit -m "feat: add tabbed ProductDrawer with Details and References tabs"
```

---

### Task 7: Frontend — ProductReferences Component

**Files:**
- Create: `frontend/src/components/products/ProductReferences.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/products/ProductReferences.tsx` with file upload, link input, and reference list. Follow the pattern from `DocumentUpload.tsx` but adapted for product context:

- File drop zone (PDF, DOCX, TXT, JPG, PNG, WebP)
- Link input with "Add" button
- List of existing references with status badges and delete buttons
- Polling for extraction status on pending/processing items

The component should:
- Upload files via `POST /api/workspaces/:id/documents/upload` with `productId` and `brandId`
- Add links via `POST /api/workspaces/:id/documents/link` with `productId`, `brandId`, `url`
- List references via `GET /api/workspaces/:id/documents/product/:productId`
- Delete via `DELETE /api/workspaces/:id/documents/:id`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/products/ProductReferences.tsx
git commit -m "feat: create ProductReferences component with file upload and link scraping"
```

---

### Task 8: Frontend — Token Usage on Settings Page

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add token usage section**

After the existing profile fields, add a "Token Usage" section that fetches from `GET /api/workspaces/:id/ai-logs/usage` and displays:

- Total input tokens
- Total output tokens
- Total combined tokens
- Number of generations

Style as a simple stats grid with cards.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat: add token usage summary to settings page"
```

---

### Task 9: Frontend — Token Count on Generation Result Rows

**Files:**
- Modify: `frontend/src/components/generation/GenerationResultRow.tsx`

- [ ] **Step 1: Show token count badge**

When fetching generation details (on row expand), also check if the response includes token info. Show a small badge like "245 tokens" on completed rows.

The token data can be fetched from the `AiProviderLog` associated with the generation. Add a token count display in the row's status column or expanded section.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/generation/GenerationResultRow.tsx
git commit -m "feat: show token usage badge on generation result rows"
```

---

### Task 10: Verification

- [ ] **Step 1: Run backend tests**
Run: `cd backend && bun test`

- [ ] **Step 2: Run frontend build**
Run: `cd frontend && npm run build`

- [ ] **Step 3: Run Biome format**
Run: `cd backend && bunx biome check --write .`

- [ ] **Step 4: Final commit if formatting changes**
```bash
git add -A && git commit -m "chore: format and lint"
```
