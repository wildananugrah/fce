# Cancel + Leave-Page Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a leave-page prompt during AI flows and Cancel buttons that abort sync auto-fills via `AbortController` and mark async generations cancelled at the next worker checkpoint.

**Architecture:** A reusable `useUnsavedAsync` React hook wires up `beforeunload` + react-router's `useBlocker`. Sync flows (brand/product auto-fill) thread an `AbortController.signal` into the `api()` wrapper. Async flows (topic/content generation) get a new `POST /generations/:id/cancel` route plus checkpoint guards in the two pg-boss workers.

**Tech Stack:** Bun, Hono, Prisma 7, pg-boss, React 19, React Router v7, `bun:test`.

**Spec:** [docs/superpowers/specs/2026-04-30-cancel-and-leave-warning-design.md](../specs/2026-04-30-cancel-and-leave-warning-design.md)

---

## Task 1: Add the `useUnsavedAsync` React hook

**Files:**
- Create: `frontend/src/hooks/useUnsavedAsync.ts`

- [ ] **Step 1: Create the hook**

`frontend/src/hooks/useUnsavedAsync.ts`:

```ts
import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

/**
 * While `active` is true, intercepts page-leave attempts and asks the
 * user to confirm. Two channels:
 *   1. window.beforeunload — tab close / refresh / address-bar nav.
 *      Modern browsers show a generic "Leave site?" prompt; the message
 *      we set is honored only by older browsers but the prompt itself
 *      always appears.
 *   2. react-router useBlocker — in-app navigation (sidebar click,
 *      back button, etc.). We control the prompt entirely; show a
 *      window.confirm with the supplied message.
 */
export function useUnsavedAsync(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active, message]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(message)) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, message]);
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent (no errors). If `useBlocker` import fails, the project's `react-router-dom` version may need to be checked — but v7 ships it; should work.

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/hooks/useUnsavedAsync.ts
git commit -m "feat(ui): add useUnsavedAsync hook for in-flight async leave prompts"
```

---

## Task 2: Backend cancel route on `/generations/:id/cancel`

**Files:**
- Modify: `backend/src/routes/generation.route.ts`

The generation route is mounted at `/api/workspaces/:wid/generations`. The cancel endpoint becomes `POST /api/workspaces/:wid/generations/:id/cancel`.

Best-effort: flips status from `"pending"` to `"cancelled"`. Workers check this between phases (Task 3 wires the checks).

- [ ] **Step 1: Add the cancel handler**

In `backend/src/routes/generation.route.ts`, the route factory currently doesn't take `prisma` — it gets data through `generationService`. We need direct DB access for a focused status flip; the cleanest path is to extend `IGenerationService` with a `cancel(workspaceId, requestId): Promise<void>` method instead of injecting prisma into the route. But to keep the patch tight, add `prisma` as a second factory arg (matching the pattern already used by `createTrashRoutes` and `createProjectRoutes`).

Update the factory signature and add the handler. Replace the file contents with:

```ts
import type { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import type { IGenerationService } from "../interfaces/services/generation.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createGenerationRoutes(
	generationService: IGenerationService,
	prisma: PrismaClient,
) {
	const app = new Hono<{ Variables: Variables }>();

	// POST / — create generation request (enqueues job)
	app.post("/", async (c) => {
		const workspaceId = c.get("workspaceId" as any);
		const userId = c.get("userId" as any);
		const body = await c.req.json();

		const request = await generationService.create(workspaceId, userId, {
			brandId: body.brandId,
			productId: body.productId,
			productIds: body.productIds,
			contentTopicId: body.contentTopicId,
			platform: body.platform,
			contentType: body.contentType,
			framework: body.framework,
			hookType: body.hookType,
			prompt: body.prompt,
			objective: body.objective,
			tonePreset: body.tonePreset,
			visualStyle: body.visualStyle,
			outputLength: body.outputLength,
			referenceImages: body.referenceImages,
			researchContext: body.researchContext,
			pillars: body.pillars,
		});

		return c.json({ data: request }, 201);
	});

	// POST /:id/cancel — best-effort cancellation. Flips status to
	// "cancelled" if currently "pending"; workers check this between
	// phases (the in-flight AI call still completes and is billed).
	app.post("/:id/cancel", async (c) => {
		const workspaceId = c.get("workspaceId");
		const id = c.req.param("id");
		const before = await prisma.generationRequest.findUnique({
			where: { id },
			select: { workspaceId: true, status: true },
		});
		if (!before || before.workspaceId !== workspaceId) {
			return c.json({ error: "Request not found" }, 404);
		}
		if (before.status !== "pending") {
			return c.json(
				{ error: `Cannot cancel — current status is "${before.status}"` },
				400,
			);
		}
		await prisma.generationRequest.update({
			where: { id },
			data: { status: "cancelled" },
		});
		return c.json({ data: { ok: true } });
	});

	// DELETE /bulk — bulk delete generation requests (cascades to outputs, sections)
	app.delete("/bulk", async (c) => {
		const workspaceId = c.get("workspaceId");
		const { ids } = await c.req.json<{ ids: string[] }>();
		if (!Array.isArray(ids) || ids.length === 0) {
			return c.json({ error: "ids must be a non-empty array" }, 400);
		}
		const deleted = await generationService.deleteMany(workspaceId, ids);
		return c.json({ deleted });
	});

	// GET / — list generation requests
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const requests = await generationService.list(workspaceId);
		return c.json({ data: requests });
	});

	// GET /:id — get request with outputs
	app.get("/:id", async (c) => {
		const request = await generationService.getById(c.req.param("id"));
		return c.json({ data: request });
	});

	return app;
}
```

- [ ] **Step 2: Update the composition root**

In `backend/src/index.ts`, find the existing call:

```ts
workspaceScoped.route("/generations", createGenerationRoutes(generationService));
```

Change to:

```ts
workspaceScoped.route("/generations", createGenerationRoutes(generationService, prisma));
```

`prisma` is already in scope at that point.

- [ ] **Step 3: Type-check + run tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep -E "(generation\.route|index\.ts)" || echo "NO_ERRORS"
bun test 2>&1 | tail -5
```

Expected: `NO_ERRORS` and the same baseline pass count (~219 pass / 1 pre-existing fail).

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/generation.route.ts backend/src/index.ts
git commit -m "feat(generation): add cancel route on /generations/:id/cancel"
```

---

## Task 3: Worker checkpoint guards in topic + content jobs

**Files:**
- Modify: `backend/src/jobs/topic-generation.job.ts`
- Modify: `backend/src/jobs/content-generation.job.ts`

Both jobs already have a multi-phase `handle()` shape (resolve providers → call AI → parse → save → notify). Add a tiny helper near the top of each file (or a shared util — see step 1) and call it at every checkpoint.

- [ ] **Step 1: Create a shared helper**

`backend/src/utils/generation-cancellation.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

/**
 * True iff the given GenerationRequest's status is currently "cancelled".
 * Workers call this between phases so a user-clicked Cancel halts further
 * work without stopping the in-flight AI call (which can't be aborted).
 */
export async function isGenerationCancelled(
	prisma: PrismaClient,
	requestId: string,
): Promise<boolean> {
	const row = await prisma.generationRequest.findUnique({
		where: { id: requestId },
		select: { status: true },
	});
	return row?.status === "cancelled";
}
```

- [ ] **Step 2: Wire the guard into `topic-generation.job.ts`**

Open `backend/src/jobs/topic-generation.job.ts`. At the top, add:

```ts
import { isGenerationCancelled } from "../utils/generation-cancellation";
```

Inside the `handle(...)` method, find each `await` checkpoint and insert a cancel-check that returns cleanly (NOT throws — pg-boss retries on throw):

```ts
if (await isGenerationCancelled(this.prisma, requestId)) {
    this.logger.info("topic-generation: cancelled by user", { requestId });
    return;
}
```

The exact `requestId` variable name in the existing job code may differ — adapt to whatever it's called. Insert checks at three points:
- **Right after job pickup** (first `await` in `handle()`), before any expensive work.
- **Immediately before** the AI provider call (`await this.aiProvider.generateTopics(...)` or similar).
- **Immediately after** the AI provider call returns, before any DB write or notification.

If you only see two natural checkpoints (e.g. the job is short), two is fine — don't manufacture phases.

- [ ] **Step 3: Wire the guard into `content-generation.job.ts`**

Same pattern in `backend/src/jobs/content-generation.job.ts`. The content job is multi-phase (variant generation, image generation, etc.) — insert checks before EACH provider call, not just the first one. A user who cancels mid-content-generation should at least see the second variant skipped.

- [ ] **Step 4: Type-check + tests**

```bash
cd backend && set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep -E "(topic-generation|content-generation|generation-cancellation)" || echo "NO_ERRORS"
bun test 2>&1 | tail -5
```

Expected: `NO_ERRORS` and baseline test count.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/utils/generation-cancellation.ts \
        backend/src/jobs/topic-generation.job.ts \
        backend/src/jobs/content-generation.job.ts
git commit -m "feat(generation): worker checkpoint guards for cancelled requests"
```

---

## Task 4: BrandBrainForm — leave-warning + cancel auto-fill

**Files:**
- Modify: `frontend/src/components/brands/BrandBrainForm.tsx`

The form has a `scraping` state (around line 341) that's true while the auto-fill `fetch` is in flight, and a `setScraping(true/false)` toggle bracketing the actual `api()` call (around line 448).

- [ ] **Step 1: Read the surrounding code to confirm exact line numbers**

```bash
sed -n '420,475p' /Users/bellinnn/Documents/projects/fce/frontend/src/components/brands/BrandBrainForm.tsx
```

You'll see the auto-fill handler. Note where `setScraping(true)` is called, where the `api()` POST happens, and where `setScraping(false)` is in the finally block.

- [ ] **Step 2: Add the import + abort ref + leave-warning**

Top of `BrandBrainForm.tsx`, alongside other React imports:

```tsx
import { useUnsavedAsync } from "../../hooks/useUnsavedAsync";
```

Inside the component body (near the existing `useState` hooks), add:

```tsx
const abortRef = useRef<AbortController | null>(null);

useUnsavedAsync(
  scraping,
  "AI is auto-filling your brand brain — leave anyway? Your progress will be lost.",
);
```

`useRef` import: add `import { useRef } from "react";` if not already present (the file likely already imports `useState` and `useEffect` — check and extend).

- [ ] **Step 3: Wire AbortController into the auto-fill fetch**

Inside the auto-fill handler — replace the existing `api()` call (around line 448) with one that creates a controller, stores it in `abortRef`, passes the signal, and clears the ref in finally:

```tsx
const controller = new AbortController();
abortRef.current = controller;
try {
  const result = await api<{
    // existing inline type stays as it was
  }>(`/api/workspaces/${workspaceId}/brands/scrape-preview`, {
    method: "POST",
    body: JSON.stringify({ url: form.websiteUrl.trim(), language: scrapeLanguage }),
    signal: controller.signal,
  });
  // ... existing result handling stays exactly as it was ...
} catch (e) {
  if (e instanceof DOMException && e.name === "AbortError") return; // user cancelled
  setError(e instanceof Error ? e.message : "Auto-fill failed");
} finally {
  abortRef.current = null;
  if (!cancelled) setScraping(false);  // existing line 473 — keep
}
```

The `if (!cancelled)` line is the existing component-unmount guard; preserve it. The new `if (e instanceof DOMException...)` line short-circuits before `setError` runs — silent abort is the intended UX.

- [ ] **Step 4: Add the Cancel button next to the spinner**

Find the auto-fill button area. There's a `loading={scraping}` button somewhere (around line 637). Next to it, render a Cancel button only while scraping:

```tsx
{scraping && (
  <Button
    variant="secondary"
    size="sm"
    onClick={() => abortRef.current?.abort()}
  >
    Cancel
  </Button>
)}
```

If `Button` isn't imported in this file (check imports), add `import { Button } from "../ui/Button";`.

- [ ] **Step 5: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/brands/BrandBrainForm.tsx
git commit -m "feat(ui): leave-warning + cancel for brand brain auto-fill"
```

---

## Task 5: ProductForm — leave-warning + cancel for both AI endpoints

**Files:**
- Modify: `frontend/src/components/products/ProductForm.tsx`

Two AI calls in this form: scrape-preview (line 88) and generate-brain (line 163). Both are toggled via `generating` (line 69). A single `useUnsavedAsync` hook covers both, and a single `AbortController` ref is reused across whichever fetch is active at a time.

- [ ] **Step 1: Add the import + abort ref + leave-warning**

Top of `ProductForm.tsx`:

```tsx
import { useUnsavedAsync } from "../../hooks/useUnsavedAsync";
```

(Add `useRef` to existing React imports if missing.)

Inside the component body:

```tsx
const abortRef = useRef<AbortController | null>(null);

useUnsavedAsync(
  generating,
  "AI is generating product details — leave anyway? Your progress will be lost.",
);
```

- [ ] **Step 2: Wire AbortController into BOTH AI fetches**

The scrape-preview call (around line 88):

```tsx
const controller = new AbortController();
abortRef.current = controller;
try {
  const result = await api<{ /* existing type */ }>(
    `/api/workspaces/${workspaceId}/products/scrape-preview`,
    {
      method: "POST",
      body: JSON.stringify({ url: productUrl.trim(), brandId }),
      signal: controller.signal,
    },
  );
  // ... existing result handling unchanged ...
} catch (e) {
  if (e instanceof DOMException && e.name === "AbortError") return;
  setError(e instanceof Error ? e.message : "Auto-fill failed");
} finally {
  abortRef.current = null;
  setGenerating(false);  // keep whatever the existing code did
}
```

The generate-brain call (around line 163):

```tsx
const controller = new AbortController();
abortRef.current = controller;
try {
  const result = await api<{ /* existing type */ }>(
    `/api/workspaces/${workspaceId}/products/generate-brain`,
    {
      method: "POST",
      body: JSON.stringify({ /* existing body */ }),
      signal: controller.signal,
    },
  );
  // ... existing result handling ...
} catch (e) {
  if (e instanceof DOMException && e.name === "AbortError") return;
  setError(e instanceof Error ? e.message : "AI generation failed");
} finally {
  abortRef.current = null;
  setGenerating(false);
}
```

- [ ] **Step 3: Add the Cancel button**

The form already has a "Generate with AI" button (around line 449). Render a Cancel button next to it while generating:

```tsx
{generating && (
  <Button
    variant="secondary"
    size="sm"
    onClick={() => abortRef.current?.abort()}
  >
    Cancel
  </Button>
)}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/products/ProductForm.tsx
git commit -m "feat(ui): leave-warning + cancel for product brain auto-fill"
```

---

## Task 6: TopicsPage — leave-warning + cancel for async topic generation

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx`

This is async. After the user submits, the backend creates a `GenerationRequest` and returns its `id`. The frontend gets that id in the response. While `generating` is true (until the SSE notification or cancel), show the Cancel button. Cancel POSTs to the new `/cancel` endpoint.

- [ ] **Step 1: Read the submit handler to know variable names**

```bash
sed -n '275,315p' /Users/bellinnn/Documents/projects/fce/frontend/src/pages/TopicsPage.tsx
```

The submit code lives around lines 280–311. Note where `setGenerating(true)` and `setGenerating(false)` are, and where the response from `api()` lands (the response includes `data.id` — that's the requestId).

- [ ] **Step 2: Add the import, ref for the in-flight requestId, and leave-warning**

Top of the file:

```tsx
import { useUnsavedAsync } from "../hooks/useUnsavedAsync";
```

Inside the component:

```tsx
const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

useUnsavedAsync(
  generating,
  "AI is generating topics — leave anyway? You can come back, but you'll lose the option to cancel.",
);
```

- [ ] **Step 3: Capture the requestId after submit**

Inside the submit handler, after the existing `api()` POST that creates the generation request — capture the returned id:

```tsx
const response = await api<{ data: { id: string } }>(
  `/api/workspaces/${workspaceId}/generations`,
  {
    method: "POST",
    body: JSON.stringify({ /* existing body */ }),
  },
);
setPendingRequestId(response.data.id);
```

The exact response shape may already be unwrapped by the existing code (e.g. `api<{ id: string }>` returning the id directly without the `data` wrapper). Adapt — what matters is storing the id in `pendingRequestId`.

When the SSE "complete" notification arrives (or the user cancels), reset `setPendingRequestId(null)` alongside `setGenerating(false)`. Find the existing point where `setGenerating(false)` is called on success and also call `setPendingRequestId(null)`.

- [ ] **Step 4: Add the Cancel button**

Near the Generate button (or wherever the "Generating…" spinner lives), render:

```tsx
{generating && pendingRequestId && (
  <Button
    variant="secondary"
    size="sm"
    onClick={async () => {
      try {
        await api(`/api/workspaces/${workspaceId}/generations/${pendingRequestId}/cancel`, {
          method: "POST",
        });
        setGenerating(false);
        setPendingRequestId(null);
      } catch (e) {
        // Already-completed race: the user clicked Cancel after the worker
        // finished. Show a toast and clear the spinner anyway.
        showToast(
          e instanceof Error ? e.message : "Could not cancel",
          "info",
        );
        setGenerating(false);
        setPendingRequestId(null);
      }
    }}
    title="Cancel stops the next step. The current AI call will finish and may incur usage cost."
  >
    Cancel
  </Button>
)}
```

The exact toast call (`showToast`, `setToast`, etc.) follows whatever pattern this page already uses for error messages. If no toast helper is available, fall back to setting an existing error state.

- [ ] **Step 5: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/TopicsPage.tsx
git commit -m "feat(ui): leave-warning + cancel for async topic generation"
```

---

## Task 7: GeneratePage (content generation) — leave-warning + cancel

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx`

Same pattern as Task 6, applied to the content generation flow. The page has its own `generating` state (or equivalently named) and a submit handler that POSTs to `/generations`.

- [ ] **Step 1: Locate the submit handler**

```bash
grep -n "setGenerating\|generating\|/generations" /Users/bellinnn/Documents/projects/fce/frontend/src/pages/GeneratePage.tsx | head -15
```

Note the variable name for the in-flight flag (likely `generating`) and where the POST happens.

- [ ] **Step 2: Apply the same pattern as Task 6**

Add:

```tsx
import { useUnsavedAsync } from "../hooks/useUnsavedAsync";
```

Inside the component:

```tsx
const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

useUnsavedAsync(
  generating,
  "AI is generating content — leave anyway? You can come back, but you'll lose the option to cancel.",
);
```

After the submit POST resolves, capture the returned request id into `pendingRequestId`. When the flow ends (success notification, error, or cancel), clear it.

Render the Cancel button next to the spinner using the same handler shape as Task 6:

```tsx
{generating && pendingRequestId && (
  <Button
    variant="secondary"
    size="sm"
    onClick={async () => {
      try {
        await api(`/api/workspaces/${workspaceId}/generations/${pendingRequestId}/cancel`, {
          method: "POST",
        });
        setGenerating(false);
        setPendingRequestId(null);
      } catch (e) {
        showToast(
          e instanceof Error ? e.message : "Could not cancel",
          "info",
        );
        setGenerating(false);
        setPendingRequestId(null);
      }
    }}
    title="Cancel stops the next step. The current AI call will finish and may incur usage cost."
  >
    Cancel
  </Button>
)}
```

(Adapt the toast helper to whatever the page already uses.)

- [ ] **Step 3: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/GeneratePage.tsx
git commit -m "feat(ui): leave-warning + cancel for async content generation"
```

---

## Task 8: Manual smoke test

**Files:**
- No file changes.

- [ ] **Step 1: Restart the backend**

```bash
kill $(pgrep -f "bun.*src/index" 2>/dev/null) 2>/dev/null
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bun run --hot src/index.ts &
```

Frontend `--hot` reload should pick up the changes automatically; if you're running production-built static files, restart whatever serves them.

- [ ] **Step 2: Smoke — brand auto-fill**

1. Brands page → New Brand → enter a website URL → click Auto-fill.
2. **Expected:** spinner appears, Cancel button appears next to it.
3. Click Cancel mid-fetch. **Expected:** spinner clears, form is editable, no error toast.
4. Start auto-fill again. While the spinner is up, click a sidebar nav link.
5. **Expected:** confirm prompt appears asking if you want to leave. Click Cancel on the prompt → still on the form.
6. Click the nav again → confirm Yes → navigates away.
7. Start auto-fill again. While the spinner is up, refresh the browser tab.
8. **Expected:** browser shows the native "Leave site?" prompt.

- [ ] **Step 3: Smoke — product auto-fill (both AI endpoints)**

Same flow as Step 2 but on the New Product modal:
- Test the URL auto-fill (scrape-preview).
- Test "Generate with AI" (generate-brain).
- Both should show Cancel + leave warning.

- [ ] **Step 4: Smoke — async topic generation**

1. Topic Library → fill in the generate form → submit.
2. **Expected:** spinner appears with a Cancel button.
3. Click Cancel.
4. **Expected:** spinner clears. DB check:
   ```bash
   docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c \
     "SELECT id, status FROM generation_requests ORDER BY created_at DESC LIMIT 1;"
   ```
   The most recent row's status should be `cancelled`.
5. Backend logs should show `topic-generation: cancelled by user` (info level) for that request id, and no `GenerationOutput` rows should be written for it.
6. Verify `SELECT COUNT(*) FROM generation_outputs WHERE request_id = '<that-id>'` returns 0.

- [ ] **Step 5: Smoke — async content generation**

Same flow on the Generate page:
- Submit → spinner + Cancel button → click Cancel → status flips to `cancelled`.
- Verify no outputs for that request id.

- [ ] **Step 6: Race smoke (already-completed) — optional**

1. Submit a content generation but don't cancel. Wait for completion.
2. Open browser devtools → manually fire a `fetch("/api/workspaces/.../generations/<id>/cancel", { method: "POST" })` after completion.
3. **Expected:** 400 with `{ error: "Cannot cancel — current status is \"completed\"" }`. The page is unaffected.

- [ ] **Step 7: No commit (verification only)**

If anything fails, return to the relevant task and fix.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| `useUnsavedAsync` hook | Task 1 |
| Backend cancel route | Task 2 |
| Worker checkpoint guards | Task 3 |
| BrandBrainForm: warning + cancel | Task 4 |
| ProductForm: warning + cancel (both endpoints) | Task 5 |
| TopicsPage: warning + cancel async | Task 6 |
| GeneratePage: warning + cancel async | Task 7 |
| Best-effort caveat in tooltip | Tasks 6 + 7 (Cancel button `title` prop) |
| Already-completed race returns 400 | Task 2 (handler check) + Task 8 Step 6 (smoke) |
| Schema: `cancelled` as new status value | Task 2 (writes the value; no migration since column is free-form String) |

All spec sections covered.

**Type / name consistency:**
- `useUnsavedAsync(active, message)` signature consistent across all four call sites.
- The backend cancel route URL `/api/workspaces/:wid/generations/:id/cancel` is referenced identically in Tasks 6 and 7.
- The `pendingRequestId` state name is identical in Tasks 6 and 7.
- The cancel-button `title` tooltip text is verbatim identical across Tasks 6 and 7.

**Placeholder scan:** No "TBD", "implement later". A few "adapt to existing variable names" notes are intentional — the underlying code patterns differ across the two pages and the implementer is expected to read the surrounding code (line numbers cited).

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-30-cancel-and-leave-warning.md](2026-04-30-cancel-and-leave-warning.md). Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks directly in this session.

Which approach?
