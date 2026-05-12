# Brand Creation — File Upload & Auto-fill Design

**Date:** 2026-05-12  
**Status:** Approved

## Summary

Add a drag-and-drop file upload zone to the New Brand creation flow so users can provide a PDF, DOCX, or TXT file as an information source alongside (or instead of) a website URL. The file content is used to auto-fill all brand brain tabs and is stored as a reference document for future AI generation.

---

## UI Layout

The Overview tab's "Website" section is restructured from a single-line row into a vertical stack:

```
WEBSITE
Enter the brand website URL or upload a document to auto-fill brand info using AI.

[ https://brand.com                              ] [ID] [EN]

                         — or —

┌─────────────────────────────────────────────────────┐
│                                                     │
│   📄  Drag & drop a file here, or click to browse  │
│       PDF, DOCX, TXT  •  Max 5 MB                  │
│                                                     │
└─────────────────────────────────────────────────────┘

 ✦ Auto-fill from Sources   [disabled if neither URL nor file provided]

Marketing skills applied: [Customer Research] [Competitor Profiling] ...
```

- When a file is selected, the drop zone collapses to a compact file chip: `📄 filename.pdf ×`
- Button label: "Auto-fill from Website" when only URL is entered; "Auto-fill from Sources" when a file is present
- Files exceeding 5 MB are rejected client-side with an inline error message

---

## Data Flow

### Auto-fill (synchronous)

1. User provides URL and/or file → clicks "Auto-fill from Sources"
2. Frontend sends `multipart/form-data` to `POST /api/workspaces/:id/brands/scrape-preview` with optional `url` and optional `file`
3. Backend runs in parallel: Jina Reader for URL (existing path), synchronous text extraction for file
4. Both text blobs are merged into one context string, sent to AI with the existing scrape prompt
5. AI returns filled fields for all tabs (Overview, Brand Voice, Brand DNA, Content Strategy, Do's & Don'ts) — same behavior as today but with richer context

### Save brand

1. Brand record is created with `createBrand()` — receives a `brandId`
2. If `pendingFile` exists in state, upload it via `POST /api/workspaces/:id/documents/upload` with the new `brandId`
3. Save button shows "Uploading…" with a spinner while step 2 runs
4. Redirect to brand page only after both steps complete

### File as stored reference

The uploaded file lands in the existing `BrandDocument` table with `extractionStatus: pending`. The existing async `document-extraction` pg-boss job picks it up automatically — same pipeline as uploading via the References tab in edit mode. No new infrastructure needed.

---

## Component & Code Changes

### Frontend

**New component: `src/components/ui/FileDropZone.tsx`**
- Props: `onFileSelect(file: File)`, `selectedFile: File | null`, `onClear()`, `maxSizeMB: number`, `accept: string`
- Handles: drag enter/leave/drop events, click-to-browse, client-side size validation, file chip display
- Reusable for future upload use cases

**`BrandBrainForm.tsx`**
- Add `pendingFile: File | null` state
- Pass `pendingFile` into the modified auto-fill call
- After `createBrand()` resolves, if `pendingFile` exists: call document upload API with new `brandId`, track progress, redirect only on completion
- Save button label: "Saving…" during brand creation, "Uploading…" during file upload

**`src/services/brandService.ts`**
- `scrapePreview()` accepts optional `file?: File`
- When file present: builds `FormData`, sends `multipart/form-data`; otherwise keeps existing JSON path

### Backend

**`POST /api/workspaces/:id/brands/scrape-preview`**
- Switch from `c.req.json()` to `c.req.parseBody()` to support multipart
- Accepts: `url?: string`, `file?: File`, `language: string`
- Validates: at least one of `url` or `file` must be present

**New util: `backend/src/utils/extract-file-text.ts`**
- `extractFileText(file: File): Promise<string>`
- PDF: use `pdf-parse` (or equivalent Bun-compatible library)
- DOCX: use `mammoth` for text extraction
- TXT: read directly
- Returns plain text string; throws on unsupported type

**`BrandScraperService.scrapePreview()`**
- Signature: `scrapePreview({ url?, fileText?, language })`
- Fetches URL content (existing Jina path) and/or receives `fileText`
- Merges both into one context string before passing to AI
- No change to AI prompt structure

---

## Constraints

- Max file size: **5 MB** — enforced client-side in `FileDropZone` with an inline error, and server-side in the route handler
- Accepted types: PDF, DOCX, TXT
- File stays in React state (`File` object) until brand is saved — not uploaded to server until `brandId` exists
- No orphaned DB records: if user cancels the form, the file is discarded with the component state
