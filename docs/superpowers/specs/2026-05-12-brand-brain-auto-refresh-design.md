# Brand Brain Auto-Refresh from References — Design

**Date:** 2026-05-12  
**Status:** Approved

## Summary

When a user uploads a reference file or adds a link in the References tab of a brand, the system automatically triggers a full brand brain re-analysis. The AI reads all document chunks stored for the brand (all uploaded files + scraped links), merges them with the brand's website URL (if set), and generates a new active brain version. An SSE notification is pushed when the job completes. The frontend blocks page navigation while the job is running and shows a success toast when done.

---

## Data Flow

```
User uploads file / adds link (References tab)
        ↓
document-extraction.job  OR  link-scraping.job  (existing)
        ↓  on completion — chunks written, status = "completed"
enqueue  brand-brain-refresh  { brandId, workspaceId, userId }
        ↓
BrandBrainRefreshJob:
  1. Fetch brand record  (websiteUrl, language)
  2. Query all BrandDocument chunks for brandId (extractionStatus = "completed", all sources)
  3. Concatenate chunk contentText → mergedContext (capped at 10 000 chars)
  4. Call brandScraper.scrape({ fileText: mergedContext, url: brand.websiteUrl, language })
  5. Deactivate current active BrandBrainVersion
  6. Create new active BrandBrainVersion (same pattern as brand-scraping.job.ts)
  7. Push SSE notification { type: "brand_brain_updated", brandId, message: "Brand brain updated" }
        ↓
Frontend (BrandBrainForm — References tab, edit mode):
  - Upload/link-add completes → brainRefreshing = true
  - Banner displayed, useUnsavedAsync blocks navigation
  - SSE listener fires on brand_brain_updated for this brandId
      → brainRefreshing = false
      → toast "Brand brain updated ✓"
      → re-fetch active brain version → update form fields
```

---

## Backend

### New file: `backend/src/jobs/brand-brain-refresh.job.ts`

A new pg-boss worker. Dependencies injected at construction:
- `prisma: PrismaClient`
- `aiFactory: AiProviderFactory`
- `brandService: IBrandService`
- `notificationService: NotificationService`
- `logger: Logger`

**Job payload:**
```typescript
{ brandId: string; workspaceId: string; userId: string }
```

**Logic:**
1. Fetch brand: `prisma.brand.findUnique({ where: { id: brandId }, select: { websiteUrl, language } })`
2. Fetch all completed chunks:
   ```typescript
   prisma.brandDocument.findMany({
     where: { brandId, extractionStatus: "completed" },
     include: { chunks: { orderBy: { chunkIndex: "asc" } } },
   })
   ```
3. Concatenate `chunk.contentText` across all docs, skip image types (`image/jpeg`, `image/png`, `image/webp`), cap total at **10 000 characters**.
4. If no text content found (no chunks), skip brain creation and return early.
5. Call AI: `aiFactory.getBrandScraper(workspaceId).scrape({ fileText: mergedContext, url: brand.websiteUrl ?? undefined, language: brand.language ?? undefined })`
6. Map AI result → brain version payload (same mapping as `brand-scraping.job.ts`)
7. `brandService.createBrainVersion(brandId, payload)` — this deactivates old versions and creates a new active one
8. `notificationService.notify(userId, { type: "brand_brain_updated", brandId, message: "Brand brain updated from references" })`

### Modify: `backend/src/jobs/document-extraction.job.ts`

At the end of successful extraction (after status set to `"completed"`), add:
```typescript
if (doc.brandId) {
  await this.boss.send("brand-brain-refresh", {
    brandId: doc.brandId,
    workspaceId: doc.workspaceId,
    userId: jobData.userId,
  });
}
```

`userId` must be threaded through the `document-extraction` job payload. The `document-extraction` job payload currently has `{ documentId, fileUrl, fileName, fileType }` — add `userId` to this when the job is enqueued in `DocumentService.upload()`.

### Modify: `backend/src/jobs/link-scraping.job.ts`

Same as above — at the end of successful scraping (after status set to `"completed"`):
```typescript
if (doc.brandId) {
  await this.boss.send("brand-brain-refresh", {
    brandId: doc.brandId,
    workspaceId: doc.workspaceId,
    userId: jobData.userId,
  });
}
```

`userId` must be threaded through the `link-scraping` job payload. The `link-scraping` payload currently has `{ documentId, url }` — add `userId` when the job is enqueued in `DocumentService.addLink()`.

### Modify: `backend/src/services/document.service.ts`

- `upload(workspaceId, brandId, file, productId?, sourceType?, userId?)` — pass `userId` through to the `document-extraction` job payload
- `addLink(workspaceId, brandId, url, productId?, userId?)` — pass `userId` through to the `link-scraping` job payload

### Modify: `backend/src/routes/document.route.ts`

Pass `userId` (already available from `c.get("userId")`) when calling `documentService.upload()` and `documentService.addLink()`.

### Modify: `backend/src/index.ts`

Register the new `BrandBrainRefreshJob` worker at startup alongside existing job registrations.

---

## Frontend

### Modify: `frontend/src/components/products/ProductReferences.tsx`

Add optional prop:
```typescript
onReferenceAdded?: () => void;
```

Call `onReferenceAdded?.()` after a successful file upload response and after a successful link-add response. The component stays unaware of brain logic.

### Modify: `frontend/src/components/brands/BrandBrainForm.tsx`

In edit mode (`isEditMode === true`), in the References tab:

1. Add state:
   ```typescript
   const [brainRefreshing, setBrainRefreshing] = useState(false);
   ```

2. Block navigation while refreshing:
   ```typescript
   useUnsavedAsync(
     brainRefreshing,
     "Brand brain is being updated from references — leave anyway? Your progress will be lost.",
   );
   ```

3. SSE listener — using the existing `useSSE` hook, listen for `brand_brain_updated` events. When the event's `brandId` matches the current brand, set `brainRefreshing = false`, show a success toast, and re-fetch the brand to reload form fields:
   ```typescript
   useSSE((event) => {
     if (event.type === "brand_brain_updated" && event.brandId === editBrand?.id) {
       setBrainRefreshing(false);
       // show toast
       // re-fetch brand brain and update form fields
     }
   });
   ```

4. Refreshing banner inside the References tab content area (shown while `brainRefreshing`):
   ```
   ┌────────────────────────────────────────────────────────┐
   │  ⟳  Updating brand brain from references…             │
   │  Your brand brain will refresh once analysis is done.  │
   └────────────────────────────────────────────────────────┘
   ```

5. Pass callback to `ProductReferences`:
   ```tsx
   <ProductReferences
     ...
     onReferenceAdded={() => setBrainRefreshing(true)}
   />
   ```

---

## Error Handling

- If the `brand-brain-refresh` job fails (AI error, no chunks, etc.), it logs the error and does **not** push a notification. The existing brain version remains active. No user-facing error is shown — the brand brain is simply unchanged.
- If no completed chunks exist for the brand when the refresh job runs (e.g. extraction failed), the job exits early without creating a new brain version.
- The `useUnsavedAsync` block is tied to `brainRefreshing` state. If the user force-navigates away (confirms the alert), the SSE listener will not fire and the brain will still be updated silently in the background.

---

## Constraints

- Brain refresh only triggers for **brand-level** documents (`doc.brandId` must be set and `doc.productId` must be null/undefined). Product-level document uploads do not trigger brand brain refresh.
- One refresh job per upload — no debouncing. Multiple rapid uploads may trigger overlapping jobs; each produces its own new brain version. The last one to complete wins (it will be the latest active version).
- The 10 000 char cap on merged context prevents runaway token usage when a brand has many large documents.
- No schema migrations required — all new behavior uses existing tables and columns.
