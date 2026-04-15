# Campaign PDF Generator — Design Spec

**Date:** 2026-04-15
**Status:** Approved, pending implementation plan
**Owner:** Campaign Generator feature

## Goal

On the Campaign Generator page, let users upload a PDF brief (client deck, marketing plan, product launch doc) and have the system produce three AI-generated artifacts grounded in the user's brand:

1. **Document summary** — a concise AI description of what the PDF is about
2. **Campaign plan** — big idea, messaging pillars, objective, audience, channel mix, budget range, duration
3. **Generated topics** — a batch of 8 content topics linked to the campaign, ready to feed into the existing Content Generator

All three land as editable records the user can refine, and the topics flow into the existing Topic Library / Content Generator pipeline.

## Non-goals

- Multi-file upload (one PDF per campaign for v1)
- DOCX / TXT support (PDF only for v1; extraction job already handles DOCX, easy to add later)
- Editing the extracted PDF text before the AI runs (AI always sees raw extraction)
- "Regenerate plan" / "Regenerate topics" buttons (v1 requires delete + re-upload)
- User-specified topic count (fixed at 8 for v1)
- PDF-only campaigns (brand is required so topics can flow into Content Generator)
- Replacing the existing manual "New Campaign" modal (the two flows coexist)

## User flow

### Entry points

The Campaigns page empty state and list-page header both show two buttons:

- **Upload Brief (PDF)** — primary, sparkles icon — opens the Upload Brief modal
- **Create Manually** — secondary — opens the existing [CampaignsPage.tsx:149](backend/../frontend/src/pages/CampaignsPage.tsx#L149) modal, unchanged

### Step 1 — Upload Brief modal

Small focused modal with three fields:

- **Brand** — required, dropdown of workspace brands
- **Product** — optional, dropdown filtered to the selected brand's products
- **File** — dropzone accepting `.pdf` only, 10 MB cap (client-side validation + server-side enforcement)

Submit button is disabled until brand + file are present. On submit:

1. Frontend POSTs `multipart/form-data` to `POST /api/workspaces/:workspaceId/campaigns/upload-brief`
2. Backend uploads the file to MinIO, creates a `Campaign` row with `status='generating'`, `generationStage='extracting'`, and `name` defaulted to the PDF filename (minus extension) — user can rename later on the detail page. Creates a `CampaignBrief` row with the file URL. Enqueues a `campaign-pdf-generation` pg-boss job.
3. Response returns the new `campaignId`
4. Modal closes and frontend navigates to `/campaigns/:id`

### Step 2 — Campaign Detail page (progress)

New page at `/campaigns/:id`. While `Campaign.status === 'generating'` it shows a **CampaignProgressPanel** with four stages, driven by SSE events pushed from the worker:

| # | Label | Fires when |
|---|---|---|
| 1 | Uploading & extracting PDF | `stage='extracting'` (set at job start) |
| 2 | Writing summary | `stage='summarizing'` |
| 3 | Building campaign plan | `stage='planning'` |
| 4 | Generating topics | `stage='topics'` |

Each stage renders as spinner → checkmark as the worker advances. The worker updates `Campaign.status` (or a new `Campaign.generationStage` field — see Data model) and the `NotificationService` pushes SSE events the frontend's `useSSE` hook already consumes.

If any stage fails, `Campaign.status='failed'` is set with `errorMessage` and the panel shows the error with a "Delete and try again" button.

### Step 3 — Campaign Detail page (results)

When `Campaign.status === 'completed'`, the page renders three cards stacked vertically:

**Document Summary Card**
- 3–5 sentence AI summary (from `CampaignBrief.documentSummary`)
- Link to the original PDF (via `CampaignBrief.documentUrl`)
- Read-only

**Campaign Plan Card** — editable
- Objective, audience segment, key message, budget range, duration (from `Campaign` columns)
- Big idea, messaging pillars, funnel journey, channel roles (from `CampaignOutput`)
- Inline edit, persist on blur via existing `PATCH /campaigns/:id` and `PATCH /campaigns/:id/brief` routes

**Topics List**
- 8 rows with title / description / pillar / platform / format
- Each row has a **Generate Content** button that routes to `/generate?topicId=…&brandId=…&productId=…&platform=…&format=…` — identical to the button already wired into [TopicDetailDrawer.tsx:313](frontend/src/components/topics/TopicDetailDrawer.tsx#L313)
- Topics also appear in the existing Topic Library, filterable by the new `campaignId` field

No separate approval step — the rows exist as soon as the job finishes and editing persists incrementally.

## Backend pipeline

### New pg-boss job: `campaign-pdf-generation`

Handler lives in `backend/src/jobs/campaign-pdf-generation.job.ts`. Receives `{ campaignId, userId }`. Runs four sequential stages.

During stages 1–4 `Campaign.status` stays `'generating'`; the `generationStage` column advances (`'extracting' → 'summarizing' → 'planning' → 'topics'`) and an SSE event is pushed before each stage starts its work. On success, `status='completed'` and `generationStage=null`. On failure at any stage, `status='failed'`, `errorMessage` is populated, and `generationStage` holds the stage that failed so the UI can highlight it.

#### Stage 1 — Extract

- Fetch the PDF from the MinIO URL stored on `CampaignBrief.documentUrl`
- Run `pdf-parse` (same library [document-extraction.job.ts:47](backend/src/jobs/document-extraction.job.ts#L47) uses)
- Plain-text output, truncate to ~15k tokens / ~60k chars (whichever is smaller)
- No DB write for the extraction itself in v1; the text is passed in-memory to Stage 2

Failure → `status='failed'`, `errorMessage='Could not read PDF: …'`

#### Stage 2 — Summarize

New provider method `summarizeBrief(input) → BriefSummaryOutput` added to Gemini and Anthropic providers, declared behind a new `ICampaignBriefSummarizer` interface.

**Input:**
```
{ extractedText, brandContext, productContext? }
```

**Output (structured JSON):**
```
{
  summary: string,            // 3-5 sentence description of the brief
  objective: string,          // inferred primary objective
  audienceHint: string,       // inferred audience segment
  keyMessage: string,         // inferred key message
  budgetHint: string,         // if mentioned in PDF, else ""
  channelHint: string[],      // array of channel codes inferred
  durationHint: {             // if timing mentioned, else nulls
    start: string | null,
    end: string | null
  }
}
```

Prompt template goes in `backend/src/utils/prompt-builder.ts` next to the existing content/topic/campaign templates.

Persistence:
- `CampaignBrief.documentSummary ← summary`
- `Campaign.objective ← objective` (only if currently empty)
- `Campaign.audienceSegment ← audienceHint` (only if currently empty)
- `Campaign.keyMessage ← keyMessage` (only if currently empty)
- `Campaign.channelMix ← channelHint` (only if currently empty)
- `Campaign.durationStart/End ← durationHint` (only if currently empty)

Wrapped in `logAiActivity({ generatorType: 'campaign_brief_summary' })`.

Failure → `status='failed'`, `errorMessage='Could not summarize brief: …'`

#### Stage 3 — Plan

Reuse the existing `ICampaignGenerator.generate()` already implemented in both providers. Feed it:

- `brandContext` — from Brand Brain active version
- `objective`, `budget`, `channelMix`, `culturalContext` — from the Campaign row (now populated by Stage 2)

Output: `{ bigIdea, messagingPillars, funnelJourney, channelRoles }`

Persistence: new `CampaignOutput` row via existing repository.

Wrapped in `logAiActivity({ generatorType: 'campaign_plan' })`.

Failure → `status='failed'`, `errorMessage='Could not build campaign plan: …'`

#### Stage 4 — Topics

Reuse the existing `ITopicGenerator.generate()`. Feed it:

- `brandContext`, `productContexts` — from Brand Brain / Product Brain
- `prompt` — synthesized from `Campaign.description` + `bigIdea` + `messagingPillars` so the AI grounds topics in the campaign concept
- `count: 8`

Output: `{ topics: [{ title, description, pillar, platform, format, objective, publishDate }] }`

Persistence: 8 `ContentTopic` rows, each with:
- `workspaceId`, `brandId`, `campaignId ← new column`
- All returned topic fields
- `status='draft'`
- Product links via `ContentTopicProduct` if a product was selected

Wrapped in `logAiActivity({ generatorType: 'campaign_topics' })`.

On success: `Campaign.status='completed'`, final SSE pushed.

Failure → `status='failed'`, `errorMessage='Could not generate topics: …'`

### New REST endpoint

`POST /api/workspaces/:workspaceId/campaigns/upload-brief`

- Multipart body: `brandId`, `productId?`, `file`
- Server-side validation: brand exists and belongs to workspace; product (if present) belongs to the brand; file MIME is `application/pdf`; file size ≤ 10 MB
- Creates `Campaign` + `CampaignBrief` rows, uploads file to MinIO, enqueues job
- Returns `{ data: { campaignId } }`

### Worker registration

`backend/src/index.ts` registers the new worker alongside the existing `campaign-generation`, `content-generation`, `brand-scraping`, etc. workers. Same DI pattern — constructor injection of `CampaignRepository`, `ContentTopicRepository`, `BrandRepository`, `ProductRepository`, `ICampaignBriefSummarizer`, `ICampaignGenerator`, `ITopicGenerator`, `IMinioProvider`, `NotificationService`, `Logger`.

## Data model changes

Three additive schema edits. No destructive migrations.

### 1. `ContentTopic` — add `campaignId`

```prisma
model ContentTopic {
  // ... existing fields ...
  campaignId  String?   @map("campaign_id")
  campaign    Campaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)

  @@index([campaignId])
}
```

Why: lets us (a) list topics for a specific campaign on the detail page, (b) filter the Topic Library by campaign, (c) delete topics cleanly when a campaign is deleted without breaking referential integrity.

### 2. `CampaignBrief` — add summary + document link

```prisma
model CampaignBrief {
  // ... existing fields ...
  documentSummary String? @map("document_summary") @db.Text
  documentUrl     String? @map("document_url")
  documentName    String? @map("document_name")
}
```

`documentUrl` is the MinIO object URL; `documentName` lets the UI show the original filename.

### 3. `Campaign` — add `generationStage` (optional alternative to using status)

```prisma
model Campaign {
  // ... existing fields ...
  generationStage String? @map("generation_stage")
  errorMessage    String? @map("error_message") @db.Text
}
```

`generationStage` holds `'extracting' | 'summarizing' | 'planning' | 'topics' | null` so the frontend progress panel knows which stage is active without overloading `status`. `errorMessage` surfaces stage failures to the UI.

## New files

**Backend:**
- `backend/src/jobs/campaign-pdf-generation.job.ts` — 4-stage handler
- `backend/src/services/campaign-brief-summarizer.service.ts` — thin provider wrapper (or keep it inside the providers; decide in plan)
- `backend/src/interfaces/providers/campaign-brief-summarizer.interface.ts` — `ICampaignBriefSummarizer`

**Frontend:**
- `frontend/src/pages/CampaignDetailPage.tsx` — progress + results view
- `frontend/src/components/campaigns/UploadBriefModal.tsx` — 3-field upload modal
- `frontend/src/components/campaigns/CampaignProgressPanel.tsx` — 4-stage indicator
- `frontend/src/components/campaigns/CampaignSummaryCard.tsx`
- `frontend/src/components/campaigns/CampaignPlanCard.tsx`
- `frontend/src/components/campaigns/CampaignTopicsList.tsx`

## Edited files

**Backend:**
- `backend/prisma/schema.prisma` — three model edits + migration
- `backend/src/routes/campaign.route.ts` — new `POST /upload-brief` route
- `backend/src/services/campaign.service.ts` — `createFromBrief()` method
- `backend/src/providers/gemini.provider.ts` — implement `summarizeBrief()`
- `backend/src/providers/anthropic.provider.ts` — implement `summarizeBrief()`
- `backend/src/utils/prompt-builder.ts` — new `BRIEF_SUMMARY_PROMPT` template
- `backend/src/index.ts` — register the new pg-boss worker

**Frontend:**
- `frontend/src/pages/CampaignsPage.tsx` — empty state gets two buttons; row click routes to detail page
- `frontend/src/App.tsx` — add route `/campaigns/:id`
- `frontend/src/hooks/useSSE.ts` — add handler for `campaign_generation_progress` event type (or reuse existing generic event channel)

## AI activity logging

Every AI call in the pipeline writes to `ai_provider_logs` via `logAiActivity()`, matching the pattern in [CLAUDE.md](CLAUDE.md). Generator types:

- `campaign_brief_summary`
- `campaign_plan` (already exists — reuse)
- `campaign_topics` (new — mark as variant of `topic_generation`)

Each row captures workspace, user, provider, model, prompts, response, tokens, duration, cost, status — standard pattern.

## Error handling

Each stage's failure must:
1. Update `Campaign.status='failed'`, `Campaign.errorMessage=<concise reason>`
2. Push an SSE `campaign_generation_failed` event
3. Write an AI activity log row with `status='error'` (if the failure was inside an AI call)

The frontend progress panel renders the error message and a "Delete and retry" button (which deletes the campaign record and returns the user to the campaigns list).

No automatic retries in v1. If the user wants to retry, they delete and re-upload. Simple.

## Security & validation

- File type check: server validates MIME type and file magic bytes (not just extension)
- File size: 10 MB hard cap enforced server-side
- MinIO object key namespaced by `workspaceId` to prevent cross-workspace access
- Brand/product membership verified before enqueuing the job
- Existing workspace middleware (`workspaceId`, role check) applies to the new route

## Testing approach

- **Unit**: service-level tests for `createFromBrief()` (mock repo + mock boss), and for the `campaign-pdf-generation.job.ts` handler staged through a mock provider + in-memory repo
- **Unit**: Gemini/Anthropic provider `summarizeBrief()` with canned PDF text inputs
- **No integration/E2E**: follows the repo convention — services tested via mocks, no real AI or DB in unit tests

## Open questions

None. All decisions locked during brainstorming.
