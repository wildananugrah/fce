# Campaign PDF Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload a PDF brief on the Campaign Generator page and have the system produce (1) a document summary, (2) an AI-generated campaign plan, and (3) a batch of linked content topics — all as a 4-stage pg-boss job with live SSE progress.

**Architecture:** Additive database schema changes, one new pg-boss queue (`campaign-pdf-generation`) whose handler runs four sequential stages reusing existing `ICampaignGenerator` and `ITopicGenerator` plus a new `ICampaignBriefSummarizer` provider method. Frontend gets an upload modal plus a dedicated `/campaigns/:id` detail page that subscribes to SSE and renders three result cards (summary / plan / topics).

**Tech Stack:** Bun + Hono + Prisma 7 + pg-boss (backend); React 19 + React Router 7 + Tailwind 4 (frontend); Gemini and Anthropic providers; `pdf-parse` for PDF extraction (already in repo).

**Spec:** [docs/superpowers/specs/2026-04-15-campaign-pdf-generator-design.md](../specs/2026-04-15-campaign-pdf-generator-design.md)

---

## Overview — file structure

### Files to create

**Backend:**
- `backend/src/interfaces/providers/campaign-brief-summarizer.interface.ts` — `ICampaignBriefSummarizer` + input/output types
- `backend/src/jobs/campaign-pdf-generation.job.ts` — 4-stage handler
- `backend/tests/services/campaign.service.test.ts` — extended (existing file)

**Frontend:**
- `frontend/src/pages/CampaignDetailPage.tsx` — progress + results view
- `frontend/src/components/campaigns/UploadBriefModal.tsx` — 3-field upload modal
- `frontend/src/components/campaigns/CampaignProgressPanel.tsx` — 4-stage indicator
- `frontend/src/components/campaigns/CampaignSummaryCard.tsx`
- `frontend/src/components/campaigns/CampaignPlanCard.tsx`
- `frontend/src/components/campaigns/CampaignTopicsList.tsx`

### Files to modify

**Backend:**
- `backend/prisma/schema.prisma` — schema additions for Campaign, CampaignBrief, ContentTopic
- `backend/src/types/campaign.types.ts` — new input types
- `backend/src/interfaces/repositories/campaign.repository.interface.ts` — extended `create` and `update` signatures, new `createBrief` fields
- `backend/src/repositories/campaign.repository.ts` — matching implementation
- `backend/tests/helpers/mock-campaign.repository.ts` — match new signatures
- `backend/src/services/campaign.service.ts` — `createFromBrief()` method
- `backend/src/routes/campaign.route.ts` — new `POST /upload-brief` route
- `backend/src/providers/gemini.provider.ts` — implement `summarizeBrief()`
- `backend/src/providers/anthropic.provider.ts` — implement `summarizeBrief()`
- `backend/src/utils/prompt-builder.ts` — new `buildBriefSummaryPrompt()` function
- `backend/src/index.ts` — register new DI + pg-boss worker

**Frontend:**
- `frontend/src/pages/CampaignsPage.tsx` — empty state + header buttons
- `frontend/src/App.tsx` — add `/campaigns/:id` route
- `frontend/src/hooks/useSSE.ts` — add campaign PDF event types

---

## Phase 1 — Database schema

### Task 1: Prisma schema additions + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Edit Campaign model**

Open `backend/prisma/schema.prisma`, find `model Campaign` (around line 316), and add two fields after `status` (before `createdAt`):

```prisma
model Campaign {
  // ... existing fields through status ...
  status          String    @default("draft")
  generationStage String?   @map("generation_stage")
  errorMessage    String?   @map("error_message") @db.Text
  createdAt       DateTime  @default(now()) @map("created_at")
  // ... rest unchanged ...
}
```

- [ ] **Step 2: Edit CampaignBrief model**

Find `model CampaignBrief` (around line 365). Add three fields after `toneDirection` (before `createdAt`):

```prisma
model CampaignBrief {
  // ... existing fields through toneDirection ...
  toneDirection         String?  @map("tone_direction")
  documentSummary       String?  @map("document_summary") @db.Text
  documentUrl           String?  @map("document_url")
  documentName          String?  @map("document_name")
  createdAt             DateTime @default(now()) @map("created_at")
  // ... rest unchanged ...
}
```

- [ ] **Step 3: Edit ContentTopic model**

Find `model ContentTopic` (around line 430). Add `campaignId` after `brandId` and a `campaign` relation after `brand`:

```prisma
model ContentTopic {
  id          String    @id @default(uuid())
  workspaceId String    @map("workspace_id")
  brandId     String?   @map("brand_id")
  campaignId  String?   @map("campaign_id")
  title       String
  // ... rest of existing fields unchanged ...

  workspace          Workspace              @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  brand              Brand?                 @relation(fields: [brandId], references: [id], onDelete: SetNull)
  campaign           Campaign?              @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  products           ContentTopicProduct[]
  generationRequests GenerationRequest[]

  @@index([workspaceId])
  @@index([brandId])
  @@index([campaignId])
  @@map("content_topics")
}
```

- [ ] **Step 4: Add inverse relation on Campaign model**

Back in `model Campaign`, add a `topics` relation alongside the existing `outputs` and `briefs` relations:

```prisma
model Campaign {
  // ... existing fields ...
  workspace Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  outputs   CampaignOutput[]
  briefs    CampaignBrief[]
  topics    ContentTopic[]

  @@index([workspaceId])
  @@map("campaigns")
}
```

- [ ] **Step 5: Sync schema to database and regenerate client**

```bash
cd backend && bunx prisma db push && bunx prisma generate
```

Expected: "Your database is now in sync with your Prisma schema" and Prisma client generation succeeds.

- [ ] **Step 6: Verify typecheck still passes (schema consumers unchanged)**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "error TS" | head -5
```

Expected: no new errors introduced by the schema change. Pre-existing errors in `dashboard.route.ts`, `generation.service.ts`, and test helpers may still show — those are not caused by this task.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(db): add campaign PDF generator schema fields

- Campaign.generationStage + errorMessage
- CampaignBrief.documentSummary + documentUrl + documentName
- ContentTopic.campaignId + inverse Campaign.topics relation"
```

---

### Task 2: Extend CampaignRepository interface + implementation

**Files:**
- Modify: `backend/src/interfaces/repositories/campaign.repository.interface.ts`
- Modify: `backend/src/repositories/campaign.repository.ts`

- [ ] **Step 1: Extend the interface**

Open `backend/src/interfaces/repositories/campaign.repository.interface.ts` and update the `create` and `update` method signatures, and the `createBrief` signature via `CreateBriefInput` (updated in Task 3). For `create` and `update`, add the new optional fields:

```typescript
create(data: {
  workspaceId: string;
  brandId?: string;
  productId?: string;
  name: string;
  description?: string;
  objective?: string;
  budget?: string;
  channelMix?: any;
  culturalContext?: string;
  audienceSegment?: string;
  durationStart?: Date;
  durationEnd?: Date;
  budgetMin?: number;
  budgetMax?: number;
  keyMessage?: string;
  status?: string;
  generationStage?: string;
}): Promise<Campaign>;

update(
  id: string,
  data: Partial<Pick<Campaign, "name" | "description" | "objective" | "status" | "generationStage" | "errorMessage" | "audienceSegment" | "keyMessage" | "channelMix" | "durationStart" | "durationEnd">>,
): Promise<Campaign>;
```

- [ ] **Step 2: Update the repository implementation**

Open `backend/src/repositories/campaign.repository.ts`. Find the `create` method and pass `status` and `generationStage` through to Prisma:

```typescript
async create(data: {
  // ... existing signature + new fields ...
}): Promise<Campaign> {
  return this.prisma.campaign.create({
    data: {
      workspaceId: data.workspaceId,
      brandId: data.brandId,
      productId: data.productId,
      name: data.name,
      description: data.description,
      objective: data.objective,
      budget: data.budget,
      channelMix: data.channelMix,
      culturalContext: data.culturalContext,
      audienceSegment: data.audienceSegment,
      durationStart: data.durationStart,
      durationEnd: data.durationEnd,
      budgetMin: data.budgetMin,
      budgetMax: data.budgetMax,
      keyMessage: data.keyMessage,
      status: data.status ?? "draft",
      generationStage: data.generationStage,
    },
  });
}
```

The `update` method is already a thin passthrough to `prisma.campaign.update` — the new optional fields just need to be in the type.

- [ ] **Step 3: Run typecheck**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep -E "campaign\.repository|campaign\.service" | head -10
```

Expected: no new errors. If a new error appears at `campaign.service.ts`, defer it — Task 8 will update the service.

- [ ] **Step 4: Commit**

```bash
git add backend/src/interfaces/repositories/campaign.repository.interface.ts backend/src/repositories/campaign.repository.ts
git commit -m "feat(repo): extend CampaignRepository for PDF generator fields"
```

---

### Task 3: Extend CreateBriefInput + MockCampaignRepository

**Files:**
- Modify: `backend/src/types/campaign.types.ts`
- Modify: `backend/src/interfaces/repositories/campaign.repository.interface.ts`
- Modify: `backend/src/repositories/campaign.repository.ts`
- Modify: `backend/tests/helpers/mock-campaign.repository.ts`

- [ ] **Step 1: Update CreateBriefInput**

In `backend/src/types/campaign.types.ts`, extend `CreateBriefInput`:

```typescript
export interface CreateBriefInput {
  objectiveDetail?: string;
  channelMix?: string[];
  mandatoryDeliverables?: string[];
  culturalContext?: string;
  trendContext?: string;
  competitiveContext?: string;
  kpiPreference?: Record<string, any>;
  toneDirection?: string;
  documentSummary?: string;
  documentUrl?: string;
  documentName?: string;
}
```

- [ ] **Step 2: Update repository createBrief**

Open `backend/src/repositories/campaign.repository.ts`, find `createBrief`, and pass the new fields through:

```typescript
async createBrief(campaignId: string, data: CreateBriefInput): Promise<CampaignBrief> {
  return this.prisma.campaignBrief.create({
    data: {
      campaignId,
      objectiveDetail: data.objectiveDetail,
      channelMix: data.channelMix,
      mandatoryDeliverables: data.mandatoryDeliverables,
      culturalContext: data.culturalContext,
      trendContext: data.trendContext,
      competitiveContext: data.competitiveContext,
      kpiPreference: data.kpiPreference,
      toneDirection: data.toneDirection,
      documentSummary: data.documentSummary,
      documentUrl: data.documentUrl,
      documentName: data.documentName,
    },
  });
}
```

Also update `updateBrief` to accept and apply the three new fields (same merge pattern as the existing fields).

- [ ] **Step 3: Update MockCampaignRepository**

Open `backend/tests/helpers/mock-campaign.repository.ts`. Find `createBrief` and add the three new fields to the constructed `CampaignBrief` object:

```typescript
const brief: CampaignBrief = {
  id: crypto.randomUUID(),
  campaignId,
  objectiveDetail: data.objectiveDetail ?? null,
  channelMix: data.channelMix ?? null,
  mandatoryDeliverables: data.mandatoryDeliverables ?? null,
  culturalContext: data.culturalContext ?? null,
  trendContext: data.trendContext ?? null,
  competitiveContext: data.competitiveContext ?? null,
  kpiPreference: data.kpiPreference ?? null,
  toneDirection: data.toneDirection ?? null,
  documentSummary: data.documentSummary ?? null,
  documentUrl: data.documentUrl ?? null,
  documentName: data.documentName ?? null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

Also extend the `create` method signature to accept `status` and `generationStage`, and extend the built `Campaign` object to include `generationStage: data.generationStage ?? null` and `errorMessage: null`.

And extend `updateBrief`'s merge to preserve the three new fields (same pattern as others).

- [ ] **Step 4: Run the existing campaign tests**

```bash
cd backend && bun test tests/services/campaign.service.test.ts
```

Expected: all existing tests still pass. No new tests yet.

- [ ] **Step 5: Commit**

```bash
git add backend/src/types/campaign.types.ts backend/src/repositories/campaign.repository.ts backend/tests/helpers/mock-campaign.repository.ts
git commit -m "feat(repo): extend CreateBriefInput and mocks with document fields"
```

---

## Phase 2 — Backend provider: brief summarizer

### Task 4: Define ICampaignBriefSummarizer interface

**Files:**
- Create: `backend/src/interfaces/providers/campaign-brief-summarizer.interface.ts`

- [ ] **Step 1: Write the interface**

Create `backend/src/interfaces/providers/campaign-brief-summarizer.interface.ts` with:

```typescript
export interface BriefSummaryInput {
  extractedText: string;
  brandContext: string;
  productContext?: string;
}

export interface BriefSummaryOutput {
  summary: string;
  objective: string;
  audienceHint: string;
  keyMessage: string;
  budgetHint: string;
  channelHint: string[];
  durationHint: {
    start: string | null;
    end: string | null;
  };
}

export interface ICampaignBriefSummarizer {
  summarizeBrief(input: BriefSummaryInput): Promise<BriefSummaryOutput>;
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "campaign-brief-summarizer"
```

Expected: no errors (no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add backend/src/interfaces/providers/campaign-brief-summarizer.interface.ts
git commit -m "feat(provider): add ICampaignBriefSummarizer interface"
```

---

### Task 5: Brief summary prompt template

**Files:**
- Modify: `backend/src/utils/prompt-builder.ts`

- [ ] **Step 1: Add the prompt builder**

Open `backend/src/utils/prompt-builder.ts`. Add this import at the top alongside the existing type imports:

```typescript
import type { BriefSummaryInput } from "../interfaces/providers/campaign-brief-summarizer.interface";
```

Then add this function at the bottom of the file (after `buildTopicGenerationPrompt`):

```typescript
export function buildBriefSummaryPrompt(input: BriefSummaryInput): PromptPair {
  const truncated = input.extractedText.length > 60000
    ? `${input.extractedText.slice(0, 60000)}\n\n[…document truncated to fit context window…]`
    : input.extractedText;

  const systemPrompt = `You are an expert marketing strategist analyzing a client brief. You have the following brand context:
${input.brandContext}
${input.productContext ? `\nProduct context:\n${input.productContext}` : ""}

${JSON_ONLY_INSTRUCTION}`;

  const userPrompt = `Read the client brief document below and extract a structured summary.

Return JSON with these exact fields:
- summary (string): 3-5 sentence description of what this brief is asking for — the campaign purpose, goals, and any critical constraints.
- objective (string): The primary marketing objective (e.g. "awareness", "engagement", "conversion", "retention", "education"). Infer from the brief if not stated.
- audienceHint (string): One-sentence description of the target audience — demographics, role, pain points.
- keyMessage (string): The single most important message the campaign should communicate.
- budgetHint (string): Budget range if mentioned in the brief, else empty string "".
- channelHint (array of strings): Array of channel codes mentioned or clearly implied. Use only these codes: "instagram", "tiktok", "youtube", "twitter", "linkedin", "facebook". Empty array if nothing is implied.
- durationHint (object with: start, end): Campaign start and end dates in ISO format (YYYY-MM-DD) if mentioned. Use null for fields not found.

Do NOT invent facts that are not grounded in the brief or the brand context. If something is not stated, use an empty string, empty array, or null as appropriate.

=== CLIENT BRIEF DOCUMENT ===
${truncated}`;

  return { systemPrompt, userPrompt };
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "prompt-builder"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/utils/prompt-builder.ts
git commit -m "feat(prompts): add buildBriefSummaryPrompt"
```

---

### Task 6: Gemini provider — summarizeBrief

**Files:**
- Modify: `backend/src/providers/gemini.provider.ts`

- [ ] **Step 1: Add the imports**

In `backend/src/providers/gemini.provider.ts`, add near the other interface imports at the top:

```typescript
import type {
  BriefSummaryInput,
  BriefSummaryOutput,
  ICampaignBriefSummarizer,
} from "../interfaces/providers/campaign-brief-summarizer.interface";
```

And in the `buildContentGenerationPrompt` import block, add `buildBriefSummaryPrompt`:

```typescript
import {
  buildBriefSummaryPrompt,
  buildCampaignGenerationPrompt,
  buildContentGenerationPrompt,
  buildTopicGenerationPrompt,
} from "../utils/prompt-builder";
```

- [ ] **Step 2: Add the interface to the class declaration**

Find the class declaration (e.g. `export class GeminiProvider implements IContentGenerator, ICampaignGenerator, ITopicGenerator, IBrandScraper, IInspirationSummarizer`) and add `ICampaignBriefSummarizer` to the implements list.

- [ ] **Step 3: Add the `summarizeBrief` method**

Place this method right after the existing `async scrape(...)` method (near line 390):

```typescript
async summarizeBrief(input: BriefSummaryInput): Promise<BriefSummaryOutput> {
  const { systemPrompt, userPrompt } = buildBriefSummaryPrompt(input);

  const response = await this.ai.models.generateContent({
    model: this.model,
    config: { temperature: 0, systemInstruction: systemPrompt },
    contents: userPrompt,
  });
  this.lastUsage = {
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
  this.lastPrompts = { systemPrompt, userPrompt };
  this.lastResponseText = response.text ?? "";

  const text = response.text ?? "";
  try {
    const parsed = parseJsonResponse(text) as BriefSummaryOutput;
    return {
      summary: parsed.summary ?? "",
      objective: parsed.objective ?? "",
      audienceHint: parsed.audienceHint ?? "",
      keyMessage: parsed.keyMessage ?? "",
      budgetHint: parsed.budgetHint ?? "",
      channelHint: Array.isArray(parsed.channelHint) ? parsed.channelHint : [],
      durationHint: {
        start: parsed.durationHint?.start ?? null,
        end: parsed.durationHint?.end ?? null,
      },
    };
  } catch (_err) {
    throw new Error(
      `GeminiProvider: Failed to parse brief summary response as JSON. Raw: ${text}`,
    );
  }
}
```

- [ ] **Step 4: Run typecheck**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "gemini.provider" | head -5
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/gemini.provider.ts
git commit -m "feat(provider): add Gemini summarizeBrief implementation"
```

---

### Task 7: Anthropic provider — summarizeBrief

**Files:**
- Modify: `backend/src/providers/anthropic.provider.ts`

- [ ] **Step 1: Add imports + implements clause**

Mirror Task 6 Steps 1 and 2 in `backend/src/providers/anthropic.provider.ts`: add the `ICampaignBriefSummarizer` import, the `buildBriefSummaryPrompt` import from `prompt-builder`, and add `ICampaignBriefSummarizer` to the `implements` list.

- [ ] **Step 2: Add the method**

Place this after the existing `async scrape(...)` method:

```typescript
async summarizeBrief(input: BriefSummaryInput): Promise<BriefSummaryOutput> {
  const { systemPrompt, userPrompt } = buildBriefSummaryPrompt(input);

  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: 2048,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  this.lastUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  try {
    const parsed = parseJsonResponse(text) as BriefSummaryOutput;
    return {
      summary: parsed.summary ?? "",
      objective: parsed.objective ?? "",
      audienceHint: parsed.audienceHint ?? "",
      keyMessage: parsed.keyMessage ?? "",
      budgetHint: parsed.budgetHint ?? "",
      channelHint: Array.isArray(parsed.channelHint) ? parsed.channelHint : [],
      durationHint: {
        start: parsed.durationHint?.start ?? null,
        end: parsed.durationHint?.end ?? null,
      },
    };
  } catch (_err) {
    throw new Error(
      `AnthropicProvider: Failed to parse brief summary response as JSON. Raw: ${text}`,
    );
  }
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "anthropic.provider" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/providers/anthropic.provider.ts
git commit -m "feat(provider): add Anthropic summarizeBrief implementation"
```

---

## Phase 3 — Backend service & route

### Task 8: Extend CampaignService with createFromBrief

**Files:**
- Modify: `backend/src/types/campaign.types.ts`
- Modify: `backend/src/interfaces/services/campaign.service.interface.ts`
- Modify: `backend/src/services/campaign.service.ts`
- Modify: `backend/tests/services/campaign.service.test.ts`

- [ ] **Step 1: Add CreateFromBriefInput type**

In `backend/src/types/campaign.types.ts`, append:

```typescript
export interface CreateFromBriefInput {
  brandId: string;
  productId?: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
}
```

- [ ] **Step 2: Extend the service interface**

Open `backend/src/interfaces/services/campaign.service.interface.ts` and add the method signature:

```typescript
createFromBrief(
  workspaceId: string,
  userId: string,
  input: CreateFromBriefInput,
): Promise<Campaign>;
```

Don't forget to import `CreateFromBriefInput` from `../../types/campaign.types`.

- [ ] **Step 3: Write the failing test**

Open `backend/tests/services/campaign.service.test.ts`. Add a new `describe` block at the end of the file (inside the outer `describe("CampaignService", …)`):

```typescript
describe("createFromBrief", () => {
  it("should create a campaign with name from filename and enqueue a campaign-pdf-generation job", async () => {
    const workspaceId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const brandId = crypto.randomUUID();
    const productId = crypto.randomUUID();

    const campaign = await campaignService.createFromBrief(workspaceId, userId, {
      brandId,
      productId,
      fileName: "Q2 2026 Campaign Brief.pdf",
      fileUrl: "http://minio.local/bucket/key.pdf",
      fileSize: 1234,
      fileType: "application/pdf",
    });

    expect(campaign.workspaceId).toBe(workspaceId);
    expect(campaign.brandId).toBe(brandId);
    expect(campaign.productId).toBe(productId);
    expect(campaign.name).toBe("Q2 2026 Campaign Brief");
    expect(campaign.status).toBe("generating");

    // A CampaignBrief row should be created with document fields
    const brief = await campaignService.getBrief(campaign.id);
    expect(brief).not.toBeNull();
    expect(brief!.documentName).toBe("Q2 2026 Campaign Brief.pdf");
    expect(brief!.documentUrl).toBe("http://minio.local/bucket/key.pdf");

    // The job should be enqueued
    expect(mockBoss.sentJobs).toHaveLength(1);
    const job = mockBoss.sentJobs[0];
    expect(job.name).toBe("campaign-pdf-generation");
    expect((job.data as any).campaignId).toBe(campaign.id);
    expect((job.data as any).userId).toBe(userId);
  });

  it("should strip non-pdf extensions and handle files with no extension", async () => {
    const workspaceId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const brandId = crypto.randomUUID();

    const campaign = await campaignService.createFromBrief(workspaceId, userId, {
      brandId,
      fileName: "campaign-brief-no-extension",
      fileUrl: "http://minio.local/bucket/key",
      fileSize: 500,
      fileType: "application/pdf",
    });

    expect(campaign.name).toBe("campaign-brief-no-extension");
  });
});
```

- [ ] **Step 4: Run the failing test**

```bash
cd backend && bun test tests/services/campaign.service.test.ts -t "createFromBrief"
```

Expected: FAIL — `campaignService.createFromBrief is not a function`.

- [ ] **Step 5: Implement createFromBrief**

Open `backend/src/services/campaign.service.ts`. Import the new type:

```typescript
import type {
  CreateBriefInput,
  CreateCampaignInput,
  CreateFromBriefInput,
  UpdateCampaignInput,
} from "../types/campaign.types";
```

Add the method after `generateFromBrief`:

```typescript
async createFromBrief(
  workspaceId: string,
  userId: string,
  input: CreateFromBriefInput,
): Promise<Campaign> {
  const name = input.fileName.replace(/\.pdf$/i, "");

  const campaign = await this.campaignRepository.create({
    workspaceId,
    brandId: input.brandId,
    productId: input.productId,
    name,
    status: "generating",
    generationStage: "extracting",
  });

  await this.campaignRepository.createBrief(campaign.id, {
    documentName: input.fileName,
    documentUrl: input.fileUrl,
  });

  await this.boss.send("campaign-pdf-generation", {
    campaignId: campaign.id,
    userId,
  });

  return campaign;
}
```

- [ ] **Step 6: Run the test again**

```bash
cd backend && bun test tests/services/campaign.service.test.ts -t "createFromBrief"
```

Expected: PASS (2 tests).

- [ ] **Step 7: Run the full service test file**

```bash
cd backend && bun test tests/services/campaign.service.test.ts
```

Expected: all tests pass — the new ones plus the pre-existing ones.

- [ ] **Step 8: Commit**

```bash
git add backend/src/types/campaign.types.ts backend/src/interfaces/services/campaign.service.interface.ts backend/src/services/campaign.service.ts backend/tests/services/campaign.service.test.ts
git commit -m "feat(service): add CampaignService.createFromBrief"
```

---

### Task 9: POST /campaigns/upload-brief route

**Files:**
- Modify: `backend/src/routes/campaign.route.ts`

- [ ] **Step 1: Add the multipart route**

Open `backend/src/routes/campaign.route.ts`. Add this route just before `// POST /:id/brief` (after the `POST /` handler, around line 65):

```typescript
// POST /upload-brief — accept PDF, create campaign, enqueue PDF generation
app.post("/upload-brief", async (c) => {
  const workspaceId = c.get("workspaceId");
  const userId = c.get("userId");
  const formData = await c.req.parseBody();

  const file = formData.file as File | undefined;
  const brandId = formData.brandId as string | undefined;
  const productId = (formData.productId as string) || undefined;

  if (!file || !brandId) {
    return c.json({ error: "file and brandId are required" }, 400);
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return c.json({ error: "only PDF files are supported" }, 400);
  }
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return c.json({ error: "file must be 10 MB or smaller" }, 400);
  }

  // Inject storage + bucket at the factory level — see Task 15 for DI wiring.
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `${workspaceId}/campaigns/${Date.now()}-${file.name}`;
  const fileUrl = await storageProvider.upload(bucket, key, buffer, file.type);

  const campaign = await campaignService.createFromBrief(workspaceId, userId, {
    brandId,
    productId,
    fileName: file.name,
    fileUrl,
    fileSize: file.size,
    fileType: file.type,
  });

  return c.json({ data: { campaignId: campaign.id } }, 201);
});
```

- [ ] **Step 2: Accept storage + bucket in the factory**

At the top of the same file, change the factory signature to accept the storage provider and bucket:

```typescript
import { Hono } from "hono";
import type { ICampaignService } from "../interfaces/services/campaign.service.interface";
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";

type Variables = {
  userId: string;
  userEmail: string;
  workspaceId: string;
  workspaceRole: string;
};

export function createCampaignRoutes(
  campaignService: ICampaignService,
  storageProvider: IStorageProvider,
  bucket: string,
) {
  const app = new Hono<{ Variables: Variables }>();
  // ... existing routes unchanged ...
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep -E "campaign\.route|index\.ts" | head -10
```

Expected: a type error at `backend/src/index.ts` complaining about the changed `createCampaignRoutes` signature. That will be fixed in Task 15 — note the error but continue.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/campaign.route.ts
git commit -m "feat(route): add POST /campaigns/upload-brief"
```

---

## Phase 4 — Backend pg-boss job

### Task 10: CampaignPdfGenerationJob — skeleton + Stage 1 (extract)

**Files:**
- Create: `backend/src/jobs/campaign-pdf-generation.job.ts`

- [ ] **Step 1: Write the job skeleton with Stage 1 (extract)**

Create `backend/src/jobs/campaign-pdf-generation.job.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
import type { ICampaignBriefSummarizer } from "../interfaces/providers/campaign-brief-summarizer.interface";
import type { ICampaignGenerator } from "../interfaces/providers/campaign-generator.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { ITopicGenerator } from "../interfaces/providers/topic-generator.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { logAiActivity } from "../utils/ai-activity-logger";
import {
  buildBriefSummaryPrompt,
  buildCampaignGenerationPrompt,
  buildTopicGenerationPrompt,
} from "../utils/prompt-builder";

interface CampaignPdfJobData {
  campaignId: string;
  userId: string;
}

type Stage = "extracting" | "summarizing" | "planning" | "topics";

export class CampaignPdfGenerationJob {
  constructor(
    private prisma: PrismaClient,
    private briefSummarizer: ICampaignBriefSummarizer,
    private campaignGenerator: ICampaignGenerator,
    private topicGenerator: ITopicGenerator,
    private notificationService: INotificationService,
    private logger: ILogger,
  ) {}

  async handle(data: CampaignPdfJobData): Promise<void> {
    const { campaignId, userId } = data;
    let currentStage: Stage = "extracting";

    try {
      // ── Load campaign + brand + product + brief ───────────────────
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          briefs: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (!campaign) throw new Error("Campaign not found");
      const brief = campaign.briefs[0];
      if (!brief || !brief.documentUrl) {
        throw new Error("Campaign brief has no document URL");
      }

      const brandContext = await this.loadBrandContext(campaign.brandId);
      const productContext = await this.loadProductContext(campaign.productId);

      // ── Stage 1: Extract PDF text ─────────────────────────────────
      await this.setStage(campaignId, userId, "extracting");
      const extractedText = await this.extractPdfText(brief.documentUrl);

      // ── Stage 2: Summarize brief (placeholder — Task 11) ─────────
      currentStage = "summarizing";
      // ── Stage 3: Plan (placeholder — Task 12) ────────────────────
      // ── Stage 4: Topics (placeholder — Task 13) ──────────────────

      // ── Completion ────────────────────────────────────────────────
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "completed", generationStage: null },
      });
      this.notificationService.notify(userId, {
        type: "campaign_pdf_complete",
        data: { campaignId, status: "completed" },
      });
      this.logger.info("Campaign PDF generation completed", { campaignId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error("Campaign PDF generation failed", {
        campaignId,
        stage: currentStage,
        error: message,
      });
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: "failed",
          generationStage: currentStage,
          errorMessage: message,
        },
      });
      this.notificationService.notify(userId, {
        type: "campaign_pdf_failed",
        data: { campaignId, status: "failed", error: message, stage: currentStage },
      });
    }
  }

  private async setStage(campaignId: string, userId: string, stage: Stage): Promise<void> {
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { generationStage: stage },
    });
    this.notificationService.notify(userId, {
      type: "campaign_pdf_progress",
      data: { campaignId, stage },
    });
  }

  private async loadBrandContext(brandId: string | null): Promise<string> {
    if (!brandId) return "{}";
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
      include: { brainVersions: { where: { isActive: true }, take: 1 } },
    });
    return brand?.brainVersions[0]
      ? JSON.stringify(brand.brainVersions[0])
      : JSON.stringify({ name: brand?.name });
  }

  private async loadProductContext(productId: string | null): Promise<string | undefined> {
    if (!productId) return undefined;
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { brainVersions: { where: { isActive: true }, take: 1 } },
    });
    if (!product) return undefined;
    return product.brainVersions[0]
      ? JSON.stringify(product.brainVersions[0])
      : JSON.stringify({ name: product.name });
  }

  private async extractPdfText(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not fetch PDF from ${url}: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    await parser.load();
    const result = await parser.getText();
    return result.text;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "campaign-pdf-generation"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/jobs/campaign-pdf-generation.job.ts
git commit -m "feat(job): scaffold CampaignPdfGenerationJob with Stage 1 extract"
```

---

### Task 11: Stage 2 — Summarize brief

**Files:**
- Modify: `backend/src/jobs/campaign-pdf-generation.job.ts`

- [ ] **Step 1: Replace the Stage 2 placeholder with the real implementation**

In `handle()`, replace `// ── Stage 2: Summarize brief (placeholder — Task 11) ─────────` with:

```typescript
// ── Stage 2: Summarize brief ─────────────────────────────────
currentStage = "summarizing";
await this.setStage(campaignId, userId, "summarizing");

const summarizeStart = Date.now();
const { systemPrompt: sumSys, userPrompt: sumUser } = buildBriefSummaryPrompt({
  extractedText,
  brandContext,
  productContext,
});
let summary: Awaited<ReturnType<ICampaignBriefSummarizer["summarizeBrief"]>>;
try {
  summary = await this.briefSummarizer.summarizeBrief({
    extractedText,
    brandContext,
    productContext,
  });
  const usage = (this.briefSummarizer as any).lastUsage;
  await logAiActivity(
    this.prisma,
    {
      workspaceId: campaign.workspaceId,
      generator: "campaign_brief_summary",
      provider:
        process.env.AI_CAMPAIGN_PROVIDER || process.env.AI_PROVIDER || "unknown",
      userId,
      systemPrompt: sumSys,
      userPrompt: sumUser,
      brandId: campaign.brandId ?? undefined,
    },
    {
      responseJson: summary,
      durationMs: Date.now() - summarizeStart,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      status: "success",
    },
  );
} catch (err) {
  const usage = (this.briefSummarizer as any).lastUsage;
  await logAiActivity(
    this.prisma,
    {
      workspaceId: campaign.workspaceId,
      generator: "campaign_brief_summary",
      provider:
        process.env.AI_CAMPAIGN_PROVIDER || process.env.AI_PROVIDER || "unknown",
      userId,
      systemPrompt: sumSys,
      userPrompt: sumUser,
      brandId: campaign.brandId ?? undefined,
    },
    {
      durationMs: Date.now() - summarizeStart,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    },
  );
  throw err;
}

// Persist summary to CampaignBrief and Campaign fields
await this.prisma.campaignBrief.update({
  where: { id: brief.id },
  data: { documentSummary: summary.summary },
});
await this.prisma.campaign.update({
  where: { id: campaignId },
  data: {
    objective: campaign.objective || summary.objective || undefined,
    audienceSegment: campaign.audienceSegment || summary.audienceHint || undefined,
    keyMessage: campaign.keyMessage || summary.keyMessage || undefined,
    channelMix: campaign.channelMix || (summary.channelHint.length > 0 ? (summary.channelHint as any) : undefined),
    durationStart: campaign.durationStart || (summary.durationHint.start ? new Date(summary.durationHint.start) : undefined),
    durationEnd: campaign.durationEnd || (summary.durationHint.end ? new Date(summary.durationHint.end) : undefined),
  },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "campaign-pdf-generation"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/jobs/campaign-pdf-generation.job.ts
git commit -m "feat(job): Stage 2 — summarize brief and persist hints"
```

---

### Task 12: Stage 3 — Generate campaign plan

**Files:**
- Modify: `backend/src/jobs/campaign-pdf-generation.job.ts`

- [ ] **Step 1: Replace the Stage 3 placeholder**

Replace `// ── Stage 3: Plan (placeholder — Task 12) ────────────────────` with:

```typescript
// ── Stage 3: Build campaign plan ─────────────────────────────
currentStage = "planning";
await this.setStage(campaignId, userId, "planning");

// Re-read the campaign so we get the freshly-applied Stage 2 hints.
const refreshedCampaign = await this.prisma.campaign.findUnique({
  where: { id: campaignId },
});
if (!refreshedCampaign) throw new Error("Campaign disappeared mid-pipeline");

const planInput = {
  brandContext: productContext
    ? `${brandContext}\n\nProduct Context: ${productContext}`
    : brandContext,
  objective: refreshedCampaign.objective ?? undefined,
  budget: refreshedCampaign.budget ?? undefined,
  channelMix: refreshedCampaign.channelMix
    ? (refreshedCampaign.channelMix as string[])
    : undefined,
  culturalContext: refreshedCampaign.culturalContext ?? undefined,
};
const { systemPrompt: planSys, userPrompt: planUser } =
  buildCampaignGenerationPrompt(planInput);

const planStart = Date.now();
let planOutput: Awaited<ReturnType<ICampaignGenerator["generate"]>>;
try {
  planOutput = await this.campaignGenerator.generate(planInput);
  const usage = (this.campaignGenerator as any).lastUsage;
  await logAiActivity(
    this.prisma,
    {
      workspaceId: campaign.workspaceId,
      generator: "campaign_plan",
      provider:
        process.env.AI_CAMPAIGN_PROVIDER || process.env.AI_PROVIDER || "unknown",
      userId,
      systemPrompt: planSys,
      userPrompt: planUser,
      brandId: campaign.brandId ?? undefined,
    },
    {
      responseJson: planOutput,
      durationMs: Date.now() - planStart,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      status: "success",
    },
  );
} catch (err) {
  const usage = (this.campaignGenerator as any).lastUsage;
  await logAiActivity(
    this.prisma,
    {
      workspaceId: campaign.workspaceId,
      generator: "campaign_plan",
      provider:
        process.env.AI_CAMPAIGN_PROVIDER || process.env.AI_PROVIDER || "unknown",
      userId,
      systemPrompt: planSys,
      userPrompt: planUser,
      brandId: campaign.brandId ?? undefined,
    },
    {
      durationMs: Date.now() - planStart,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    },
  );
  throw err;
}

await this.prisma.campaignOutput.create({
  data: {
    campaignId,
    bigIdea: planOutput.bigIdea,
    messagingPillars: planOutput.messagingPillars as any,
    funnelJourney: planOutput.funnelJourney as any,
    channelRoles: planOutput.channelRoles as any,
    status: "draft",
  },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "campaign-pdf-generation"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/jobs/campaign-pdf-generation.job.ts
git commit -m "feat(job): Stage 3 — generate campaign plan"
```

---

### Task 13: Stage 4 — Generate topics

**Files:**
- Modify: `backend/src/jobs/campaign-pdf-generation.job.ts`

- [ ] **Step 1: Replace the Stage 4 placeholder**

Replace `// ── Stage 4: Topics (placeholder — Task 13) ──────────────────` with:

```typescript
// ── Stage 4: Generate topics ─────────────────────────────────
currentStage = "topics";
await this.setStage(campaignId, userId, "topics");

const pillarsLine = Array.isArray(planOutput.messagingPillars)
  ? planOutput.messagingPillars
      .map((p: any) => p.name ?? p.description ?? "")
      .filter(Boolean)
      .join(", ")
  : "";

const topicPromptPrefix = [
  `Campaign big idea: ${planOutput.bigIdea ?? ""}`,
  pillarsLine ? `Messaging pillars: ${pillarsLine}` : "",
  summary.keyMessage ? `Key message: ${summary.keyMessage}` : "",
  summary.audienceHint ? `Audience: ${summary.audienceHint}` : "",
]
  .filter(Boolean)
  .join("\n");

const topicInput = {
  brandContext,
  productContexts: productContext ? [productContext] : undefined,
  prompt: topicPromptPrefix,
  count: 8,
};

const { systemPrompt: topSys, userPrompt: topUser } =
  buildTopicGenerationPrompt(topicInput);

const topicStart = Date.now();
let topicOutput: Awaited<ReturnType<ITopicGenerator["generate"]>>;
try {
  topicOutput = await this.topicGenerator.generate(topicInput);
  const usage = (this.topicGenerator as any).lastUsage;
  await logAiActivity(
    this.prisma,
    {
      workspaceId: campaign.workspaceId,
      generator: "campaign_topics",
      provider: process.env.AI_TOPIC_PROVIDER || process.env.AI_PROVIDER || "unknown",
      userId,
      systemPrompt: topSys,
      userPrompt: topUser,
      brandId: campaign.brandId ?? undefined,
    },
    {
      responseJson: topicOutput,
      durationMs: Date.now() - topicStart,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      status: "success",
    },
  );
} catch (err) {
  const usage = (this.topicGenerator as any).lastUsage;
  await logAiActivity(
    this.prisma,
    {
      workspaceId: campaign.workspaceId,
      generator: "campaign_topics",
      provider: process.env.AI_TOPIC_PROVIDER || process.env.AI_PROVIDER || "unknown",
      userId,
      systemPrompt: topSys,
      userPrompt: topUser,
      brandId: campaign.brandId ?? undefined,
    },
    {
      durationMs: Date.now() - topicStart,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    },
  );
  throw err;
}

// Persist topics — linked to this campaign
for (const t of topicOutput.topics ?? []) {
  const created = await this.prisma.contentTopic.create({
    data: {
      workspaceId: campaign.workspaceId,
      brandId: campaign.brandId,
      campaignId,
      title: t.title ?? "",
      description: t.description ?? "",
      pillar: t.pillar ?? null,
      platform: t.platform ?? null,
      format: t.format ?? null,
      objective: t.objective ?? null,
      publishDate: t.publishDate ? new Date(t.publishDate) : null,
      status: "draft",
    },
  });
  if (campaign.productId) {
    await this.prisma.contentTopicProduct.create({
      data: {
        contentTopicId: created.id,
        productId: campaign.productId,
      },
    });
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "campaign-pdf-generation"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/jobs/campaign-pdf-generation.job.ts
git commit -m "feat(job): Stage 4 — generate and persist campaign topics"
```

---

### Task 14: Wire the new job and route factory in index.ts

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Add imports**

At the top of `backend/src/index.ts`, add next to the other job imports:

```typescript
import { CampaignPdfGenerationJob } from "./jobs/campaign-pdf-generation.job";
```

- [ ] **Step 2: Add a resolver for the brief summarizer**

Near the other `resolveXxx()` functions (around line 85), add:

```typescript
function resolveBriefSummarizer() {
  const name = env.aiCampaignProvider || env.aiProvider;
  if (name === "anthropic") return new AnthropicProvider(env.anthropicApiKey, env.anthropicModel);
  if (name === "gemini") return new GeminiProvider(env.geminiApiKey, env.geminiModel);
  throw new Error(`Unknown AI provider: ${name}`);
}
```

- [ ] **Step 3: Instantiate the job in the setup block**

Inside `main()`, near the existing job instantiations (around line 196, next to `campaignGenerationJob`), add:

```typescript
const campaignPdfGenerationJob = new CampaignPdfGenerationJob(
  prisma,
  resolveBriefSummarizer(),
  resolveCampaignGenerator(),
  resolveTopicGenerator(),
  notificationService,
  logger,
);
```

- [ ] **Step 4: Create and register the pg-boss queue + worker**

Next to `await boss.createQueue("campaign-generation");`:

```typescript
await boss.createQueue("campaign-pdf-generation");
```

And next to the existing `boss.work("campaign-generation", …)` registration:

```typescript
await boss.work("campaign-pdf-generation", async (jobs) => {
  for (const job of jobs) await campaignPdfGenerationJob.handle(job.data as any);
});
```

- [ ] **Step 5: Update the campaign route factory call**

Find the `workspaceScoped.route("/campaigns", createCampaignRoutes(campaignService));` line (around line 367) and change it to pass the storage provider and bucket:

```typescript
workspaceScoped.route(
  "/campaigns",
  createCampaignRoutes(campaignService, storageProvider, env.minioBucket),
);
```

- [ ] **Step 6: Typecheck**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep -E "index\.ts|campaign-pdf" | head -10
```

Expected: no errors related to this feature. Pre-existing errors in other files are OK.

- [ ] **Step 7: Smoke-start the backend**

```bash
cd backend && timeout 10 bun run src/index.ts 2>&1 | head -30
```

Expected: server starts, logs "Starting server on port 3001", no crash. (`timeout` will kill it after 10s — that's fine.)

- [ ] **Step 8: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(di): wire campaign-pdf-generation worker + route storage deps"
```

---

## Phase 5 — Frontend upload + routing

### Task 15: UploadBriefModal component

**Files:**
- Create: `frontend/src/components/campaigns/UploadBriefModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from "react";
import { Upload, Sparkles, X, Loader2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { api } from "../../services/api";

interface Brand { id: string; name: string }
interface Product { id: string; name: string; brandId: string }

interface UploadBriefModalProps {
  workspaceId: string;
  onClose: () => void;
  onCreated: (campaignId: string) => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function UploadBriefModal({
  workspaceId,
  onClose,
  onCreated,
  onToast,
}: UploadBriefModalProps) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ data: Brand[] } | Brand[]>(`/api/workspaces/${workspaceId}/brands`)
      .then((res) => {
        const list = (res as any).data ?? res;
        setBrands(Array.isArray(list) ? list : []);
      })
      .catch(() => setBrands([]));
  }, [workspaceId]);

  useEffect(() => {
    if (!brandId) { setProducts([]); setProductId(""); return; }
    api<{ data: Product[] } | Product[]>(
      `/api/workspaces/${workspaceId}/products?brandId=${brandId}`,
    )
      .then((res) => {
        const list = (res as any).data ?? res;
        setProducts(Array.isArray(list) ? list : []);
      })
      .catch(() => setProducts([]));
    setProductId("");
  }, [brandId, workspaceId]);

  const canSubmit = !!brandId && !!file && !submitting;

  const handleFile = (f: File | null) => {
    setError("");
    if (!f) { setFile(null); return; }
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      setError("Only PDF files are supported");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File must be 10 MB or smaller");
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !file) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("brandId", brandId);
      if (productId) form.append("productId", productId);
      form.append("file", file);

      const res = await api<{ data: { campaignId: string } }>(
        `/api/workspaces/${workspaceId}/campaigns/upload-brief`,
        { method: "POST", body: form },
      );
      const campaignId = (res as any).data?.campaignId ?? (res as any).campaignId;
      onToast("Campaign generation started", "success");
      onCreated(campaignId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      onToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Upload Campaign Brief">
      <div className="p-6 space-y-5">
        <p className="text-sm text-gray-500">
          Upload a PDF brief and our AI will summarize it, build a campaign plan, and generate content topics.
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            Brand *
          </label>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
          >
            <option value="">— Select brand —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            Product (optional)
          </label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={!brandId || products.length === 0}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">— None —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            PDF File *
          </label>
          {file ? (
            <div className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-800 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-gray-400 hover:text-red-500"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg py-8 cursor-pointer hover:border-indigo-400">
              <Upload size={24} className="text-gray-400 mb-2" />
              <span className="text-sm text-gray-500">Click to select a PDF</span>
              <span className="text-xs text-gray-400 mt-1">Up to 10 MB</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Sparkles size={14} className="mr-1.5" />
                Generate from Brief
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "UploadBriefModal" | head -5
```

Expected: no errors. (If there are errors about `Modal` or `Button` props, adjust to match whatever props those components accept in this repo.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/campaigns/UploadBriefModal.tsx
git commit -m "feat(campaigns): add UploadBriefModal component"
```

---

### Task 16: Wire the two-button empty state + header in CampaignsPage

**Files:**
- Modify: `frontend/src/pages/CampaignsPage.tsx`

- [ ] **Step 1: Import the new modal and hooks**

Near the top imports:

```tsx
import { UploadBriefModal } from "../components/campaigns/UploadBriefModal";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
```

- [ ] **Step 2: Add state and navigation**

Inside the page component (near the existing `const [showCreate, setShowCreate] = useState(false)`):

```tsx
const [showUploadBrief, setShowUploadBrief] = useState(false);
const navigate = useNavigate();
```

- [ ] **Step 3: Update the page header buttons**

Replace the existing header `<div className="flex items-center justify-between">…</div>` block around line 752 with:

```tsx
<div className="flex items-center justify-between">
  <h1 className="text-lg font-semibold text-black">Campaigns</h1>
  <div className="flex gap-2">
    <Button variant="secondary" onClick={() => setShowCreate(true)}>
      Create Manually
    </Button>
    <Button onClick={() => setShowUploadBrief(true)}>
      <Sparkles size={14} className="mr-1.5" />
      Upload Brief (PDF)
    </Button>
  </div>
</div>
```

- [ ] **Step 4: Update the empty state**

Replace the empty-state div around line 759–762:

```tsx
<div className="bg-white border border-gray-200 rounded-lg p-12 text-center space-y-4">
  <p className="text-sm text-gray-400">No campaigns yet. Start a new campaign.</p>
  <div className="flex justify-center gap-2">
    <Button variant="secondary" onClick={() => setShowCreate(true)}>
      Create Manually
    </Button>
    <Button onClick={() => setShowUploadBrief(true)}>
      <Sparkles size={14} className="mr-1.5" />
      Upload Brief (PDF)
    </Button>
  </div>
</div>
```

- [ ] **Step 5: Mount the modal and row click**

Below the existing `{showCreate && …}` modal block, add:

```tsx
{showUploadBrief && (
  <UploadBriefModal
    workspaceId={activeWorkspace.id}
    onClose={() => setShowUploadBrief(false)}
    onCreated={(campaignId) => {
      setShowUploadBrief(false);
      navigate(`/campaigns/${campaignId}`);
    }}
    onToast={showToast}
  />
)}
```

Also update the row `onClick` to navigate to the detail page instead of opening the modal (replace `onClick={() => setSelectedCampaign(campaign)}` with `onClick={() => navigate(\`/campaigns/${campaign.id}\`)}`). Leave the existing `CampaignDetailModal` mounting in place for backwards compat — the new detail page will eventually replace it, but the modal is still referenced. Remove the modal mount if it stops being triggered.

- [ ] **Step 6: Typecheck**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "CampaignsPage" | head -5
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/CampaignsPage.tsx
git commit -m "feat(campaigns): add PDF upload empty-state + header buttons"
```

---

## Phase 6 — Frontend campaign detail page

### Task 17: Extend useSSE with new event types

**Files:**
- Modify: `frontend/src/hooks/useSSE.ts`

- [ ] **Step 1: Add the new event names**

In `frontend/src/hooks/useSSE.ts`, extend the `EVENT_TYPES` tuple:

```typescript
const EVENT_TYPES = [
  // ... existing event types unchanged ...
  // Campaign PDF generation
  "campaign_pdf_progress",
  "campaign_pdf_complete",
  "campaign_pdf_failed",
] as const;
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "useSSE"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSSE.ts
git commit -m "feat(sse): subscribe to campaign PDF generation events"
```

---

### Task 18: CampaignProgressPanel component

**Files:**
- Create: `frontend/src/components/campaigns/CampaignProgressPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Check, Loader2, AlertCircle } from "lucide-react";

type Stage = "extracting" | "summarizing" | "planning" | "topics";

interface CampaignProgressPanelProps {
  status: string;
  currentStage: Stage | null;
  errorMessage?: string | null;
  onRetry?: () => void;
}

const STAGES: { key: Stage; label: string }[] = [
  { key: "extracting", label: "Uploading & extracting PDF" },
  { key: "summarizing", label: "Writing summary" },
  { key: "planning", label: "Building campaign plan" },
  { key: "topics", label: "Generating topics" },
];

const STAGE_ORDER: Record<Stage, number> = {
  extracting: 0,
  summarizing: 1,
  planning: 2,
  topics: 3,
};

export function CampaignProgressPanel({
  status,
  currentStage,
  errorMessage,
  onRetry,
}: CampaignProgressPanelProps) {
  const failed = status === "failed";
  const currentIndex = currentStage ? STAGE_ORDER[currentStage] : -1;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">
          {failed ? "Generation failed" : "Generating your campaign"}
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {failed
            ? "One of the stages hit an error. You can delete this campaign and try again."
            : "This takes around a minute. You can browse away and come back."}
        </p>
      </div>

      <ul className="space-y-2">
        {STAGES.map((stage, i) => {
          const done = !failed && i < currentIndex;
          const active = !failed && i === currentIndex;
          const pending = !failed && i > currentIndex;
          const broke = failed && currentStage === stage.key;
          return (
            <li key={stage.key} className="flex items-center gap-3 text-sm">
              <span className="w-5 h-5 flex items-center justify-center">
                {done && <Check size={16} className="text-green-600" />}
                {active && <Loader2 size={16} className="text-indigo-600 animate-spin" />}
                {broke && <AlertCircle size={16} className="text-red-600" />}
                {pending && (
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                )}
              </span>
              <span
                className={
                  done
                    ? "text-gray-900"
                    : active
                      ? "text-indigo-700 font-medium"
                      : broke
                        ? "text-red-700 font-medium"
                        : "text-gray-400"
                }
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ul>

      {failed && errorMessage && (
        <div className="bg-red-50 border border-red-100 rounded-md px-3 py-2 text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {failed && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-indigo-600 hover:underline"
        >
          Delete and try again →
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "CampaignProgressPanel"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/campaigns/CampaignProgressPanel.tsx
git commit -m "feat(campaigns): add CampaignProgressPanel"
```

---

### Task 19: CampaignSummaryCard component

**Files:**
- Create: `frontend/src/components/campaigns/CampaignSummaryCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { FileText, ExternalLink } from "lucide-react";

interface CampaignSummaryCardProps {
  summary: string;
  documentName?: string | null;
  documentUrl?: string | null;
}

export function CampaignSummaryCard({
  summary,
  documentName,
  documentUrl,
}: CampaignSummaryCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">Document Summary</h2>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
        {summary || "No summary available."}
      </p>
      {documentUrl && (
        <a
          href={documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
        >
          <ExternalLink size={12} />
          {documentName || "View original PDF"}
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/campaigns/CampaignSummaryCard.tsx
git commit -m "feat(campaigns): add CampaignSummaryCard"
```

---

### Task 20: CampaignPlanCard component

**Files:**
- Create: `frontend/src/components/campaigns/CampaignPlanCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useEffect } from "react";
import { Target, Save, Loader2 } from "lucide-react";
import { api } from "../../services/api";

interface CampaignPlanCardProps {
  workspaceId: string;
  campaignId: string;
  initial: {
    objective: string;
    audienceSegment: string;
    keyMessage: string;
    bigIdea: string;
    messagingPillars: Array<{ name: string; description: string }>;
  };
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function CampaignPlanCard({
  workspaceId,
  campaignId,
  initial,
  onToast,
}: CampaignPlanCardProps) {
  const [objective, setObjective] = useState(initial.objective);
  const [audience, setAudience] = useState(initial.audienceSegment);
  const [keyMessage, setKeyMessage] = useState(initial.keyMessage);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setObjective(initial.objective);
    setAudience(initial.audienceSegment);
    setKeyMessage(initial.keyMessage);
  }, [initial.objective, initial.audienceSegment, initial.keyMessage]);

  const dirty =
    objective !== initial.objective ||
    audience !== initial.audienceSegment ||
    keyMessage !== initial.keyMessage;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({
          objective: objective.trim() || null,
          audienceSegment: audience.trim() || null,
          keyMessage: keyMessage.trim() || null,
        }),
      });
      onToast("Plan updated", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Campaign Plan</h2>
        </div>
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save changes
          </button>
        )}
      </div>

      <div>
        <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Big Idea</label>
        <p className="text-sm text-gray-800">{initial.bigIdea || "—"}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Objective</label>
          <input
            type="text"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Audience Segment</label>
          <input
            type="text"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Key Message</label>
        <textarea
          value={keyMessage}
          onChange={(e) => setKeyMessage(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-y"
        />
      </div>

      <div>
        <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Messaging Pillars</label>
        {initial.messagingPillars.length === 0 ? (
          <p className="text-xs text-gray-400">No pillars generated.</p>
        ) : (
          <ul className="space-y-1.5">
            {initial.messagingPillars.map((p, i) => (
              <li key={i} className="text-sm text-gray-700">
                <span className="font-medium">{p.name}:</span> {p.description}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/campaigns/CampaignPlanCard.tsx
git commit -m "feat(campaigns): add CampaignPlanCard"
```

---

### Task 21: CampaignTopicsList component

**Files:**
- Create: `frontend/src/components/campaigns/CampaignTopicsList.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useNavigate } from "react-router-dom";
import { Layers, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";

interface Topic {
  id: string;
  title: string;
  description: string | null;
  pillar: string | null;
  platform: string | null;
  format: string | null;
  objective: string | null;
  brandId: string | null;
  products?: Array<{ product: { id: string } }>;
}

interface CampaignTopicsListProps {
  topics: Topic[];
}

export function CampaignTopicsList({ topics }: CampaignTopicsListProps) {
  const navigate = useNavigate();

  const handleGenerate = (topic: Topic) => {
    const params = new URLSearchParams();
    params.set("topicId", topic.id);
    if (topic.brandId) params.set("brandId", topic.brandId);
    if (topic.platform) params.set("platform", topic.platform);
    if (topic.format) params.set("format", topic.format);
    if (topic.objective) params.set("objective", topic.objective);
    topic.products?.forEach((tp) => params.append("productId", tp.product.id));
    navigate(`/generate?${params.toString()}`);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Layers size={16} className="text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">
          Generated Topics ({topics.length})
        </h2>
      </div>
      {topics.length === 0 ? (
        <p className="text-sm text-gray-400">No topics generated.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {topics.map((topic) => (
            <li key={topic.id} className="py-3 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{topic.title}</p>
                {topic.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{topic.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {topic.pillar && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                      {topic.pillar}
                    </span>
                  )}
                  {topic.platform && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                      {topic.platform}
                    </span>
                  )}
                  {topic.format && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                      {topic.format}
                    </span>
                  )}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => handleGenerate(topic)}>
                <Sparkles size={12} className="mr-1" />
                Generate
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/campaigns/CampaignTopicsList.tsx
git commit -m "feat(campaigns): add CampaignTopicsList"
```

---

### Task 22: CampaignDetailPage

**Files:**
- Create: `frontend/src/pages/CampaignDetailPage.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2, Trash2 } from "lucide-react";
import { api } from "../services/api";
import { useSSE } from "../hooks/useSSE";
import { useWorkspace } from "../hooks/useWorkspace";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
import { CampaignProgressPanel } from "../components/campaigns/CampaignProgressPanel";
import { CampaignSummaryCard } from "../components/campaigns/CampaignSummaryCard";
import { CampaignPlanCard } from "../components/campaigns/CampaignPlanCard";
import { CampaignTopicsList } from "../components/campaigns/CampaignTopicsList";

type Stage = "extracting" | "summarizing" | "planning" | "topics";

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  generationStage: Stage | null;
  errorMessage: string | null;
  brandId: string | null;
  productId: string | null;
  objective: string | null;
  audienceSegment: string | null;
  keyMessage: string | null;
  outputs: Array<{
    id: string;
    bigIdea: string | null;
    messagingPillars: Array<{ name: string; description: string }> | null;
  }>;
  briefs: Array<{
    id: string;
    documentSummary: string | null;
    documentUrl: string | null;
    documentName: string | null;
  }>;
  topics?: Array<any>;
}

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  }, []);

  const loadCampaign = useCallback(async () => {
    if (!activeWorkspace || !id) return;
    const res = await api<{ data: CampaignDetail } | CampaignDetail>(
      `/api/workspaces/${activeWorkspace.id}/campaigns/${id}`,
    );
    const data: CampaignDetail = ((res as any).data ?? res) as CampaignDetail;
    setCampaign(data);

    // Also load linked topics
    const topicsRes = await api<{ data: any[] } | any[]>(
      `/api/workspaces/${activeWorkspace.id}/topics?campaignId=${id}`,
    ).catch(() => ({ data: [] as any[] }));
    setTopics(((topicsRes as any).data ?? topicsRes) as any[]);
    setLoading(false);
  }, [activeWorkspace, id]);

  useEffect(() => {
    loadCampaign();
  }, [loadCampaign]);

  useSSE((event) => {
    if (!id) return;
    if (
      (event.type === "campaign_pdf_progress" ||
        event.type === "campaign_pdf_complete" ||
        event.type === "campaign_pdf_failed") &&
      event.data.campaignId === id
    ) {
      loadCampaign();
    }
  });

  const handleDelete = async () => {
    if (!activeWorkspace || !id) return;
    if (!confirm("Delete this campaign and its generated topics?")) return;
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/campaigns/${id}`, {
        method: "DELETE",
      });
      navigate("/campaigns");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  };

  if (loading || !campaign) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 size={24} className="text-gray-400 animate-spin" />
      </div>
    );
  }

  const output = campaign.outputs[0];
  const brief = campaign.briefs[0];
  const isGenerating = campaign.status === "generating" || campaign.status === "failed";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate("/campaigns")}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft size={14} className="mr-0.5" />
          Back to campaigns
        </button>
        <Button variant="secondary" onClick={handleDelete}>
          <Trash2 size={14} className="mr-1.5" />
          Delete
        </Button>
      </div>

      <h1 className="text-lg font-semibold text-gray-900">{campaign.name}</h1>

      {isGenerating ? (
        <CampaignProgressPanel
          status={campaign.status}
          currentStage={campaign.generationStage}
          errorMessage={campaign.errorMessage}
          onRetry={handleDelete}
        />
      ) : (
        <>
          {brief && (
            <CampaignSummaryCard
              summary={brief.documentSummary ?? ""}
              documentName={brief.documentName}
              documentUrl={brief.documentUrl}
            />
          )}
          <CampaignPlanCard
            workspaceId={activeWorkspace!.id}
            campaignId={campaign.id}
            initial={{
              objective: campaign.objective ?? "",
              audienceSegment: campaign.audienceSegment ?? "",
              keyMessage: campaign.keyMessage ?? "",
              bigIdea: output?.bigIdea ?? "",
              messagingPillars: output?.messagingPillars ?? [],
            }}
            onToast={showToast}
          />
          <CampaignTopicsList topics={topics} />
        </>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "CampaignDetailPage" | head -5
```

Expected: no errors. If `Toast` / `Button` / `useWorkspace` imports don't match the exact repo paths, adjust — check `frontend/src/pages/CampaignsPage.tsx` for the canonical imports.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CampaignDetailPage.tsx
git commit -m "feat(campaigns): add CampaignDetailPage with SSE-driven progress"
```

---

### Task 23: Wire the new route + backend support

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `backend/src/routes/topic.route.ts` — add `campaignId` query filter
- Modify: `backend/src/routes/campaign.route.ts` — add `DELETE /:id`

- [ ] **Step 1: Add the route**

In `frontend/src/App.tsx`, near the existing `<Route path="/campaigns" element={<CampaignsPage />} />`:

```tsx
import { CampaignDetailPage } from "./pages/CampaignDetailPage";
// ...
<Route path="/campaigns/:id" element={<CampaignDetailPage />} />
```

- [ ] **Step 2: Add campaignId topic filter**

Topics are fetched via `GET /topics?campaignId=…`. Open `backend/src/routes/topic.route.ts` and ensure the GET handler reads the `campaignId` query param and passes it to the service. If the service's `list` method doesn't already support filtering by `campaignId`, add it:

```typescript
// In topic.route.ts GET handler
const campaignId = c.req.query("campaignId") || undefined;
const topics = await topicService.list(workspaceId, { campaignId });
```

Then in `backend/src/services/topic.service.ts`, update `list` to accept and pass through the optional filter. In `backend/src/repositories/topic.repository.ts`, update the query to include `campaignId` in the `where` clause when the filter is present.

*If the existing topic service/repo already filter by arbitrary fields*, just pass through `campaignId` — don't refactor unrelated code.

- [ ] **Step 3: Add DELETE /:id for campaigns**

Open `backend/src/routes/campaign.route.ts`. After the `PATCH /:id` route (around line 77), add:

```typescript
// DELETE /:id — delete a campaign (cascades to briefs, outputs, topics via onDelete: SetNull)
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await campaignService.delete(id);
  return c.json({ success: true });
});
```

In `backend/src/interfaces/services/campaign.service.interface.ts` add `delete(id: string): Promise<void>`. In `backend/src/services/campaign.service.ts` add:

```typescript
async delete(id: string): Promise<void> {
  await this.campaignRepository.delete(id);
}
```

And in `backend/src/interfaces/repositories/campaign.repository.interface.ts` and the repo implementation, add a `delete(id: string): Promise<void>` that calls `this.prisma.campaign.delete({ where: { id } })`. Update `MockCampaignRepository` to match with a matching in-memory implementation.

- [ ] **Step 4: Typecheck both sides**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep -E "campaign|topic" | grep "error TS" | head -5
cd ../frontend && npx tsc --noEmit 2>&1 | grep "error TS" | head -5
```

Expected: no new errors introduced.

- [ ] **Step 5: Run backend tests**

```bash
cd backend && bun test tests/services/campaign.service.test.ts
```

Expected: all tests still pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx backend/src/routes/topic.route.ts backend/src/services/topic.service.ts backend/src/repositories/topic.repository.ts backend/src/routes/campaign.route.ts backend/src/services/campaign.service.ts backend/src/interfaces/services/campaign.service.interface.ts backend/src/interfaces/repositories/campaign.repository.interface.ts backend/src/repositories/campaign.repository.ts backend/tests/helpers/mock-campaign.repository.ts
git commit -m "feat: wire CampaignDetailPage route, topic filter, campaign delete"
```

---

## Phase 7 — Integration smoke test

### Task 24: End-to-end smoke test in browser

**Files:** None (manual verification)

- [ ] **Step 1: Start PostgreSQL + MinIO**

```bash
docker-compose up -d
```

Expected: `fce-postgres` and `fce-minio` containers are up.

- [ ] **Step 2: Start the backend**

```bash
cd backend && bun run --hot src/index.ts
```

Expected: logs "Starting server on port 3001". Leave it running.

- [ ] **Step 3: Start the frontend**

In a second terminal:

```bash
cd frontend && npm run dev
```

Expected: Vite dev server on `http://localhost:5173`.

- [ ] **Step 4: Manual walkthrough**

In the browser:

1. Log in.
2. Navigate to **Campaign Generator** in the sidebar.
3. Confirm the empty state shows two buttons: "Create Manually" and "Upload Brief (PDF)".
4. Click **Upload Brief (PDF)**. Pick a brand, optionally pick a product, and upload a real PDF (any marketing brief you have lying around, or generate a 1-page test PDF).
5. Click **Generate from Brief**. The modal closes and the URL changes to `/campaigns/<id>`.
6. The CampaignProgressPanel shows. Watch the four stages tick over as SSE events arrive. Total time: ~60–90s on a typical PDF.
7. When the job completes the panel is replaced by three cards: the document summary (with a clickable link to the original PDF), the editable plan card (objective / audience / key message / big idea / pillars), and a list of 8 topics.
8. Click **Generate** on any topic. It should route to `/generate?topicId=…&brandId=…&…` and Content Generator opens with that topic selected.
9. Back on the campaign detail page, edit the objective field and click "Save changes". Reload the page — the edit should persist.
10. Click **Delete** → confirm. Campaign + topics should be removed; you land back on `/campaigns`.

- [ ] **Step 5: Verify AI activity logs**

Open Prisma Studio in a third terminal and check the `ai_provider_logs` table:

```bash
cd backend && bunx prisma studio
```

Expected: three new rows for the upload you just did, with `generator` values `campaign_brief_summary`, `campaign`, and `campaign_topics`. Each has `status='success'`, non-null `responseJson`, and realistic `inputTokens` / `outputTokens` / `durationMs`.

- [ ] **Step 6: Verify failure path**

Intentionally break it: upload a non-PDF file and confirm the backend rejects it with "only PDF files are supported". Upload a valid PDF but disconnect the AI provider (e.g. set `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` to garbage in `.env`, then restart the backend) — the job should fail at Stage 2, the progress panel should render the error, and the "Delete and try again" button should work.

- [ ] **Step 7: No commit for this task** (manual test only)

---

## Self-review checklist

*(Reviewer: run through this once after writing the plan. Fix inline.)*

**Spec coverage:**
- [x] Upload modal with Brand + Product + File fields — Task 15
- [x] POST /upload-brief route — Task 9
- [x] 4-stage pg-boss job — Tasks 10–13
- [x] Three AI calls (summarize, plan, topics) — Tasks 11, 12, 13
- [x] Schema additions (Campaign, CampaignBrief, ContentTopic) — Task 1
- [x] Provider summarizeBrief on Gemini + Anthropic — Tasks 6, 7
- [x] SSE progress events — Tasks 10, 17
- [x] Campaign Detail page with progress + results — Task 22
- [x] Topic "Generate Content" button routes correctly — Task 21 (reuses the pattern already wired in TopicDetailDrawer)
- [x] PDF stored in MinIO with workspace-namespaced key — Task 9
- [x] Two-button empty state (coexist with manual) — Task 16
- [x] AI activity logging for all 3 calls — Tasks 11, 12, 13
- [x] Error handling at each stage with SSE notification — Task 10 catch block

**Placeholder scan:** clean. Every task has concrete code, exact file paths, and specific commands.

**Type consistency:** `Stage` type is defined in Task 10 and reused in Task 18. `BriefSummaryOutput` defined in Task 4, consumed in Tasks 6, 7, 11. `CreateFromBriefInput` defined in Task 8 and consumed in Task 9. `CampaignBrief.documentSummary` created in Task 1 and written in Tasks 3, 11 and read in Task 22. Checked ✓.
