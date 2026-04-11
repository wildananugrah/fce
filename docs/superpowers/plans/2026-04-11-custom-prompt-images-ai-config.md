# Custom Prompt, Reference Images & AI Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add custom prompt + reference image upload to both generators, properly separate system/user prompts in Gemini provider, and set temperature to 0.0 on both AI providers.

**Architecture:** Shared `ReferenceImageUpload` component used in both TopicsPage and GeneratePage. Images upload immediately to MinIO via a new upload route. Provider interfaces gain `referenceImages` field. Both providers updated for multimodal input, proper prompt separation, and temperature config.

**Tech Stack:** TypeScript, Hono, MinIO (S3), React 19, Tailwind CSS 4, Anthropic SDK, Google GenAI SDK

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `backend/src/types/topic.types.ts` | Add `prompt`, `referenceImages` to `GenerateTopicsInput` |
| Modify | `backend/src/types/generation.types.ts` | Add `referenceImages` to `CreateGenerationInput` |
| Modify | `backend/src/interfaces/providers/topic-generator.interface.ts` | Add `referenceImages` to `TopicGenerationInput` |
| Modify | `backend/src/interfaces/providers/content-generator.interface.ts` | Add `referenceImages` to `ContentGenerationInput` |
| Modify | `backend/src/utils/prompt-builder.ts` | Add prompt support to topic builder |
| Modify | `backend/src/jobs/topic-generation.job.ts` | Pass prompt + referenceImages through |
| Modify | `backend/src/jobs/content-generation.job.ts` | Pass referenceImages through |
| Modify | `backend/src/services/generation.service.ts` | Pass referenceImages to job data |
| Modify | `backend/src/routes/topic.route.ts` | Accept prompt + referenceImages |
| Modify | `backend/src/routes/generation.route.ts` | Accept referenceImages |
| Create | `backend/src/routes/upload.route.ts` | Reference image upload endpoint |
| Modify | `backend/src/index.ts` | Wire upload route |
| Modify | `backend/src/providers/anthropic.provider.ts` | Temperature 0.0, multimodal images |
| Modify | `backend/src/providers/gemini.provider.ts` | Temperature 0.0, systemInstruction, multimodal images |
| Create | `frontend/src/components/ui/ReferenceImageUpload.tsx` | Drop zone + thumbnails + immediate upload |
| Modify | `frontend/src/pages/TopicsPage.tsx` | Add prompt + image upload section |
| Modify | `frontend/src/pages/GeneratePage.tsx` | Add URL note + image upload |

---

### Task 1: Backend Types — Add prompt and referenceImages

**Files:**
- Modify: `backend/src/types/topic.types.ts`
- Modify: `backend/src/types/generation.types.ts`
- Modify: `backend/src/interfaces/providers/topic-generator.interface.ts`
- Modify: `backend/src/interfaces/providers/content-generator.interface.ts`

- [ ] **Step 1: Update GenerateTopicsInput**

In `backend/src/types/topic.types.ts`, add to `GenerateTopicsInput`:

```typescript
export interface GenerateTopicsInput {
	brandId?: string;
	productIds?: string[];
	platform?: string;
	objective?: string;
	formats?: string[];
	dateFrom?: string;
	dateTo?: string;
	count?: number;
	prompt?: string;
	referenceImages?: string[];
}
```

- [ ] **Step 2: Update CreateGenerationInput**

In `backend/src/types/generation.types.ts`, add `referenceImages`:

```typescript
export interface CreateGenerationInput {
	brandId: string;
	productId?: string;
	productIds?: string[];
	contentTopicId?: string;
	platform: string;
	contentType: string;
	framework: string;
	hookType: string;
	language?: string;
	prompt?: string;
	objective?: string;
	tonePreset?: string;
	visualStyle?: string;
	outputLength?: string;
	referenceImages?: string[];
}
```

- [ ] **Step 3: Update TopicGenerationInput**

In `backend/src/interfaces/providers/topic-generator.interface.ts`, add `referenceImages`:

```typescript
export interface TopicGenerationInput {
	brandContext: string;
	productContexts?: string[];
	skillContext?: string;
	platform?: string;
	objective?: string;
	formats?: string[];
	dateFrom?: string;
	dateTo?: string;
	count?: number;
	referenceImages?: string[];
}
```

- [ ] **Step 4: Update ContentGenerationInput**

In `backend/src/interfaces/providers/content-generator.interface.ts`, add `referenceImages`:

```typescript
export interface ContentGenerationInput {
	brandContext: string;
	productContext?: string;
	skillContext?: string;
	platform: string;
	contentType: string;
	framework: string;
	hookType: string;
	language: string;
	prompt?: string;
	referenceImages?: string[];
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/types/ backend/src/interfaces/providers/
git commit -m "feat: add prompt and referenceImages to generation types and provider interfaces"
```

---

### Task 2: Backend — Prompt Builder and Route/Job Updates

**Files:**
- Modify: `backend/src/utils/prompt-builder.ts`
- Modify: `backend/src/routes/topic.route.ts`
- Modify: `backend/src/routes/generation.route.ts`
- Modify: `backend/src/jobs/topic-generation.job.ts`
- Modify: `backend/src/jobs/content-generation.job.ts`
- Modify: `backend/src/services/generation.service.ts`

- [ ] **Step 1: Add prompt support to topic prompt builder**

In `backend/src/utils/prompt-builder.ts`, update `buildTopicGenerationPrompt`. Find the user prompt template and add the prompt line. The function currently has no `prompt` field in its input type — it uses `TopicGenerationInput` which now has `referenceImages` but we need to add `prompt` to the prompt builder input type too.

Add `prompt?: string` to the `TopicGenerationInput` interface (already done in step 3 above — wait, no, `TopicGenerationInput` in the provider interface doesn't have `prompt`. The prompt builder uses the same type. Let me add it properly.)

Actually, looking at the prompt builder, `buildTopicGenerationPrompt` accepts `TopicGenerationInput` from the provider interface. We need to add `prompt` there too. Go back to `backend/src/interfaces/providers/topic-generator.interface.ts` and ensure `prompt?: string` is in `TopicGenerationInput`:

```typescript
export interface TopicGenerationInput {
	brandContext: string;
	productContexts?: string[];
	skillContext?: string;
	platform?: string;
	objective?: string;
	formats?: string[];
	dateFrom?: string;
	dateTo?: string;
	count?: number;
	prompt?: string;
	referenceImages?: string[];
}
```

Then in `backend/src/utils/prompt-builder.ts`, in the `buildTopicGenerationPrompt` function, add the prompt line to the user prompt. Find:

```typescript
Make topics diverse, engaging, and aligned with the brand voice.`;
```

Replace with:

```typescript
${input.prompt ? `\nAdditional instructions: ${input.prompt}` : ""}

Make topics diverse, engaging, and aligned with the brand voice.`;
```

- [ ] **Step 2: Update topic route to accept prompt and referenceImages**

In `backend/src/routes/topic.route.ts`, update the POST `/generate` handler:

```typescript
app.post("/generate", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const body = await c.req.json();
    const { brandId, productIds, platform, objective, formats, dateFrom, dateTo, count, prompt, referenceImages } = body;
    const result = await topicService.generate(workspaceId, userId, {
        brandId,
        productIds,
        platform,
        objective,
        formats,
        dateFrom,
        dateTo,
        count,
        prompt,
        referenceImages,
    });
    return c.json({ data: result }, 202);
});
```

- [ ] **Step 3: Update generation route to accept referenceImages**

In `backend/src/routes/generation.route.ts`, add `referenceImages` to the body destructuring:

```typescript
const request = await generationService.create(workspaceId, userId, {
    brandId: body.brandId,
    productId: body.productId,
    productIds: body.productIds,
    contentTopicId: body.contentTopicId,
    platform: body.platform,
    contentType: body.contentType,
    framework: body.framework,
    hookType: body.hookType,
    language: body.language,
    prompt: body.prompt,
    objective: body.objective,
    tonePreset: body.tonePreset,
    visualStyle: body.visualStyle,
    outputLength: body.outputLength,
    referenceImages: body.referenceImages,
});
```

- [ ] **Step 4: Update topic generation job to pass prompt and referenceImages**

In `backend/src/jobs/topic-generation.job.ts`, add to `TopicJobData`:

```typescript
interface TopicJobData {
    workspaceId: string;
    brandId?: string;
    productIds?: string[];
    platform?: string;
    objective?: string;
    formats?: string[];
    dateFrom?: string;
    dateTo?: string;
    count: number;
    userId: string;
    prompt?: string;
    referenceImages?: string[];
}
```

In the `handle` method, update the destructuring to include `prompt` and `referenceImages`:

```typescript
const { workspaceId, brandId, productIds, platform, objective, formats, dateFrom, dateTo, count, userId, prompt, referenceImages } = data;
```

Add `prompt` and `referenceImages` to the generation input:

```typescript
const generationInput = {
    brandContext,
    productContexts: productContexts.length > 0 ? productContexts : undefined,
    skillContext: skillContext || undefined,
    platform,
    objective,
    formats,
    dateFrom,
    dateTo,
    count,
    prompt,
    referenceImages,
};
```

- [ ] **Step 5: Update content generation job to pass referenceImages**

In `backend/src/jobs/content-generation.job.ts`, add to `ContentJobData`:

```typescript
interface ContentJobData {
    requestId: string;
    productIds?: string[];
    referenceImages?: string[];
    userId: string;
}
```

In the `handle` method, update destructuring:

```typescript
const { requestId, productIds, referenceImages, userId } = data;
```

Add `referenceImages` to the generation input:

```typescript
const generationInput = {
    brandContext,
    productContext,
    skillContext: skillContext || undefined,
    platform: request.platform,
    contentType: request.contentType,
    framework: request.framework,
    hookType: request.hookType,
    language: request.language,
    prompt: request.prompt ?? undefined,
    referenceImages,
};
```

- [ ] **Step 6: Update generation service to pass referenceImages to job**

In `backend/src/services/generation.service.ts`, update the `boss.send` call to include `referenceImages`:

```typescript
await this.boss.send("content-generation", {
    requestId: request.id,
    productIds: input.productIds ?? (input.productId ? [input.productId] : []),
    referenceImages: input.referenceImages,
    userId,
});
```

- [ ] **Step 7: Update topic service to pass prompt and referenceImages to job**

In `backend/src/services/topic.service.ts`, update the `boss.send` call in `generate()`:

```typescript
const jobId = await this.boss.send("topic-generation", {
    workspaceId,
    brandId: input.brandId,
    productIds: input.productIds,
    platform: input.platform,
    objective: input.objective,
    formats: input.formats,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    count: input.count ?? 10,
    userId,
    prompt: input.prompt,
    referenceImages: input.referenceImages,
});
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/
git commit -m "feat: wire prompt and referenceImages through routes, jobs, and prompt builder"
```

---

### Task 3: Backend — Reference Image Upload Endpoint

**Files:**
- Create: `backend/src/routes/upload.route.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create upload route**

Create `backend/src/routes/upload.route.ts`:

```typescript
import { Hono } from "hono";
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export function createUploadRoutes(storageProvider: IStorageProvider, bucket: string) {
	const app = new Hono<{ Variables: Variables }>();

	app.post("/upload", async (c) => {
		const workspaceId = c.get("workspaceId");
		const formData = await c.req.parseBody();
		const file = formData.file as File;

		if (!file) {
			return c.json({ error: "file is required" }, 400);
		}

		if (!ALLOWED_TYPES.includes(file.type)) {
			return c.json({ error: "File must be jpg, png, or webp" }, 400);
		}

		if (file.size > MAX_SIZE) {
			return c.json({ error: "File must be under 5MB" }, 400);
		}

		const ext = file.name.split(".").pop() || "jpg";
		const key = `reference-images/${workspaceId}/${crypto.randomUUID()}.${ext}`;
		const buffer = Buffer.from(await file.arrayBuffer());

		const url = await storageProvider.upload(bucket, key, buffer, file.type);
		return c.json({ url }, 201);
	});

	return app;
}
```

- [ ] **Step 2: Wire upload route in composition root**

In `backend/src/index.ts`, add the import near the other route imports:

```typescript
import { createUploadRoutes } from "./routes/upload.route";
```

Find where workspace-scoped routes are mounted (search for `app.route("/api/workspaces/:workspaceId/`). Add near the other workspace routes:

```typescript
app.route("/api/workspaces/:workspaceId/reference-images", workspaceMiddleware, createUploadRoutes(storageProvider, env.minioBucket));
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/upload.route.ts backend/src/index.ts
git commit -m "feat: add reference image upload endpoint"
```

---

### Task 4: Backend — AI Provider Updates (Temperature, System Prompt, Multimodal)

**Files:**
- Modify: `backend/src/providers/anthropic.provider.ts`
- Modify: `backend/src/providers/gemini.provider.ts`

- [ ] **Step 1: Update Anthropic provider**

In `backend/src/providers/anthropic.provider.ts`, update all three generate methods to add `temperature: 0` and multimodal image support. The key change pattern for each method:

**`generateContent` method** — replace lines 74-78:

```typescript
private async generateContent(input: ContentGenerationInput): Promise<ContentGenerationOutput> {
    const { systemPrompt, userPrompt } = buildContentGenerationPrompt(input);

    const userContent = input.referenceImages?.length
        ? [
            ...input.referenceImages.map((url) => ({
                type: "image" as const,
                source: { type: "url" as const, url },
            })),
            { type: "text" as const, text: userPrompt },
        ]
        : userPrompt;

    const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    try {
        return parseJsonResponse(text) as ContentGenerationOutput;
    } catch (_err) {
        throw new Error(
            `AnthropicProvider: Failed to parse content generation response as JSON. Raw: ${text}`,
        );
    }
}
```

**`generateCampaign` method** — add `temperature: 0` (no image support needed for campaigns):

```typescript
const response = await this.client.messages.create({
    model: this.model,
    max_tokens: 2048,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
});
```

**`generateTopics` method** — same pattern as generateContent:

```typescript
private async generateTopics(input: TopicGenerationInput): Promise<TopicGenerationOutput> {
    const { systemPrompt, userPrompt } = buildTopicGenerationPrompt(input);

    const userContent = input.referenceImages?.length
        ? [
            ...input.referenceImages.map((url) => ({
                type: "image" as const,
                source: { type: "url" as const, url },
            })),
            { type: "text" as const, text: userPrompt },
        ]
        : userPrompt;

    const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    try {
        return parseJsonResponse(text) as TopicGenerationOutput;
    } catch (_err) {
        throw new Error(
            `AnthropicProvider: Failed to parse topic generation response as JSON. Raw: ${text}`,
        );
    }
}
```

Also add `temperature: 0` to all other `messages.create` calls (generateProductBrain, scrapeProduct, scrape).

- [ ] **Step 2: Update Gemini provider**

In `backend/src/providers/gemini.provider.ts`, update all three generate methods to use `systemInstruction`, `temperature: 0`, and multimodal support.

**`generateContent` method** — replace lines 71-77:

```typescript
private async generateContent(input: ContentGenerationInput): Promise<ContentGenerationOutput> {
    const { systemPrompt, userPrompt } = buildContentGenerationPrompt(input);

    const contents = input.referenceImages?.length
        ? [
            ...input.referenceImages.map((url) => ({
                fileData: { fileUri: url, mimeType: "image/jpeg" },
            })),
            { text: userPrompt },
        ]
        : userPrompt;

    const response = await this.ai.models.generateContent({
        model: this.model,
        config: {
            temperature: 0,
            systemInstruction: systemPrompt,
        },
        contents,
    });

    const text = response.text ?? "";
    try {
        return parseJsonResponse(text) as ContentGenerationOutput;
    } catch (_err) {
        throw new Error(
            `GeminiProvider: Failed to parse content generation response as JSON. Raw: ${text}`,
        );
    }
}
```

**`generateCampaign` method** — separate system instruction, add temperature:

```typescript
private async generateCampaign(input: CampaignGenerationInput): Promise<CampaignGenerationOutput> {
    const { systemPrompt, userPrompt } = buildCampaignGenerationPrompt(input);

    const response = await this.ai.models.generateContent({
        model: this.model,
        config: {
            temperature: 0,
            systemInstruction: systemPrompt,
        },
        contents: userPrompt,
    });

    const text = response.text ?? "";
    try {
        return parseJsonResponse(text) as CampaignGenerationOutput;
    } catch (_err) {
        throw new Error(
            `GeminiProvider: Failed to parse campaign generation response as JSON. Raw: ${text}`,
        );
    }
}
```

**`generateTopics` method** — same pattern as generateContent:

```typescript
private async generateTopics(input: TopicGenerationInput): Promise<TopicGenerationOutput> {
    const { systemPrompt, userPrompt } = buildTopicGenerationPrompt(input);

    const contents = input.referenceImages?.length
        ? [
            ...input.referenceImages.map((url) => ({
                fileData: { fileUri: url, mimeType: "image/jpeg" },
            })),
            { text: userPrompt },
        ]
        : userPrompt;

    const response = await this.ai.models.generateContent({
        model: this.model,
        config: {
            temperature: 0,
            systemInstruction: systemPrompt,
        },
        contents,
    });

    const text = response.text ?? "";
    try {
        return parseJsonResponse(text) as TopicGenerationOutput;
    } catch (_err) {
        throw new Error(
            `GeminiProvider: Failed to parse topic generation response as JSON. Raw: ${text}`,
        );
    }
}
```

Also update `generateProductBrain`, `scrapeProduct`, and `scrape` methods to use `config: { temperature: 0, systemInstruction: ... }` pattern instead of combining prompts.

- [ ] **Step 3: Commit**

```bash
git add backend/src/providers/
git commit -m "feat: add temperature 0, system instruction separation, and multimodal image support to AI providers"
```

---

### Task 5: Frontend — Create ReferenceImageUpload Component

**Files:**
- Create: `frontend/src/components/ui/ReferenceImageUpload.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/ui/ReferenceImageUpload.tsx`:

```tsx
import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { api } from "../../services/api";

interface ImageRef {
  id: string;
  url: string;
  uploading: boolean;
  preview: string;
}

interface ReferenceImageUploadProps {
  workspaceId: string;
  images: ImageRef[];
  onChange: (images: ImageRef[]) => void;
}

export type { ImageRef };

export function ReferenceImageUpload({ workspaceId, images, onChange }: ReferenceImageUploadProps) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    const id = crypto.randomUUID();
    const preview = URL.createObjectURL(file);

    // Add placeholder immediately
    onChange([...images, { id, url: "", uploading: true, preview }]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/workspaces/${workspaceId}/reference-images/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();

      // Update with real URL
      onChange((prev: ImageRef[]) =>
        prev.map((img) => (img.id === id ? { ...img, url: data.url, uploading: false } : img))
      );
    } catch {
      // Remove failed upload
      onChange((prev: ImageRef[]) => prev.filter((img) => img.id !== id));
    }
  }, [workspaceId, images, onChange]);

  const handleFiles = (files: FileList | File[]) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    const validFiles = Array.from(files).filter((f) => validTypes.includes(f.type));
    for (const file of validFiles) {
      uploadFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleRemove = (id: string) => {
    const img = images.find((i) => i.id === id);
    if (img?.preview) URL.revokeObjectURL(img.preview);
    onChange(images.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-indigo-400 bg-indigo-50"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
        }`}
      >
        <Upload size={20} className="mx-auto text-gray-400 mb-1.5" />
        <p className="text-xs text-gray-500">Drop images here or click to upload</p>
        <p className="text-[10px] text-gray-400 mt-0.5">JPG, PNG, WebP · Max 5MB each</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 group">
              <img
                src={img.preview}
                alt=""
                className="w-full h-full object-cover"
              />
              {img.uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-white" />
                </div>
              )}
              {!img.uploading && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemove(img.id); }}
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} className="text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Note:** The `onChange` callback is used both as a direct setter and as a functional updater. The parent component should use `useState` setter which supports both patterns.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/ReferenceImageUpload.tsx
git commit -m "feat: create ReferenceImageUpload component with drag-and-drop and immediate MinIO upload"
```

---

### Task 6: Frontend — Add Prompt and Image Upload to TopicsPage

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx`

- [ ] **Step 1: Add imports**

Add at the top of the file:

```typescript
import { ReferenceImageUpload, type ImageRef } from "../components/ui/ReferenceImageUpload";
```

- [ ] **Step 2: Add state**

Inside the component, after the existing form state variables, add:

```typescript
const [topicPrompt, setTopicPrompt] = useState("");
const [referenceImages, setReferenceImages] = useState<ImageRef[]>([]);
```

- [ ] **Step 3: Update handleGenerate API call**

In the `handleGenerate` function body, add `prompt` and `referenceImages` to the JSON payload:

```typescript
prompt: topicPrompt.trim() || undefined,
referenceImages: referenceImages.filter((i) => !i.uploading).map((i) => i.url).length > 0
    ? referenceImages.filter((i) => !i.uploading).map((i) => i.url)
    : undefined,
```

- [ ] **Step 4: Add "Additional Direction" section to the form**

Below the Schedule section and above the Generate button, add a new card:

```tsx
{/* Additional Direction Section */}
<div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        Additional Direction
    </div>

    <div>
        <textarea
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
            rows={3}
            placeholder="Add any specific instructions, direction, or context..."
            value={topicPrompt}
            onChange={(e) => setTopicPrompt(e.target.value)}
        />
        <p className="text-[10px] text-gray-400 mt-1">
            Tip: You can paste URLs as references and they will be included in the AI context.
        </p>
    </div>

    <div>
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
            Reference Images (optional)
        </label>
        <ReferenceImageUpload
            workspaceId={activeWorkspace!.id}
            images={referenceImages}
            onChange={setReferenceImages}
        />
    </div>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/TopicsPage.tsx
git commit -m "feat: add custom prompt and reference image upload to TopicsPage"
```

---

### Task 7: Frontend — Add URL Note and Image Upload to GeneratePage

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx`

- [ ] **Step 1: Add imports**

Add at the top of the file:

```typescript
import { ReferenceImageUpload, type ImageRef } from "../components/ui/ReferenceImageUpload";
```

- [ ] **Step 2: Add state**

After the existing `customPrompt` state, add:

```typescript
const [referenceImages, setReferenceImages] = useState<ImageRef[]>([]);
```

- [ ] **Step 3: Add URL note below existing prompt textarea**

Find the existing custom prompt textarea (around line 835-841). After the closing `</textarea>`, add:

```tsx
<p className="text-[10px] text-gray-400 mt-1">
    Tip: You can paste URLs as references and they will be included in the AI context.
</p>
```

- [ ] **Step 4: Add ReferenceImageUpload below the prompt section**

After the prompt `</div>`, and still inside the advanced mode section, add:

```tsx
<div>
    <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
        Reference Images (optional)
    </label>
    <ReferenceImageUpload
        workspaceId={activeWorkspace!.id}
        images={referenceImages}
        onChange={setReferenceImages}
    />
</div>
```

- [ ] **Step 5: Update handleSubmit to send referenceImages**

In the `handleSubmit` function, add `referenceImages` to the JSON payload:

```typescript
referenceImages: referenceImages.filter((i) => !i.uploading).map((i) => i.url).length > 0
    ? referenceImages.filter((i) => !i.uploading).map((i) => i.url)
    : undefined,
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/GeneratePage.tsx
git commit -m "feat: add URL tip and reference image upload to GeneratePage"
```

---

### Task 8: Verification — Build and Tests

**Files:** None (verification only)

- [ ] **Step 1: Run backend tests**

Run: `cd backend && bun test`
Expected: All tests pass.

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: TypeScript check passes and production build succeeds.

- [ ] **Step 3: Run Biome format**

Run: `cd backend && bunx biome check --write .`
Expected: All files formatted.

- [ ] **Step 4: Final commit if formatting changes**

```bash
git add -A
git commit -m "chore: format and lint"
```
