# Custom Prompt, Reference Images & AI Config — Design Spec

**Date:** 2026-04-11
**Approach:** Incremental Enhancement (Approach A)

## Overview

Four changes across both Topic Generator and Content Generator:

1. **Custom Prompt for Topic Generator** — add textarea for additional direction (Content Generator already has one). Note below prompt informing users they can paste URLs as references.
2. **Reference Image Upload** — shared drop zone component for uploading multiple reference images. Immediate upload to MinIO. Images passed to AI as multimodal content.
3. **System/User Prompt Separation** — Gemini provider currently combines system + user into one string. Separate them using Gemini's `systemInstruction` parameter.
4. **Temperature Config** — set `temperature: 0.0` on both Anthropic and Gemini providers.

---

## 1. Frontend — Custom Prompt on Topic Generator

**TopicsPage** — new "Additional Direction" card below the Schedule section, before the Generate button:

- **Textarea**: placeholder "Add any specific instructions, direction, or context..."
- **Note below textarea**: subtle text "Tip: You can paste URLs as references and they will be included in the AI context."
- **State**: `const [prompt, setPrompt] = useState("")`
- **API payload**: adds `prompt` field to the generate request

**GeneratePage** — existing custom prompt textarea gets the same URL note added below it.

---

## 2. Frontend — Reference Image Upload Component

**New shared component:** `frontend/src/components/ui/ReferenceImageUpload.tsx`

**Props:**
```typescript
{
  workspaceId: string;
  images: { url: string; uploading: boolean }[];
  onChange: (images: { url: string; uploading: boolean }[]) => void;
}
```

**Behavior:**
- Drop zone with dashed border, upload icon, text: "Drop images here or click to upload"
- Accepts: jpg, png, webp. Multiple files allowed.
- On drop/select: immediately uploads each file to MinIO via `POST /api/workspaces/:id/reference-images/upload`
- Shows thumbnails in a grid (small, ~64px) with:
  - Loading spinner overlay during upload
  - Remove (X) button on hover
- Parent component holds state: `referenceImages: { url: string; uploading: boolean }[]`
- Only non-uploading URLs are sent with the generate request

**Used in:** TopicsPage (inside "Additional Direction" card) and GeneratePage (below custom prompt).

---

## 3. Backend — Reference Image Upload Endpoint

**New route:** `POST /api/workspaces/:id/reference-images/upload`

- Accepts multipart form data with a single `file` field
- Validates: must be image (jpg, png, webp), max 5MB
- Uploads to MinIO bucket `reference-images` with key: `{workspaceId}/{uuid}.{ext}`
- Returns: `{ url: string }`

**File:** `backend/src/routes/upload.route.ts` (new)

Wired in composition root under `/api/workspaces/:workspaceId/reference-images`.

---

## 4. Backend — Type Changes

**`GenerateTopicsInput`** — add:
```typescript
prompt?: string;
referenceImages?: string[];
```

**`CreateGenerationInput`** — add:
```typescript
referenceImages?: string[];
```

**`TopicGenerationInput`** (provider interface) — add:
```typescript
referenceImages?: string[];
```

**`ContentGenerationInput`** (provider interface) — add:
```typescript
referenceImages?: string[];
```

---

## 5. Backend — Prompt Builder

**`buildTopicGenerationPrompt`** — add custom prompt support:
```
${input.prompt ? `\nAdditional instructions: ${input.prompt}` : ""}
```
Added to the user prompt, same pattern as content generation.

No changes to `buildContentGenerationPrompt` (already supports `prompt`).

---

## 6. Backend — Job Data Flow

**Topic generation job:**
- `TopicJobData` adds `prompt?: string` and `referenceImages?: string[]`
- Pass `prompt` to prompt builder input
- Pass `referenceImages` to topic generator provider

**Content generation job:**
- `ContentJobData` adds `referenceImages?: string[]`
- Pass `referenceImages` to content generator provider
- `prompt` already flows from `GenerationRequest.prompt`

---

## 7. Backend — AI Provider Changes

### Anthropic Provider

**All generate methods:**
- Add `temperature: 0.0` to `messages.create()` config
- When `referenceImages` provided, convert user message to multimodal content blocks:
  ```typescript
  messages: [{
    role: "user",
    content: [
      ...referenceImages.map(url => ({
        type: "image",
        source: { type: "url", url }
      })),
      { type: "text", text: userPrompt }
    ]
  }]
  ```
- System prompt stays in `system:` parameter (already correct)

### Gemini Provider

**All generate methods:**
- Add `temperature: 0.0` in generation config:
  ```typescript
  config: { temperature: 0.0 }
  ```
- Separate system instruction from user prompt:
  ```typescript
  {
    model: this.model,
    config: {
      temperature: 0.0,
      systemInstruction: systemPrompt,
    },
    contents: referenceImages?.length
      ? [
          ...referenceImages.map(url => ({ fileData: { fileUri: url, mimeType: "image/jpeg" } })),
          { text: userPrompt }
        ]
      : userPrompt,
  }
  ```

---

## 8. Backend — Route Changes

**Topic route** (`topic.route.ts`):
- `POST /generate` accepts `prompt` and `referenceImages` fields

**Generation route** (`generation.route.ts`):
- `POST /` accepts `referenceImages` field

---

## 9. Files to Modify

| Layer | File | Changes |
|-------|------|---------|
| Frontend | `frontend/src/components/ui/ReferenceImageUpload.tsx` | **New** — drop zone + thumbnails + immediate MinIO upload |
| Frontend | `frontend/src/pages/TopicsPage.tsx` | Add prompt textarea + note + ReferenceImageUpload |
| Frontend | `frontend/src/pages/GeneratePage.tsx` | Add URL note + ReferenceImageUpload below prompt |
| Backend | `backend/src/routes/upload.route.ts` | **New** — reference image upload endpoint |
| Backend | `backend/src/index.ts` | Wire upload route |
| Backend | `backend/src/types/topic.types.ts` | Add `prompt`, `referenceImages` |
| Backend | `backend/src/types/generation.types.ts` | Add `referenceImages` |
| Backend | `backend/src/interfaces/providers/topic-generator.interface.ts` | Add `referenceImages` |
| Backend | `backend/src/interfaces/providers/content-generator.interface.ts` | Add `referenceImages` |
| Backend | `backend/src/utils/prompt-builder.ts` | Add prompt support to topic builder |
| Backend | `backend/src/jobs/topic-generation.job.ts` | Pass prompt + referenceImages |
| Backend | `backend/src/jobs/content-generation.job.ts` | Pass referenceImages |
| Backend | `backend/src/services/generation.service.ts` | Pass referenceImages to job |
| Backend | `backend/src/routes/topic.route.ts` | Accept prompt + referenceImages |
| Backend | `backend/src/routes/generation.route.ts` | Accept referenceImages |
| Backend | `backend/src/providers/anthropic.provider.ts` | Temperature 0.0, multimodal images |
| Backend | `backend/src/providers/gemini.provider.ts` | Temperature 0.0, systemInstruction, multimodal images |
