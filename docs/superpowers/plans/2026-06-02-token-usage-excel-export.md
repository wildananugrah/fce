# Token Usage Excel Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an async Excel export to the Token Usage tab — user picks a date range, a pg-boss job builds a 4-sheet .xlsx, uploads to MinIO, and delivers a 24-hour download link via SSE.

**Architecture:** The route enqueues a `token-usage-export` pg-boss job and returns a jobId. The job executes 4 raw SQL queries, builds the workbook with ExcelJS, uploads the buffer to MinIO, generates a presigned URL, and fires an SSE `export_ready` event. The frontend listens for the event and shows a Download button.

**Tech Stack:** Bun, TypeScript, Hono, pg-boss, ExcelJS, MinIO (AWS SDK S3-compatible), SSE via NotificationService, React 19, Tailwind CSS 4

---

## File Map

| Action | Path |
|--------|------|
| **Create** | `backend/src/jobs/token-usage-export.job.ts` |
| **Modify** | `backend/src/routes/ai-log.route.ts` |
| **Modify** | `backend/src/index.ts` |
| **Modify** | `frontend/src/hooks/useSSE.ts` |
| **Modify** | `frontend/src/components/token-usage/TokenUsageSection.tsx` |

---

## Task 1: Install ExcelJS on the backend

**Files:**
- Modify: `backend/package.json` (via bun add)

- [ ] **Step 1: Install ExcelJS**

```bash
cd backend && bun add exceljs
```

Expected: `exceljs` appears in `backend/package.json` dependencies.

- [ ] **Step 2: Verify it imports cleanly**

```bash
cd backend && bun -e "import ExcelJS from 'exceljs'; console.log('ok')"
```

Expected: prints `ok` with no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/bun.lock
git commit -m "chore: add exceljs to backend dependencies"
```

---

## Task 2: Create TokenUsageExportJob

**Files:**
- Create: `backend/src/jobs/token-usage-export.job.ts`

- [ ] **Step 1: Create the job file**

Create `backend/src/jobs/token-usage-export.job.ts` with this exact content:

```ts
import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import type { MinioStorageProvider } from "../providers/minio.provider";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

const SIGNED_URL_TTL_SECONDS = 86400; // 24 hours
const CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface TokenUsageExportJobData {
	workspaceId: string;
	userId: string;
	dateFrom: string; // ISO date string
	dateTo: string;   // ISO date string
	jobId: string;
}

export class TokenUsageExportJob {
	constructor(
		private prisma: PrismaClient,
		private storage: MinioStorageProvider,
		private bucket: string,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: TokenUsageExportJobData): Promise<void> {
		const { workspaceId, userId, dateFrom, dateTo, jobId } = data;
		const filename = `token-usage-${dateFrom}-${dateTo}.xlsx`;
		const key = `exports/${workspaceId}/${jobId}-token-usage.xlsx`;

		try {
			this.logger.info("token-usage-export: starting", { workspaceId, userId, dateFrom, dateTo });

			const [detail, byUser, byDay, byModel] = await Promise.all([
				this.queryDetail(workspaceId, dateFrom, dateTo),
				this.queryByUser(workspaceId, dateFrom, dateTo),
				this.queryByDay(workspaceId, dateFrom, dateTo),
				this.queryByModel(workspaceId, dateFrom, dateTo),
			]);

			const workbook = new ExcelJS.Workbook();
			workbook.creator = "FCE Dashboard";
			workbook.created = new Date();

			this.buildDetailSheet(workbook, detail as Record<string, unknown>[]);
			this.buildByUserSheet(workbook, byUser as Record<string, unknown>[]);
			this.buildByDaySheet(workbook, byDay as Record<string, unknown>[]);
			this.buildByModelSheet(workbook, byModel as Record<string, unknown>[]);

			const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
			await this.storage.upload(this.bucket, key, buffer, CONTENT_TYPE);
			const url = await this.storage.getSignedUrl(this.bucket, key, SIGNED_URL_TTL_SECONDS);

			this.logger.info("token-usage-export: complete", { workspaceId, key });
			this.notificationService.notify(userId, {
				type: "export_ready",
				data: { url, filename, workspaceId },
			});
		} catch (err) {
			this.logger.error("token-usage-export: failed", {
				workspaceId,
				error: err instanceof Error ? err.message : String(err),
			});
			this.notificationService.notify(userId, {
				type: "export_failed",
				data: { workspaceId },
			});
		}
	}

	// ─── Sheet 1: Detail Log ───────────────────────────────────────────────

	private async queryDetail(workspaceId: string, dateFrom: string, dateTo: string) {
		return this.prisma.$queryRawUnsafe(
			`SELECT
				apl.created_at        AS "timestamp",
				u.email               AS "user_email",
				u.full_name           AS "user_name",
				w.name                AS "workspace",
				apl.generator,
				apl.provider          AS "ai_provider",
				apl.model,
				b.name                AS "brand",
				p.name                AS "product",
				apl.platform,
				apl.content_type,
				apl.system_prompt,
				apl.user_prompt,
				apl.response_text,
				apl.input_tokens,
				apl.output_tokens,
				(COALESCE(apl.input_tokens,0) + COALESCE(apl.output_tokens,0)) AS "total_tokens",
				apl.estimated_cost    AS "estimated_cost_usd",
				apl.duration_ms,
				apl.status,
				apl.error_message,
				apl.id                AS "log_id",
				apl.request_id        AS "generation_request_id"
			FROM ai_provider_logs apl
			LEFT JOIN workspaces w ON w.id = apl.workspace_id
			LEFT JOIN users      u ON u.id = apl.user_id
			LEFT JOIN brands     b ON b.id = apl.brand_id
			LEFT JOIN products   p ON p.id = apl.product_id
			WHERE apl.workspace_id = $1
			  AND apl.created_at >= $2::timestamptz
			  AND apl.created_at <  $3::timestamptz + INTERVAL '1 day'
			ORDER BY apl.created_at DESC`,
			workspaceId, dateFrom, dateTo,
		);
	}

	private buildDetailSheet(workbook: ExcelJS.Workbook, rows: Record<string, unknown>[]) {
		const sheet = workbook.addWorksheet("Detail Log");
		sheet.columns = [
			{ header: "Timestamp",             key: "timestamp",              width: 22 },
			{ header: "User Email",             key: "user_email",             width: 28 },
			{ header: "User Name",              key: "user_name",              width: 20 },
			{ header: "Workspace",              key: "workspace",              width: 20 },
			{ header: "Generator",              key: "generator",              width: 16 },
			{ header: "AI Provider",            key: "ai_provider",            width: 14 },
			{ header: "Model",                  key: "model",                  width: 30 },
			{ header: "Brand",                  key: "brand",                  width: 20 },
			{ header: "Product",                key: "product",                width: 20 },
			{ header: "Platform",               key: "platform",               width: 14 },
			{ header: "Content Type",           key: "content_type",           width: 18 },
			{ header: "System Prompt",          key: "system_prompt",          width: 60 },
			{ header: "User Prompt",            key: "user_prompt",            width: 60 },
			{ header: "Response",               key: "response_text",          width: 60 },
			{ header: "Input Tokens",           key: "input_tokens",           width: 14 },
			{ header: "Output Tokens",          key: "output_tokens",          width: 14 },
			{ header: "Total Tokens",           key: "total_tokens",           width: 14 },
			{ header: "Cost (USD)",             key: "estimated_cost_usd",     width: 12 },
			{ header: "Duration (ms)",          key: "duration_ms",            width: 14 },
			{ header: "Status",                 key: "status",                 width: 10 },
			{ header: "Error",                  key: "error_message",          width: 40 },
			{ header: "Log ID",                 key: "log_id",                 width: 38 },
			{ header: "Generation Request ID",  key: "generation_request_id",  width: 38 },
		];
		styleHeaderRow(sheet);
		for (const row of rows) sheet.addRow(row);
	}

	// ─── Sheet 2: By User ──────────────────────────────────────────────────

	private async queryByUser(workspaceId: string, dateFrom: string, dateTo: string) {
		return this.prisma.$queryRawUnsafe(
			`SELECT
				u.email           AS "user_email",
				u.full_name       AS "user_name",
				w.name            AS "workspace",
				COUNT(*)          AS "total_calls",
				SUM(COALESCE(apl.input_tokens,0))                                        AS "total_input_tokens",
				SUM(COALESCE(apl.output_tokens,0))                                       AS "total_output_tokens",
				SUM(COALESCE(apl.input_tokens,0)+COALESCE(apl.output_tokens,0))          AS "total_tokens",
				SUM(COALESCE(apl.estimated_cost,0))                                      AS "total_cost_usd",
				MIN(apl.created_at) AS "first_call",
				MAX(apl.created_at) AS "last_call"
			FROM ai_provider_logs apl
			LEFT JOIN workspaces w ON w.id = apl.workspace_id
			LEFT JOIN users      u ON u.id = apl.user_id
			WHERE apl.workspace_id = $1
			  AND apl.created_at >= $2::timestamptz
			  AND apl.created_at <  $3::timestamptz + INTERVAL '1 day'
			GROUP BY u.email, u.full_name, w.name
			ORDER BY total_tokens DESC`,
			workspaceId, dateFrom, dateTo,
		);
	}

	private buildByUserSheet(workbook: ExcelJS.Workbook, rows: Record<string, unknown>[]) {
		const sheet = workbook.addWorksheet("By User");
		sheet.columns = [
			{ header: "User Email",          key: "user_email",           width: 28 },
			{ header: "User Name",           key: "user_name",            width: 20 },
			{ header: "Workspace",           key: "workspace",            width: 20 },
			{ header: "Total Calls",         key: "total_calls",          width: 14 },
			{ header: "Input Tokens",        key: "total_input_tokens",   width: 16 },
			{ header: "Output Tokens",       key: "total_output_tokens",  width: 16 },
			{ header: "Total Tokens",        key: "total_tokens",         width: 16 },
			{ header: "Total Cost (USD)",    key: "total_cost_usd",       width: 16 },
			{ header: "First Call",          key: "first_call",           width: 22 },
			{ header: "Last Call",           key: "last_call",            width: 22 },
		];
		styleHeaderRow(sheet);
		for (const row of rows) sheet.addRow(bigIntToNumber(row));
	}

	// ─── Sheet 3: Daily Usage ──────────────────────────────────────────────

	private async queryByDay(workspaceId: string, dateFrom: string, dateTo: string) {
		return this.prisma.$queryRawUnsafe(
			`SELECT
				DATE(apl.created_at) AS "day",
				w.name               AS "workspace",
				apl.generator,
				COUNT(*)             AS "calls",
				SUM(COALESCE(apl.input_tokens,0))                               AS "input_tokens",
				SUM(COALESCE(apl.output_tokens,0))                              AS "output_tokens",
				SUM(COALESCE(apl.input_tokens,0)+COALESCE(apl.output_tokens,0)) AS "total_tokens",
				SUM(COALESCE(apl.estimated_cost,0))                             AS "total_cost_usd"
			FROM ai_provider_logs apl
			LEFT JOIN workspaces w ON w.id = apl.workspace_id
			WHERE apl.workspace_id = $1
			  AND apl.created_at >= $2::timestamptz
			  AND apl.created_at <  $3::timestamptz + INTERVAL '1 day'
			GROUP BY DATE(apl.created_at), w.name, apl.generator
			ORDER BY day DESC, total_tokens DESC`,
			workspaceId, dateFrom, dateTo,
		);
	}

	private buildByDaySheet(workbook: ExcelJS.Workbook, rows: Record<string, unknown>[]) {
		const sheet = workbook.addWorksheet("Daily Usage");
		sheet.columns = [
			{ header: "Day",             key: "day",            width: 14 },
			{ header: "Workspace",       key: "workspace",      width: 20 },
			{ header: "Generator",       key: "generator",      width: 16 },
			{ header: "Calls",           key: "calls",          width: 10 },
			{ header: "Input Tokens",    key: "input_tokens",   width: 14 },
			{ header: "Output Tokens",   key: "output_tokens",  width: 14 },
			{ header: "Total Tokens",    key: "total_tokens",   width: 14 },
			{ header: "Cost (USD)",      key: "total_cost_usd", width: 14 },
		];
		styleHeaderRow(sheet);
		for (const row of rows) sheet.addRow(bigIntToNumber(row));
	}

	// ─── Sheet 4: By Model ─────────────────────────────────────────────────

	private async queryByModel(workspaceId: string, dateFrom: string, dateTo: string) {
		return this.prisma.$queryRawUnsafe(
			`SELECT
				apl.provider         AS "provider",
				apl.model,
				apl.generator,
				COUNT(*)             AS "calls",
				SUM(COALESCE(apl.input_tokens,0))  AS "input_tokens",
				SUM(COALESCE(apl.output_tokens,0)) AS "output_tokens",
				SUM(COALESCE(apl.estimated_cost,0)) AS "total_cost_usd",
				ROUND(AVG(apl.duration_ms))         AS "avg_duration_ms"
			FROM ai_provider_logs apl
			WHERE apl.workspace_id = $1
			  AND apl.created_at >= $2::timestamptz
			  AND apl.created_at <  $3::timestamptz + INTERVAL '1 day'
			GROUP BY apl.provider, apl.model, apl.generator
			ORDER BY total_cost_usd DESC NULLS LAST`,
			workspaceId, dateFrom, dateTo,
		);
	}

	private buildByModelSheet(workbook: ExcelJS.Workbook, rows: Record<string, unknown>[]) {
		const sheet = workbook.addWorksheet("By Model");
		sheet.columns = [
			{ header: "Provider",         key: "provider",       width: 14 },
			{ header: "Model",            key: "model",          width: 36 },
			{ header: "Generator",        key: "generator",      width: 16 },
			{ header: "Calls",            key: "calls",          width: 10 },
			{ header: "Input Tokens",     key: "input_tokens",   width: 14 },
			{ header: "Output Tokens",    key: "output_tokens",  width: 14 },
			{ header: "Total Cost (USD)", key: "total_cost_usd", width: 16 },
			{ header: "Avg Duration (ms)",key: "avg_duration_ms",width: 18 },
		];
		styleHeaderRow(sheet);
		for (const row of rows) sheet.addRow(bigIntToNumber(row));
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
	const headerRow = sheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.fill = {
		type: "pattern",
		pattern: "solid",
		fgColor: { argb: "FFE8EAED" },
	};
	headerRow.commit();
}

// Prisma $queryRawUnsafe returns COUNT(*) as BigInt — Excel can't serialise it.
function bigIntToNumber(row: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(row)) {
		out[k] = typeof v === "bigint" ? Number(v) : v;
	}
	return out;
}
```

- [ ] **Step 2: Type-check**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "token-usage-export"
```

Expected: no output (no errors in this file).

- [ ] **Step 3: Commit**

```bash
git add backend/src/jobs/token-usage-export.job.ts
git commit -m "feat: add TokenUsageExportJob (ExcelJS + MinIO + SSE)"
```

---

## Task 3: Add POST /export route to ai-log.route.ts

**Files:**
- Modify: `backend/src/routes/ai-log.route.ts`

- [ ] **Step 1: Read the current file to find where to add the route**

Read `backend/src/routes/ai-log.route.ts` and note:
- The function signature: `export function createAiLogRoutes(prisma: PrismaClient)`
- Where the function returns `app`

- [ ] **Step 2: Update the route factory signature to accept boss and return the export endpoint**

The current signature is:

```ts
export function createAiLogRoutes(prisma: PrismaClient) {
```

Change to:

```ts
import type PgBoss from "pg-boss";

export function createAiLogRoutes(prisma: PrismaClient, boss: PgBoss) {
```

Add the import at the top of the file (after existing imports):

```ts
import type PgBoss from "pg-boss";
```

- [ ] **Step 3: Add the POST /export endpoint**

Just before the final `return app;` line, add:

```ts
	// POST /export — enqueue an async Excel export job for the date range.
	// Returns immediately with { jobId }; the job notifies via SSE when done.
	app.post("/export", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = (await c.req.json()) as { dateFrom?: unknown; dateTo?: unknown };

		const dateFrom = typeof body.dateFrom === "string" ? body.dateFrom.trim() : "";
		const dateTo   = typeof body.dateTo   === "string" ? body.dateTo.trim()   : "";

		// Validate ISO date strings (YYYY-MM-DD)
		const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
		if (!ISO_DATE.test(dateFrom) || !ISO_DATE.test(dateTo)) {
			return c.json({ error: "dateFrom and dateTo must be YYYY-MM-DD" }, 400);
		}
		if (dateFrom > dateTo) {
			return c.json({ error: "dateFrom must be on or before dateTo" }, 400);
		}

		const jobId = await boss.send("token-usage-export", {
			workspaceId,
			userId,
			dateFrom,
			dateTo,
			jobId: crypto.randomUUID(),
		});

		return c.json({ data: { jobId } }, 202);
	});
```

- [ ] **Step 4: Type-check**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "ai-log.route"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/ai-log.route.ts
git commit -m "feat: add POST /ai-logs/export route to enqueue token usage export job"
```

---

## Task 4: Wire job into index.ts

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Add the import**

Find the block of job imports (near `import { ArchiveSweepJob }`). Add:

```ts
import { TokenUsageExportJob } from "./jobs/token-usage-export.job";
```

- [ ] **Step 2: Update createAiLogRoutes call to pass boss**

Find the line:

```ts
workspaceScoped.route("/ai-logs", createAiLogRoutes(prisma));
```

Change to:

```ts
workspaceScoped.route("/ai-logs", createAiLogRoutes(prisma, boss));
```

- [ ] **Step 3: Instantiate the job**

Find where `archiveSweepJob` is instantiated. Right after that block, add:

```ts
	const tokenUsageExportJob = new TokenUsageExportJob(
		prisma,
		storageProvider,
		env.minioBucket,
		notificationService,
		logger,
	);
```

- [ ] **Step 4: Create the queue**

Find the `boss.createQueue` block (near `await boss.createQueue("archive-sweep")`). Add:

```ts
	await boss.createQueue("token-usage-export");
```

- [ ] **Step 5: Register the worker**

Find the `archive-sweep` worker block. After it, add:

```ts
	await boss.work(
		"token-usage-export",
		{ localConcurrency: 1, pollingIntervalSeconds: 5 },
		async (jobs) => {
			for (const job of jobs) await tokenUsageExportJob.handle(job.data as any);
		},
	);
```

- [ ] **Step 6: Type-check**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "index.ts"
```

Expected: no output for index.ts.

- [ ] **Step 7: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: register token-usage-export pg-boss queue and worker"
```

---

## Task 5: Add SSE event types to useSSE.ts

**Files:**
- Modify: `frontend/src/hooks/useSSE.ts`

- [ ] **Step 1: Add export events to EVENT_TYPES**

Find the `EVENT_TYPES` array. It ends with:

```ts
  "competitor_pipeline_failed",
] as const;
```

Change to:

```ts
  "competitor_pipeline_failed",
  // Token usage Excel export
  "export_ready",
  "export_failed",
] as const;
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run typecheck 2>&1 | grep "useSSE"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSSE.ts
git commit -m "feat: add export_ready and export_failed SSE event types"
```

---

## Task 6: Add export UI to TokenUsageSection.tsx

**Files:**
- Modify: `frontend/src/components/token-usage/TokenUsageSection.tsx`

- [ ] **Step 1: Add export state variables**

Find the existing state declarations block (near `const [summary, setSummary] = ...`). Add after the existing state:

```ts
  // Export state
  const [exportDateFrom, setExportDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  });
  const [exportDateTo, setExportDateTo] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  type ExportState = "idle" | "generating" | "ready" | "error";
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportFilename, setExportFilename] = useState<string | null>(null);
```

- [ ] **Step 2: Wire up SSE handler for export events**

Find the existing `useSSE` call in the component. It will look like:

```ts
  useSSE((event) => {
    // ... existing handlers
  });
```

Add export event handling inside the existing callback (before the closing `}`):

```ts
    if (event.type === "export_ready" && event.data.workspaceId === workspaceId) {
      setExportState("ready");
      setExportUrl(event.data.url as string);
      setExportFilename(event.data.filename as string);
    }
    if (event.type === "export_failed" && event.data.workspaceId === workspaceId) {
      setExportState("error");
      setTimeout(() => setExportState("idle"), 4000);
    }
```

- [ ] **Step 3: Add the handleExport function**

After the existing handler functions (near `loadGenerations` or similar), add:

```ts
  const handleExport = async () => {
    if (!workspaceId || exportState === "generating") return;
    setExportState("generating");
    setExportUrl(null);
    setExportFilename(null);
    try {
      await api(`/api/workspaces/${workspaceId}/ai-logs/export`, {
        method: "POST",
        body: JSON.stringify({ dateFrom: exportDateFrom, dateTo: exportDateTo }),
      });
    } catch {
      setExportState("error");
      setTimeout(() => setExportState("idle"), 4000);
    }
  };
```

- [ ] **Step 4: Add the export UI panel**

The component renders a heading row at the top. Find the heading block:

```tsx
      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
```

Add the export panel **after** the heading block's closing `</div>` and **before** the `{/* OpenRouter credit balance */}` line (or the `{/* Stat cards */}` line if no credit balance section). Insert:

```tsx
      {/* Export panel — workspace scope only */}
      {scope === "workspace" && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
              Date range
            </label>
            <input
              type="date"
              value={exportDateFrom}
              max={exportDateTo}
              onChange={(e) => setExportDateFrom(e.target.value)}
              className="text-xs px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={exportDateTo}
              min={exportDateFrom}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setExportDateTo(e.target.value)}
              className="text-xs px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
            />
          </div>

          {exportState === "idle" && (
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              Export to Excel
            </button>
          )}

          {exportState === "generating" && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md">
              <svg className="animate-spin w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating export…
            </div>
          )}

          {exportState === "ready" && exportUrl && (
            <a
              href={exportUrl}
              download={exportFilename ?? "token-usage.xlsx"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Excel
            </a>
          )}

          {exportState === "error" && (
            <span className="text-xs text-red-500 px-2 py-1.5">
              Export failed — please try again
            </span>
          )}
        </div>
      )}
```

- [ ] **Step 5: Type-check + build**

```bash
cd frontend && npm run typecheck 2>&1 | grep -i "error" | head -10
```

Expected: no errors. If you see "api is not defined" or similar, ensure `api` is imported from `../../services/api` (it already is in the existing file).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/token-usage/TokenUsageSection.tsx
git commit -m "feat: add Excel export UI to Token Usage tab (date range + async download)"
```

---

## Task 7: Final verification + push

- [ ] **Step 1: Run backend tests**

```bash
cd backend && bun test
```

Expected: no new failures (the export job has no unit tests — it depends on Prisma + MinIO + ExcelJS, all integration concerns).

- [ ] **Step 2: Run frontend build**

```bash
cd frontend && npm run build 2>&1 | grep -i "error"
```

Expected: no errors.

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Done

The feature is complete when:
- Visiting Workspace Settings → Token Usage shows a date range picker and "Export to Excel" button above the stat cards
- Clicking Export shows a spinner
- After a short wait (job processes), the spinner becomes a green "Download Excel" button
- Clicking Download opens the `.xlsx` file — 4 sheets: Detail Log, By User, Daily Usage, By Model
- If the tab is closed before the SSE arrives, clicking Export again triggers a new job
