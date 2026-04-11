# Topic Generator Enhancements — Design Spec

**Date:** 2026-04-11
**Approach:** Incremental Enhancement (Approach A)

## Overview

Four feature updates to the topic generation system:

1. **Multi-Product Support** — Topics can reference multiple products (many-to-many). The AI receives context from all selected products to generate cross-product topic ideas.
2. **Upstream Format Selection** — Format selection moves from content generation to topic generation. Users select one or more allowed formats; the AI assigns one per topic.
3. **Inline Editing** — All fields on generated topic cards are always-editable (title, description, pillar, format, platform, objective, publish date, products).
4. **Granular Regeneration** — Per-card "Regenerate" button with optional free-text hint replaces the current "Regenerate All" button.

---

## 1. Database Changes

### New join table: `ContentTopicProduct`

```prisma
model ContentTopicProduct {
  id             String       @id @default(uuid())
  contentTopicId String       @map("content_topic_id")
  productId      String       @map("product_id")

  contentTopic   ContentTopic @relation(fields: [contentTopicId], references: [id], onDelete: Cascade)
  product        Product      @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([contentTopicId, productId])
  @@map("content_topic_products")
}
```

### Changes to `ContentTopic`

- Remove `productId` field and its relation
- Add `products ContentTopicProduct[]` relation

### Changes to `Product`

- Add `contentTopicProducts ContentTopicProduct[]` relation

### Migration

Drop the old `productId` column. Existing topics with `productId` values can be migrated into the join table via a migration script if needed, but given these are draft/ephemeral records this is optional.

---

## 2. Backend Changes

### Type changes

**`GenerateTopicsInput`:**
- `productId?: string` → `productIds?: string[]`
- Add `formats?: string[]`

**`CreateTopicInput`:**
- `productId?: string` → `productIds?: string[]`

**`UpdateTopicInput`:**
- Add `productIds?: string[]`

### Topic generation job (`topic-generation.job.ts`)

- `TopicJobData.productId` → `productIds?: string[]`
- Fetch brain versions for **all** selected products, concatenate contexts:
  ```
  Product 1 context: {...}
  Product 2 context: {...}
  ```
- When creating `ContentTopic` records, also create `ContentTopicProduct` entries for each product via nested create
- Pass `formats` through to the prompt builder

### Prompt builder (`prompt-builder.ts`)

**`TopicGenerationInput` interface:**
- `productContext?: string` → `productContexts?: string[]`
- Add `formats?: string[]`

**`buildContextBlock`:**
- Accept array of product contexts, concatenate with labels

**`buildTopicGenerationPrompt` user prompt additions:**
- When `formats` provided: `"Allowed content formats: ${formats.join(', ')}. Assign exactly one format per topic from this list."`
- When multiple product contexts: include all in context block

### Topic routes (`topic.route.ts`)

**Modified endpoints:**
- `POST /generate` — accept `productIds: string[]` and `formats: string[]` instead of `productId`
- `POST /` (create single) — accept `productIds: string[]`
- `PATCH /:id` (update) — accept `productIds: string[]`, handle join table sync (delete old + create new)
- `GET /` and `GET /:id` — include `products` relation (with product details) in response

**New endpoint for saved topics:**
- `POST /:id/regenerate` — single-topic regeneration for already-saved topics
  - Body: `{ hint?: string }`
  - Fetches existing topic's context (brand, associated products, platform, format, objective)
  - Enqueues a pg-boss `topic-regeneration` job (consistent with existing async AI pattern)
  - Returns 202 with jobId
  - Job calls AI for 1 replacement topic, updates existing record in place
  - Sends SSE `topic_regenerated` event on completion

**New endpoint for unsaved preview topics:**
- `POST /regenerate-preview` — regenerate a single topic in preview (before save)
  - Body: `{ brandId, productIds?, platform?, format?, objective?, hint? }`
  - Enqueues a pg-boss `topic-regeneration` job with the provided context
  - Returns 202 with jobId
  - Job calls AI for 1 new topic, sends result via SSE `topic_preview_regenerated` event (no DB write to ContentTopic)

### Topic service (`topic.service.ts`)

- `generate()` — pass `productIds` and `formats` to job data
- `create()` — create topic + join table entries in a transaction
- `update()` — update topic fields + sync join table in a transaction
- New `regenerate(topicId: string, hint?: string)` — enqueues `topic-regeneration` job for saved topics
- New `regeneratePreview(params, hint?)` — enqueues `topic-regeneration` job for unsaved preview topics

### Topic repository (`topic.repository.ts`)

- Update `list()` and `getById()` queries to include `products: { include: { product: true } }`
- Update `create()` to handle `productIds` via nested creates
- Update `update()` to sync join table

### Topic generator interface

**`TopicGenerationInput`:**
- `productContext?: string` → `productContexts?: string[]`
- Add `formats?: string[]`

---

## 3. Frontend Changes

### TopicsPage form updates

**Multi-product selector:**
- Replace single product dropdown with multi-select chip/tag component
- When brand is selected, show its products as selectable chips
- Selected products are highlighted; `productIds` array sent to API

**Format selector:**
- New section below platform selection
- Shows platform-specific format options from the `PLATFORM_FORMATS` map (same data as GeneratePage)
- Multi-select chips — user picks one or more allowed formats
- Options change when platform changes
- `formats` array sent to API

### Topic card updates (preview section)

**Always-editable fields:**
All fields render as form inputs since cards are draft previews:
- Title → text input
- Description → textarea
- Pillar → text input or dropdown (from brand's `contentPillars`)
- Format → dropdown (from platform's format options via `PLATFORM_FORMATS`)
- Platform → dropdown (from `PLATFORMS` list)
- Objective → dropdown (from objective options)
- Publish date → date input
- Products → multi-select chips (from brand's products)

**Per-card regenerate button:**
- Each card gets a "Regenerate" button
- Clicking shows an inline text input for optional hint (e.g., "make it more educational")
- **Unsaved preview topics:** Calls `POST /topics/regenerate-preview` with the card's current context (brand, products, platform, format, objective) + hint. Listens for SSE `topic_preview_regenerated` event and replaces the card in local state.
- **Saved topics (in TopicLibraryPage):** Calls `POST /topics/:id/regenerate` with hint. Listens for SSE `topic_regenerated` event and refreshes the topic.
- Card shows loading spinner while regenerating, then updates in place

**Remove "Regenerate All":**
- The current regenerate button in the preview header is removed

### TopicsPage component extraction

Extract the topic card into a `TopicCard` component to keep TopicsPage manageable, since each card now has editing + regeneration responsibilities.

### GeneratePage impact

- When navigating from TopicLibrary → GeneratePage, the format is pre-filled from the topic's `format` field
- Format selector on GeneratePage remains for direct content generation (no topic)
- Auto-populated when coming from a topic

### TopicLibraryPage impact

- Product display: show multiple product names/badges per topic instead of single product
- "Generate" link: pass `format` from topic to GeneratePage URL params
- Filters: may need updating if product filter exists

---

## 4. Prompt Engineering

### Topic generation prompt (multi-product + formats)

**System prompt** — unchanged structure, but context block now includes multiple product contexts:
```
You are an expert content strategist. You have the following brand context:
{brandContext}

Product 1 context:
{product1Context}

Product 2 context:
{product2Context}

{skillContext}
```

**User prompt** — additions:
```
Generate {count} content topic ideas for {platform}.
Content objective: {objective}
Schedule date range: {dateFrom} to {dateTo}. Distribute publishDate values evenly.
Allowed content formats: carousel, reels, single_image. Assign exactly one format per topic from this list.
The topics should bridge or combine the provided products where relevant.

Return JSON with a single field:
- topics (array of {count} objects, each with: title, description, pillar, platform, format, objective, publishDate)
```

### Single-topic regeneration prompt

**System prompt** — same as topic generation (brand + product context)

**User prompt:**
```
Regenerate a single content topic idea.
Current topic for reference: "{existingTitle}" — "{existingDescription}"
Platform: {platform}
Format: {format}
Objective: {objective}
{hint ? `Additional guidance: ${hint}` : ''}

Return JSON with a single field:
- topics (array of 1 object with: title, description, pillar, platform, format, objective, publishDate)

Generate a fresh, different idea while maintaining the same format and platform.
```

---

## 5. Files to modify

| Layer | File | Changes |
|-------|------|---------|
| Schema | `backend/prisma/schema.prisma` | Add `ContentTopicProduct`, update `ContentTopic`, `Product` |
| Types | `backend/src/types/topic.types.ts` | `productIds`, `formats` fields |
| Interface | `backend/src/interfaces/providers/topic-generator.interface.ts` | `productContexts`, `formats` |
| Prompt | `backend/src/utils/prompt-builder.ts` | Multi-product context, formats instruction |
| Job | `backend/src/jobs/topic-generation.job.ts` | Multi-product fetch, join table creation, formats passthrough |
| Service | `backend/src/services/topic.service.ts` | `regenerate()`, updated `create()`/`update()` |
| Repository | `backend/src/repositories/topic.repository.ts` | Include products relation, join table sync |
| Routes | `backend/src/routes/topic.route.ts` | `productIds`/`formats` params, `POST /:id/regenerate` |
| Frontend | `frontend/src/pages/TopicsPage.tsx` | Multi-product chips, format chips, editable cards, per-card regen |
| Frontend | `frontend/src/pages/TopicLibraryPage.tsx` | Multi-product display, format in generate link |
| Frontend | `frontend/src/pages/GeneratePage.tsx` | Auto-fill format from topic |
