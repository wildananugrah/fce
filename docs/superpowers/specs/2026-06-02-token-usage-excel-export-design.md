# Token Usage Excel Export — Design Spec

**Date:** 2026-06-02
**Status:** Approved

## Problem

Workspace members need to export token usage history as an Excel file for offline analysis, auditing, and cost reporting. The export must cover full detail (prompts, responses, tokens, cost) and summary views, scoped to a user-selected date range.

## Goal

Add an async Excel export feature to the Token Usage tab in Workspace Settings. The user picks a date range, clicks Export, waits for a background job to complete, and receives a 24-hour download link via SSE.

---

## Data Flow

```
User picks date range → clicks "Export" button
  → POST /api/workspaces/:id/ai-logs/export  { dateFrom, dateTo }
  → pg-boss enqueues "token-usage-export" job { workspaceId, userId, dateFrom, dateTo }
  → returns { jobId }
  → frontend shows spinner: "Generating your export..."

pg-boss worker (token-usage-export):
  1. Runs 4 parameterised SQL queries (workspaceId + date range)
  2. Builds .xlsx with ExcelJS — 4 sheets
  3. Uploads buffer to MinIO at exports/{workspaceId}/{jobId}-token-usage.xlsx
  4. Gets 24-hour presigned download URL
  5. SSE notifies userId: { type: "export_ready", data: { url, filename, workspaceId } }

Frontend receives SSE → renders green "Download Excel" button
  (button and URL are gone if the tab is closed — no DB persistence)
```

---

## Excel Sheets

| # | Sheet name | Source query | Content |
|---|---|---|---|
| 1 | Detail Log | Query 1 in docs/token-usage-history.sql | Per-call: timestamp, user email, workspace, generator, provider, model, brand, product, platform, content type, system prompt, user prompt, response text, input/output/total tokens, cost, duration, status, error message, log ID |
| 2 | By User | Query 2 | Per-user totals: email, name, workspace, total calls, input/output/total tokens, cost, first/last call |
| 3 | Daily Usage | Query 3 | Per-day + generator: date, workspace, generator, calls, input/output/total tokens, cost |
| 4 | By Model | Query 4 | Per-model: provider, model, generator, calls, input/output tokens, cost, avg duration ms |

All sheets are scoped to the selected workspace and date range.

---

## Components

### Backend

**New:** `backend/src/jobs/token-usage-export.job.ts`
- Constructor: `(prisma, minio, bucket, notificationService, logger)`
- `handle({ workspaceId, userId, dateFrom, dateTo, jobId })`:
  1. Execute 4 raw SQL queries via `prisma.$queryRawUnsafe`
  2. Build workbook with ExcelJS (one sheet per query result)
  3. Write workbook to `Buffer` via `workbook.xlsx.writeBuffer()`
  4. Upload buffer to MinIO
  5. Generate 24-hour presigned URL
  6. Call `notificationService.notify(userId, { type: "export_ready", data: { url, filename, workspaceId } })`
  7. On any error: `notificationService.notify(userId, { type: "export_failed", data: { workspaceId } })`

**Modify:** `backend/src/routes/ai-log.route.ts`
- Add `POST /export` — validates `dateFrom`/`dateTo` ISO strings, enqueues job, returns `{ data: { jobId } }`
- No auth gate beyond workspace membership (any member can export)

**Modify:** `backend/src/index.ts`
- `boss.createQueue("token-usage-export")`
- `boss.work("token-usage-export", ...)` — `localConcurrency: 1`, `pollingIntervalSeconds: 5`
- No schedule (on-demand only)

**Install:** `bun add exceljs` in `backend/`

### Frontend

**Modify:** `frontend/src/components/token-usage/TokenUsageSection.tsx`
- Add export panel above the stat cards (workspace scope only):
  - Start date input + End date input (default: last 30 days)
  - "Export to Excel" button
  - States: idle → loading (spinner + "Generating…") → ready (green Download button)
  - On `export_ready` SSE: set download URL + filename, show button
  - On `export_failed` SSE: show red error toast, reset to idle
  - Download button opens URL in new tab (presigned MinIO URL triggers browser download)

**Modify:** `frontend/src/hooks/useSSE.ts`
- Add `"export_ready"` and `"export_failed"` to `EVENT_TYPES`

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Empty result (no data in range) | Excel produced with headers only, no data rows |
| DB error in job | `export_failed` SSE → error toast, button resets |
| MinIO unavailable | `export_failed` SSE → error toast, button resets |
| Date range too large | No server limit; job runs to completion in background |
| Concurrent exports | Each gets independent job ID and SSE notification |
| Tab closed before SSE | URL is lost; user clicks Export again |

---

## MinIO Storage

- **Key:** `exports/{workspaceId}/{jobId}-token-usage.xlsx`
- **Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Presigned URL TTL:** 86400 seconds (24 hours)
- **Cleanup:** Objects remain in MinIO indefinitely; presigned URL expires after 24h making them inaccessible without a new export

---

## Out of Scope

- Persisting export history in the DB (user must keep tab open to access the download link)
- Automatic MinIO cleanup of old export files
- Email delivery of the Excel file
- Filtering by user or generator within the export UI (date range only; full workspace data)
