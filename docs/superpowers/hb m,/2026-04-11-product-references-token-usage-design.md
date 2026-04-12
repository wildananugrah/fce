# Product References & Token Usage — Design Spec (Phase 1)

**Date:** 2026-04-11

## Overview

Three features:

1. **Product drawer sidebar menu** — Tabbed navigation (Details + References) matching the Brand Brain drawer pattern.
2. **Product References** — Upload files (PDF, DOCX, TXT, images) and add links as reference material. Files get text-extracted into `DocumentChunk` records. Links get scraped via background job. Images stored for multimodal AI. Reference content injected into AI generators with smart character limit.
3. **Token usage tracking** — Extract token counts from AI provider responses, display on profile/settings page and per-generation rows.

---

## 1. Product Drawer Sidebar Menu

Replace the current linear `ProductForm` inside the `Drawer` with a tabbed layout:

**Tabs:**
- **Details** — current product form fields (name, brand, type, price tier, summary, image, brain fields)
- **References** — file upload + link input + list of existing references

**Pattern:** Same as `NewBrandBrainDrawer` — left sidebar (w-48) with tab buttons, right content area switches based on active tab.

---

## 2. References Tab

### File Upload
- Drop zone accepting: PDF, DOCX, TXT, JPG, PNG, WebP
- Immediate upload to MinIO via existing document upload flow
- **Text files** (PDF/DOCX/TXT): queued for extraction via existing `document-extraction` job → creates `DocumentChunk` records
- **Images** (JPG/PNG/WebP): stored as `BrandDocument` with `sourceType = "image"`, no text extraction. Passed to AI as multimodal content.

### Link References
- Text input for URL + "Add" button
- On add: creates a `BrandDocument` record with `sourceType = "link"`, `fileUrl = the URL`, `fileName = the URL`
- Queues a new `link-scraping` background job that fetches the page, extracts text, stores as `DocumentChunk` records
- Shows extraction status (pending/processing/completed/failed)

### Reference List
- Shows all `BrandDocument` records for the product (`productId` filter)
- Each reference shows: filename/URL, type badge, extraction status, delete button
- Expandable to show extracted chunks preview

### Existing Infrastructure Reused
- `BrandDocument` model already has `productId` field
- `DocumentChunk` model already exists
- `DocumentExtractionJob` already handles PDF/DOCX/TXT
- `DocumentService.upload()` already supports `productId`
- `DocumentUpload` component pattern from Brand Detail page

---

## 3. Reference Injection into AI Generators

When generating topics/content/campaigns for a product, fetch the product's reference chunks and inject as context.

**Smart selection:** Take chunks ordered by `chunkIndex`, concatenate text until reaching 5000 characters total. Append as a context block after the product brain context.

**Image references:** Collect `BrandDocument` records where `sourceType = "image"` for the product. Pass their `fileUrl` values as `referenceImages` to the AI provider (multimodal).

**Where to inject:** In the generation jobs (`topic-generation.job.ts`, `content-generation.job.ts`), after fetching product brain versions, also fetch product reference chunks and images.

---

## 4. Token Usage Tracking

### Backend — Extract tokens from provider responses

**Anthropic:** `response.usage.input_tokens` and `response.usage.output_tokens` available on every response.

**Gemini:** `response.usageMetadata.promptTokenCount` and `response.usageMetadata.candidatesTokenCount` available on responses.

Update both providers to return token usage alongside the parsed output. Update generation jobs to pass token counts to `logAiActivity`.

### Frontend — Display

**Settings page:** Add "Token Usage" section showing:
- Total input tokens, total output tokens, total combined
- Number of generations
- Data fetched from `GET /api/workspaces/:id/ai-logs/usage?userId=me`

**Generation result rows:** Show token count badge on each completed row (from the `AiProviderLog` linked by `requestId`).

---

## 5. Files to Modify/Create

| Layer | File | Changes |
|-------|------|---------|
| Frontend | `frontend/src/components/products/ProductDrawer.tsx` | **New** — tabbed drawer with Details + References |
| Frontend | `frontend/src/components/products/ProductReferences.tsx` | **New** — file upload, link input, reference list |
| Frontend | `frontend/src/pages/ProductsPage.tsx` | Use `ProductDrawer` instead of `Drawer` + `ProductForm` |
| Frontend | `frontend/src/pages/SettingsPage.tsx` | Add token usage section |
| Frontend | `frontend/src/components/generation/GenerationResultRow.tsx` | Show token count badge |
| Backend | `backend/src/jobs/link-scraping.job.ts` | **New** — fetch URL, extract text, create chunks |
| Backend | `backend/src/index.ts` | Wire link-scraping job |
| Backend | `backend/src/routes/document.route.ts` | Add `GET /product/:productId` endpoint |
| Backend | `backend/src/services/document.service.ts` | Add `listByProduct()` method |
| Backend | `backend/src/repositories/document.repository.ts` | Add `findByProduct()` query |
| Backend | `backend/src/jobs/topic-generation.job.ts` | Fetch and inject product references |
| Backend | `backend/src/jobs/content-generation.job.ts` | Fetch and inject product references |
| Backend | `backend/src/providers/anthropic.provider.ts` | Return token usage from responses |
| Backend | `backend/src/providers/gemini.provider.ts` | Return token usage from responses |
| Backend | `backend/src/routes/ai-log.route.ts` | Add usage summary endpoint |
