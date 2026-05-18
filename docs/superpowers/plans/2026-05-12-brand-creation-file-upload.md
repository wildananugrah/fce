# Brand Creation File Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-and-drop PDF/DOCX/TXT upload to the New Brand form so users can auto-fill brand brain fields from a file (alongside or instead of a URL), and store the file as a reference document after the brand is saved.

**Architecture:** File is held in React state as a `File` object until the brand is saved. On auto-fill, the frontend sends `multipart/form-data` to the existing `scrape-preview` endpoint which now extracts text from the file and merges it with URL content before passing to the AI. After brand creation, the file is uploaded via the existing document upload endpoint using the new `brandId`.

**Tech Stack:** Bun, Hono (multipart `parseBody`), `pdf-parse` (already installed), `mammoth` (already installed), React 19, Tailwind CSS 4, `apiUpload` (XHR progress, already in `api.ts`)

---

## File Map

| Action | Path |
|--------|------|
| **Create** | `backend/src/utils/extract-file-text.ts` |
| **Modify** | `backend/src/interfaces/providers/brand-scraper.interface.ts` |
| **Modify** | `backend/src/providers/anthropic.provider.ts` |
| **Modify** | `backend/src/providers/openrouter.provider.ts` |
| **Modify** | `backend/src/providers/gemini.provider.ts` |
| **Modify** | `backend/src/routes/brand.route.ts` |
| **Create** | `frontend/src/components/ui/FileDropZone.tsx` |
| **Modify** | `frontend/src/components/brands/BrandBrainForm.tsx` |
| **Create** | `backend/tests/utils/extract-file-text.test.ts` |

---

## Task 1: Backend util — extract text from a File object

This new util extracts plain text from a `File` object in memory (not from a URL). It reuses the same `pdf-parse` / `mammoth` imports that `document-extraction.job.ts` already uses.

**Files:**
- Create: `backend/src/utils/extract-file-text.ts`
- Create: `backend/tests/utils/extract-file-text.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/utils/extract-file-text.test.ts
import { describe, test, expect } from "bun:test";
import { extractFileText } from "../../src/utils/extract-file-text";

describe("extractFileText", () => {
  test("extracts text from a plain-text file", async () => {
    const content = "Hello from a text file";
    const file = new File([content], "doc.txt", { type: "text/plain" });
    const result = await extractFileText(file);
    expect(result).toBe(content);
  });

  test("throws on unsupported file type", async () => {
    const file = new File(["data"], "image.jpg", { type: "image/jpeg" });
    await expect(extractFileText(file)).rejects.toThrow("Unsupported file type: image/jpeg");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && bun test tests/utils/extract-file-text.test.ts
```

Expected: FAIL — `extractFileText` is not defined.

- [ ] **Step 3: Implement the util**

```typescript
// backend/src/utils/extract-file-text.ts
const SUPPORTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export async function extractFileText(file: File): Promise<string> {
  if (!SUPPORTED_TYPES.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (file.type === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    await parser.load();
    const result = await parser.getText();
    return result.text;
  }

  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // text/plain
  return buffer.toString("utf-8");
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && bun test tests/utils/extract-file-text.test.ts
```

Expected: PASS (txt and unsupported-type tests pass; PDF/DOCX require real binary fixtures so they are covered by integration, not unit test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/extract-file-text.ts backend/tests/utils/extract-file-text.test.ts
git commit -m "feat: add extractFileText util for synchronous file-to-text extraction"
```

---

## Task 2: Extend BrandScrapingInput with optional fileText

**Files:**
- Modify: `backend/src/interfaces/providers/brand-scraper.interface.ts`

- [ ] **Step 1: Add `fileText` to the interface**

In `backend/src/interfaces/providers/brand-scraper.interface.ts`, add the optional field after `skillContext`:

Old:
```typescript
export interface BrandScrapingInput {
	url: string;
	// "indonesian" | "english". Controls the language of the AI-extracted
	// fields (summary, tone, dos/donts, etc). Defaults to indonesian when
	// omitted to match the rest of the app.
	language?: string;
	// Optional skill context string built from the brandBrain manifest.
	// When provided, it is prepended to the system prompt so active skills
	// can influence the brand-analysis output.
	skillContext?: string;
}
```

New:
```typescript
export interface BrandScrapingInput {
	url?: string;
	language?: string;
	skillContext?: string;
	/** Plain text extracted from an uploaded file. Merged with URL content when both are present. */
	fileText?: string;
}
```

- [ ] **Step 2: Run type check to see what breaks**

```bash
cd backend && bunx tsc --noEmit 2>&1 | head -40
```

Expected: errors in the three provider files where `input.url` is now used as `string | undefined` but `fetchUrlContent` still expects `string`. The next three tasks fix each provider.

- [ ] **Step 3: Commit the interface change**

```bash
git add backend/src/interfaces/providers/brand-scraper.interface.ts
git commit -m "feat: extend BrandScrapingInput with optional url and fileText fields"
```

---

## Task 3: Update AnthropicProvider.scrape() to support fileText

**Files:**
- Modify: `backend/src/providers/anthropic.provider.ts` (around line 360)

- [ ] **Step 1: Replace the `scrape` method body**

Find the `async scrape(input: BrandScrapingInput)` method (line ~360) in `backend/src/providers/anthropic.provider.ts`. Replace the entire method body:

```typescript
async scrape(input: BrandScrapingInput): Promise<BrandScrapingOutput> {
  // Build the context sections from URL and/or uploaded file text.
  const contextParts: string[] = [];

  if (input.url) {
    const fetched = await fetchUrlContent(input.url);
    if (fetched.source !== "failed" && fetched.content) {
      contextParts.push(
        `=== EXTRACTED WEBSITE CONTENT ===\n=== Source: ${fetched.url} (fetched via ${fetched.source}) ===\n${fetched.content}`,
      );
    }
  }

  if (input.fileText?.trim()) {
    contextParts.push(
      `=== UPLOADED DOCUMENT CONTENT ===\n${input.fileText.trim()}`,
    );
  }

  if (contextParts.length === 0) {
    throw new Error("AnthropicProvider: at least one of url or fileText is required for brand scraping");
  }

  const baseSystemPrompt = `You are a brand analyst expert. Analyze the provided website content and extract structured brand identity information.
You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`;
  const systemPrompt = input.skillContext
    ? `${input.skillContext}\n\n${baseSystemPrompt}`
    : baseSystemPrompt;

  const userPrompt = `Based on the extracted website content below, extract structured brand information.

There are two groups of fields. Treat them differently:

=== TIER 1 — FACTUAL FIELDS (must be grounded in the page) ===
Only fill these if the website content actually states them. If not stated, use empty string "". Do NOT invent product names, founders, dates, metrics, claims, or quotes.
- name (string): Brand name
- category (string): Industry or product category (e.g. "SaaS", "F&B", "Fashion", "Healthcare", "Insurance")
- summary (string): 2-3 sentence brand description covering what they do, who they serve, and their mission
- brandPromise (string): Core brand promise or positioning statement (only if the page conveys one)
- usp (string): Unique selling points and key differentiators (only if stated or strongly implied by the page)

=== TIER 2 — STRATEGIC / SUBJECTIVE FIELDS (infer from Tier 1) ===
These are brand-strategy interpretations, not factual claims. Derive them from the brand's category, summary, and positioning. EVERY Tier 2 field MUST be populated with a reasonable, professional value appropriate for this kind of brand — never empty. If the page is minimal, use sensible defaults for the inferred category (e.g. a life-insurance brand → tone "Trustworthy, Reassuring, Professional"; dos "Lead with safety and peace of mind"; donts "Avoid fear-based or aggressive sales language").
- personality (string): Brand personality traits (e.g. "The Trusted Expert", "Bold Disruptor", "Friendly Guide")
- tone (string): Communication tone and style (e.g. "Professional, Conversational", "Bold, Playful", "Empathetic, Informative")
- targetAudience (string): Description of primary target audience — demographics, pain points, goals
- values (array of strings): 3-6 core brand values
- contentPillars (array of strings): 3-6 recurring content themes the brand should communicate about
- marketingStrategy (string): Overall marketing approach and focus areas
- dos (array of strings): 3-6 content rules to always follow when creating content for this brand
- donts (array of strings): 3-6 content rules to always avoid
- vocabulary (object with: preferred (array of strings), avoided (array of strings)): Brand vocabulary guidelines — preferred words/phrases and words to avoid

${languageDirective(input.language)}

${contextParts.join("\n\n")}`;

  const response = await this.client.messages.create({
    model: this.model,
    ...this.anthropicParams(generatorTuning.brandScraper),
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  this.lastUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  try {
    return parseJsonResponse(text) as BrandScrapingOutput;
  } catch (_err) {
    throw new Error(
      `AnthropicProvider: Failed to parse brand scraping response as JSON. Raw: ${text}`,
    );
  }
}
```

- [ ] **Step 2: Run type check**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "anthropic.provider" | head -10
```

Expected: no errors for `anthropic.provider.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/providers/anthropic.provider.ts
git commit -m "feat: update AnthropicProvider.scrape() to accept optional url and fileText"
```

---

## Task 4: Update OpenRouterProvider.scrape() to support fileText

**Files:**
- Modify: `backend/src/providers/openrouter.provider.ts` (around line 251)

- [ ] **Step 1: Replace the `scrape` method body**

Find the `async scrape(input: BrandScrapingInput)` method (~line 251) in `backend/src/providers/openrouter.provider.ts`. Replace its entire body with the same pattern as Task 3, replacing only the final AI call and error prefix:

```typescript
async scrape(input: BrandScrapingInput): Promise<BrandScrapingOutput> {
  const contextParts: string[] = [];

  if (input.url) {
    const fetched = await fetchUrlContent(input.url);
    if (fetched.source !== "failed" && fetched.content) {
      contextParts.push(
        `=== EXTRACTED WEBSITE CONTENT ===\n=== Source: ${fetched.url} (fetched via ${fetched.source}) ===\n${fetched.content}`,
      );
    }
  }

  if (input.fileText?.trim()) {
    contextParts.push(
      `=== UPLOADED DOCUMENT CONTENT ===\n${input.fileText.trim()}`,
    );
  }

  if (contextParts.length === 0) {
    throw new Error("OpenRouterProvider: at least one of url or fileText is required for brand scraping");
  }

  const baseSystemPrompt = `You are a brand analyst expert. Analyze the provided website content and extract structured brand identity information.
You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`;
  const systemPrompt = input.skillContext
    ? `${input.skillContext}\n\n${baseSystemPrompt}`
    : baseSystemPrompt;

  const userPrompt = `Based on the extracted website content below, extract structured brand information.

There are two groups of fields. Treat them differently:

=== TIER 1 — FACTUAL FIELDS (must be grounded in the page) ===
Only fill these if the website content actually states them. If not stated, use empty string "". Do NOT invent product names, founders, dates, metrics, claims, or quotes.
- name (string): Brand name
- category (string): Industry or product category (e.g. "SaaS", "F&B", "Fashion", "Healthcare", "Insurance")
- summary (string): 2-3 sentence brand description covering what they do, who they serve, and their mission
- brandPromise (string): Core brand promise or positioning statement (only if the page conveys one)
- usp (string): Unique selling points and key differentiators (only if stated or strongly implied by the page)

=== TIER 2 — STRATEGIC / SUBJECTIVE FIELDS (infer from Tier 1) ===
These are brand-strategy interpretations, not factual claims. Derive them from the brand's category, summary, and positioning. EVERY Tier 2 field MUST be populated with a reasonable, professional value appropriate for this kind of brand — never empty. If the page is minimal, use sensible defaults for the inferred category (e.g. a life-insurance brand → tone "Trustworthy, Reassuring, Professional"; dos "Lead with safety and peace of mind"; donts "Avoid fear-based or aggressive sales language").
- personality (string): Brand personality traits (e.g. "The Trusted Expert", "Bold Disruptor", "Friendly Guide")
- tone (string): Communication tone and style (e.g. "Professional, Conversational", "Bold, Playful", "Empathetic, Informative")
- targetAudience (string): Description of primary target audience — demographics, pain points, goals
- values (array of strings): 3-6 core brand values
- contentPillars (array of strings): 3-6 recurring content themes the brand should communicate about
- marketingStrategy (string): Overall marketing approach and focus areas
- dos (array of strings): 3-6 content rules to always follow when creating content for this brand
- donts (array of strings): 3-6 content rules to always avoid
- vocabulary (object with: preferred (array of strings), avoided (array of strings)): Brand vocabulary guidelines — preferred words/phrases and words to avoid

${languageDirective(input.language)}

${contextParts.join("\n\n")}`;

  const text = await this.callOpenRouter(systemPrompt, userPrompt, generatorTuning.brandScraper);
  try {
    return parseJsonResponse(text) as BrandScrapingOutput;
  } catch (_err) {
    throw new Error(
      `OpenRouterProvider: Failed to parse brand scraping response as JSON. Raw: ${text}`,
    );
  }
}
```

- [ ] **Step 2: Run type check**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "openrouter.provider" | head -10
```

Expected: no errors for `openrouter.provider.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/providers/openrouter.provider.ts
git commit -m "feat: update OpenRouterProvider.scrape() to accept optional url and fileText"
```

---

## Task 5: Update GeminiProvider.scrape() to support fileText

**Files:**
- Modify: `backend/src/providers/gemini.provider.ts` (around line 372)

- [ ] **Step 1: Replace the `scrape` method body**

Find the `async scrape(input: BrandScrapingInput)` method (~line 372) in `backend/src/providers/gemini.provider.ts`. Replace its entire body:

```typescript
async scrape(input: BrandScrapingInput): Promise<BrandScrapingOutput> {
  const contextParts: string[] = [];

  if (input.url) {
    const fetched = await fetchUrlContent(input.url);
    if (fetched.source !== "failed" && fetched.content) {
      contextParts.push(
        `=== EXTRACTED WEBSITE CONTENT ===\n=== Source: ${fetched.url} (fetched via ${fetched.source}) ===\n${fetched.content}`,
      );
    }
  }

  if (input.fileText?.trim()) {
    contextParts.push(
      `=== UPLOADED DOCUMENT CONTENT ===\n${input.fileText.trim()}`,
    );
  }

  if (contextParts.length === 0) {
    throw new UrlFetchError([input.url ?? ""], "at least one of url or fileText is required");
  }

  const baseSystemPrompt =
    "You are a brand analyst expert. Analyze the provided website content and extract structured brand identity information. You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.";
  const systemPrompt = input.skillContext
    ? `${input.skillContext}\n\n${baseSystemPrompt}`
    : baseSystemPrompt;

  const userPrompt = `Based on the extracted website content below, extract structured brand information.

There are two groups of fields. Treat them differently:

=== TIER 1 — FACTUAL FIELDS (must be grounded in the page) ===
Only fill these if the website content actually states them. If not stated, use empty string "". Do NOT invent product names, founders, dates, metrics, claims, or quotes.
- name (string): Brand name
- category (string): Industry or product category (e.g. "SaaS", "F&B", "Fashion", "Healthcare", "Insurance")
- summary (string): 2-3 sentence brand description covering what they do, who they serve, and their mission
- brandPromise (string): Core brand promise or positioning statement (only if the page conveys one)
- usp (string): Unique selling points and key differentiators (only if stated or strongly implied by the page)

=== TIER 2 — STRATEGIC / SUBJECTIVE FIELDS (infer from Tier 1) ===
These are brand-strategy interpretations, not factual claims. Derive them from the brand's category, summary, and positioning. EVERY Tier 2 field MUST be populated with a reasonable, professional value appropriate for this kind of brand — never empty. If the page is minimal, use sensible defaults for the inferred category (e.g. a life-insurance brand → tone "Trustworthy, Reassuring, Professional"; dos "Lead with safety and peace of mind"; donts "Avoid fear-based or aggressive sales language").
- personality (string): Brand personality traits (e.g. "The Trusted Expert", "Bold Disruptor", "Friendly Guide")
- tone (string): Communication tone and style (e.g. "Professional, Conversational", "Bold, Playful", "Empathetic, Informative")
- targetAudience (string): Description of primary target audience — demographics, pain points, goals
- values (array of strings): 3-6 core brand values
- contentPillars (array of strings): 3-6 recurring content themes the brand should communicate about
- marketingStrategy (string): Overall marketing approach and focus areas
- dos (array of strings): 3-6 content rules to always follow when creating content for this brand
- donts (array of strings): 3-6 content rules to always avoid
- vocabulary (object with: preferred (array of strings), avoided (array of strings)): Brand vocabulary guidelines — preferred words/phrases and words to avoid

${languageDirective(input.language)}

${contextParts.join("\n\n")}`;

  const response = await this.ai.models.generateContent({
    model: this.model,
    config: this.geminiConfig(generatorTuning.brandScraper, systemPrompt),
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
    return parseJsonResponse(text) as BrandScrapingOutput;
  } catch (_err) {
    throw new Error(
      `GeminiProvider: Failed to parse brand scraping response as JSON. Raw: ${text}`,
    );
  }
}
```

- [ ] **Step 2: Run full type check — should be clean**

```bash
cd backend && bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/providers/gemini.provider.ts
git commit -m "feat: update GeminiProvider.scrape() to accept optional url and fileText"
```

---

## Task 6: Update the scrape-preview route to accept multipart + file

**Files:**
- Modify: `backend/src/routes/brand.route.ts` (the `POST /scrape-preview` handler, line 96–106)

- [ ] **Step 1: Add the import and rewrite the handler**

At the top of `brand.route.ts`, add the import for `extractFileText` after the existing imports:

```typescript
import { extractFileText } from "../utils/extract-file-text";
```

Then replace the `POST /scrape-preview` handler (lines 96–106):

Old:
```typescript
// POST /scrape-preview — synchronous scrape, returns AI result without saving
app.post("/scrape-preview", async (c) => {
	const body = await c.req.json();
	const { url, language } = body as { url?: string; language?: string };
	if (!url) {
		return c.json({ error: "url is required" }, 400);
	}
	const workspaceId = c.get("workspaceId");
	const brandScraper = await aiFactory.getBrandScraper(workspaceId);
	const result = await brandScraper.scrape({ url, language });
	return c.json({ data: result });
});
```

New:
```typescript
// POST /scrape-preview — synchronous scrape, returns AI result without saving.
// Accepts multipart/form-data with optional `url` and optional `file` (max 5 MB).
// At least one of url or file must be provided.
app.post("/scrape-preview", async (c) => {
	const formData = await c.req.parseBody();
	const url = (formData.url as string) || undefined;
	const file = formData.file instanceof File ? formData.file : undefined;
	const language = (formData.language as string) || undefined;

	if (!url && !file) {
		return c.json({ error: "url or file is required" }, 400);
	}

	const MAX_BYTES = 5 * 1024 * 1024;
	if (file && file.size > MAX_BYTES) {
		return c.json({ error: "File exceeds the 5 MB limit" }, 400);
	}

	let fileText: string | undefined;
	if (file) {
		fileText = await extractFileText(file);
	}

	const workspaceId = c.get("workspaceId");
	const brandScraper = await aiFactory.getBrandScraper(workspaceId);
	const result = await brandScraper.scrape({ url, language, fileText });
	return c.json({ data: result });
});
```

- [ ] **Step 2: Run type check**

```bash
cd backend && bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/brand.route.ts
git commit -m "feat: update scrape-preview route to accept multipart with optional file upload"
```

---

## Task 7: Create the FileDropZone frontend component

**Files:**
- Create: `frontend/src/components/ui/FileDropZone.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/ui/FileDropZone.tsx
import { useRef, useState } from "react";
import { FileText, X, Upload } from "lucide-react";

const ACCEPTED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

interface FileDropZoneProps {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  maxSizeMB?: number;
  disabled?: boolean;
}

export function FileDropZone({
  selectedFile,
  onFileSelect,
  onClear,
  maxSizeMB = 5,
  disabled = false,
}: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [sizeError, setSizeError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setSizeError("");
    if (!ACCEPTED_MIME.includes(file.type)) return;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setSizeError(`File is too large. Max size is ${maxSizeMB} MB.`);
      return;
    }
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (selectedFile) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-md">
        <FileText size={14} className="text-indigo-500 shrink-0" />
        <span className="text-sm text-indigo-700 flex-1 truncate">{selectedFile.name}</span>
        <button
          type="button"
          onClick={onClear}
          className="text-indigo-400 hover:text-indigo-600"
          aria-label="Remove file"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg px-4 py-5 text-center transition-colors ${
          disabled
            ? "opacity-50 cursor-not-allowed border-gray-200"
            : dragging
            ? "border-indigo-400 bg-indigo-50 cursor-pointer"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer"
        }`}
      >
        <Upload size={18} className="mx-auto text-gray-400 mb-1.5" />
        <p className="text-xs text-gray-500">Drop a file here, or click to browse</p>
        <p className="text-[10px] text-gray-400 mt-0.5">PDF, DOCX, TXT — Max {maxSizeMB} MB</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {sizeError && (
        <p className="text-xs text-red-500 mt-1">{sizeError}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run frontend type check**

```bash
cd frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/FileDropZone.tsx
git commit -m "feat: add FileDropZone component for drag-and-drop file selection"
```

---

## Task 8: Update BrandBrainForm — Overview tab UI + auto-fill + save

This is the main frontend wiring task. Three changes in one file:
1. Add `pendingFile` state
2. Restructure the Website section in the `overview` tab
3. Update `handleAutoFill` to send FormData when a file is present
4. Update `handleSave` to upload the file after brand creation

**Files:**
- Modify: `frontend/src/components/brands/BrandBrainForm.tsx`

- [ ] **Step 1: Add the FileDropZone import**

At the top of `BrandBrainForm.tsx`, add after the existing UI imports:

```typescript
import { FileDropZone } from "../ui/FileDropZone";
import { apiUpload } from "../../services/api";
```

- [ ] **Step 2: Add pendingFile state**

Inside `BrandBrainForm` function, after the existing `const abortRef` line (~line 347), add:

```typescript
const [pendingFile, setPendingFile] = useState<File | null>(null);
const [uploadProgress, setUploadProgress] = useState(0);
```

- [ ] **Step 3: Update handleAutoFill to support file + URL together**

Replace the existing `handleAutoFill` function (lines 437–488) with:

```typescript
const handleAutoFill = async () => {
  if (!form.websiteUrl.trim() && !pendingFile) return;
  setScraping(true);
  setError("");
  const controller = new AbortController();
  abortRef.current = controller;
  try {
    const formData = new FormData();
    if (form.websiteUrl.trim()) formData.append("url", form.websiteUrl.trim());
    if (pendingFile) formData.append("file", pendingFile);
    formData.append("language", scrapeLanguage);

    const result = await api<{
      name: string;
      category?: string;
      summary?: string;
      personality?: string;
      tone?: string;
      targetAudience?: string;
      brandPromise?: string;
      usp?: string;
      values?: string[];
      contentPillars?: string[];
      marketingStrategy?: string;
      dos?: string[];
      donts?: string[];
    }>(`/api/workspaces/${workspaceId}/brands/scrape-preview`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    setForm((prev) => ({
      ...prev,
      name: result.name || prev.name,
      industry: result.category || prev.industry,
      summary: result.summary || prev.summary,
      personality: result.personality || prev.personality,
      tone: result.tone || prev.tone,
      targetAudience: result.targetAudience || prev.targetAudience,
      brandPromise: result.brandPromise || prev.brandPromise,
      usp: result.usp || prev.usp,
      brandValues: result.values?.length ? result.values : prev.brandValues,
      contentPillars: result.contentPillars?.length ? result.contentPillars : prev.contentPillars,
      marketingStrategy: result.marketingStrategy || prev.marketingStrategy,
      dos: result.dos?.length ? result.dos : prev.dos,
      donts: result.donts?.length ? result.donts : prev.donts,
    }));
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    setError(e instanceof Error ? e.message : "Auto-fill failed");
  } finally {
    abortRef.current = null;
    setScraping(false);
  }
};
```

- [ ] **Step 4: Update handleSave to upload the pending file after brand creation**

In the `handleSave` function (line ~537), in the `else` branch (create mode), after the brain version is created and before `refreshProgress()`, add the file upload step:

Replace this section in `handleSave`:

```typescript
          await api(`/api/workspaces/${workspaceId}/brands/${brand.id}/brain-versions`, {
            method: "POST",
            body: JSON.stringify(buildBrainPayload()),
          });
          refreshProgress();
```

With:

```typescript
          await api(`/api/workspaces/${workspaceId}/brands/${brand.id}/brain-versions`, {
            method: "POST",
            body: JSON.stringify(buildBrainPayload()),
          });
          if (pendingFile) {
            const fd = new FormData();
            fd.append("file", pendingFile);
            fd.append("brandId", brand.id);
            await apiUpload(
              `/api/workspaces/${workspaceId}/documents/upload`,
              fd,
              setUploadProgress,
            );
          }
          refreshProgress();
```

- [ ] **Step 5: Update the Save button label to reflect upload phase**

Find the Save button in the form footer — it currently shows `saving ? "Saving…" : "Save brand"`. Update its `loading` label to reflect the upload phase. Locate the footer Save button (it calls `handleSave`) and update the label logic:

```typescript
{saving
  ? uploadProgress > 0
    ? `Uploading… ${uploadProgress}%`
    : "Saving…"
  : "Save brand"}
```

> Note: The actual Save button is in `NewBrandPage.tsx`, not in the form itself. Check `NewBrandPage.tsx` for the button that calls `ref.current?.save()` and update its label there. In `BrandBrainForm`, `onSavingChange` already mirrors `saving` to the parent.

- [ ] **Step 6: Restructure the Website section in the overview tab**

Find the `overview` tab section in the return JSX (~line 625). Replace the Website `<div>` block (the one containing the URL input row) with:

```tsx
<div>
  <div className="flex items-center gap-2 mb-1">
    <Globe size={18} className="text-gray-500" />
    <h3 className="text-sm font-semibold text-gray-900">Website or Document</h3>
  </div>
  <p className="text-xs text-gray-500 mb-3">
    Enter a website URL, upload a document, or both — the AI will use all available sources to auto-fill the brand details.
  </p>

  {/* URL row */}
  <div className="flex gap-2 items-stretch mb-3">
    <input
      value={form.websiteUrl}
      onChange={(e) => update("websiteUrl", e.target.value)}
      placeholder="https://brand.com"
      className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
    />
    <ScrapeLanguageToggle
      value={scrapeLanguage}
      onChange={setScrapeLanguage}
      disabled={scraping}
    />
  </div>

  {/* Divider */}
  <div className="flex items-center gap-3 mb-3">
    <div className="h-px flex-1 bg-gray-200" />
    <span className="text-xs text-gray-400">or</span>
    <div className="h-px flex-1 bg-gray-200" />
  </div>

  {/* File drop zone */}
  <div className="mb-3">
    <FileDropZone
      selectedFile={pendingFile}
      onFileSelect={setPendingFile}
      onClear={() => setPendingFile(null)}
      maxSizeMB={5}
      disabled={scraping}
    />
  </div>

  {/* Auto-fill button row */}
  <div className="flex items-center gap-2">
    <Button
      variant="secondary"
      onClick={handleAutoFill}
      loading={scraping}
      disabled={!form.websiteUrl.trim() && !pendingFile}
    >
      <Sparkles size={14} className="mr-1.5" />
      {pendingFile || (form.websiteUrl.trim() && pendingFile)
        ? "Auto-fill from Sources"
        : "Auto-fill from Website"}
    </Button>
    {scraping && (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => abortRef.current?.abort()}
      >
        Cancel
      </Button>
    )}
  </div>
  <SkillsAppliedStrip generator="brand-brain" className="mt-2" />
</div>
```

- [ ] **Step 7: Run frontend type check**

```bash
cd frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/brands/BrandBrainForm.tsx
git commit -m "feat: add file upload to brand creation form — drop zone, auto-fill, and post-save upload"
```

---

## Task 9: Update NewBrandPage save button label for upload phase

**Files:**
- Modify: `frontend/src/pages/NewBrandPage.tsx`

- [ ] **Step 1: Read the current save button in NewBrandPage**

Open `frontend/src/pages/NewBrandPage.tsx` and find the Save button that calls `formRef.current?.save()`. It likely uses a `saving` state mirrored from `onSavingChange`.

- [ ] **Step 2: Add uploadProgress mirroring**

The `BrandBrainForm` updates `uploadProgress` in its own state, but the parent Save button in `NewBrandPage` doesn't see it. The simplest fix: the `saving` flag stays `true` through the whole save + upload flow (it's set to `false` only in the `finally` block after upload completes). So the parent's "Saving…" label already covers the upload phase.

No changes needed to `NewBrandPage.tsx` — the existing `saving` mirror is sufficient.

- [ ] **Step 3: Verify by reading the file**

```bash
cat frontend/src/pages/NewBrandPage.tsx | grep -A5 "saving\|Save brand"
```

Confirm the Save button already uses the `saving` state for its label. If it shows a static "Save brand" with no dynamic label, update it to:

```tsx
disabled={saving}
```

And change the button text to:

```tsx
{saving ? "Saving…" : "Save brand"}
```

- [ ] **Step 4: Run type check**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit (only if changes were needed)**

```bash
git add frontend/src/pages/NewBrandPage.tsx
git commit -m "fix: keep save button disabled and labeled 'Saving…' during file upload phase"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run backend type check and tests**

```bash
cd backend && bunx tsc --noEmit && bun test
```

Expected: no type errors, all tests pass.

- [ ] **Step 2: Run frontend type check and lint**

```bash
cd frontend && npm run typecheck && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test — file only**

1. Start the dev server: `cd backend && bun run --hot src/index.ts` + `cd frontend && npm run dev`
2. Navigate to New Brand → Overview tab
3. Drop a small PDF onto the drop zone — confirm the file chip appears with the filename
4. Click "Auto-fill from Sources" — confirm the scraping banner appears and fields populate
5. Fill in Brand Name, click "Save brand"
6. Confirm redirect to the brand page
7. Open Workspace Settings → References tab — confirm the uploaded PDF appears with `pending` or `processing` status

- [ ] **Step 4: Manual smoke test — URL + file together**

1. Enter a website URL and drop a PDF
2. Click "Auto-fill from Sources"
3. Confirm both sources are used (check backend logs — the prompt should contain both sections)

- [ ] **Step 5: Manual smoke test — size limit**

1. Drop a file larger than 5 MB
2. Confirm the inline error "File is too large. Max size is 5 MB." appears and no file is selected

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: brand creation file upload — PDF/DOCX/TXT drop zone with auto-fill and reference storage"
```
