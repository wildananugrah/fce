# Cancel + Leave-Page Warning for AI Async Flows — Design

**Date:** 2026-04-30
**Status:** Spec
**Owner:** Backend / Frontend

## Problem

The four AI auto-fill / generation flows in the app are slow (10–60s) and currently uninterruptible:

| Flow | Pattern |
|---|---|
| Brand brain auto-fill | Sync HTTP `POST /api/workspaces/:wid/brands/scrape-preview` |
| Product brain auto-fill | Sync HTTP `POST /api/workspaces/:wid/products/scrape-preview` |
| Topic generation | pg-boss job (`topic-generation`) |
| Content generation | pg-boss job (`content-generation`) |

Two real problems users hit:

1. **Accidental data loss** — they navigate away or close the tab mid-generation, lose the in-progress work and any local form edits.
2. **No escape hatch** — they realize halfway through that they entered the wrong URL or the wrong prompt and have no way to stop the run.

This spec adds a leave-page warning while a flow is in flight, plus cancel buttons that abort sync requests immediately and mark async jobs cancelled at the next worker checkpoint.

## Goals

- Closing the tab, refreshing, or navigating in-app while an AI flow is running surfaces a confirmation prompt.
- Each of the four flows has a Cancel button next to the spinner that returns control to the user.
- For the two async flows, "cancel" is best-effort: the in-flight AI call still completes (and is billed), but no further work happens. The UX must communicate this.

## Non-Goals

- **Pause / resume** — sync HTTP can't pause; pg-boss jobs would need a checkpointed state machine. Disproportionate cost.
- **True abort of the in-flight provider request** — Gemini/Anthropic SDKs don't reliably support cancellation tokens. We accept that the first AI call's tokens are paid.
- **A unified "in-progress jobs" page** — out of scope. Cancel buttons live next to whatever existing UI shows the running flow.
- **Audit emits for `generation.cancel`** — out of scope for this spec; existing audit catalog stays.

## Architecture

Three independent surfaces:

1. **`useUnsavedAsync` hook** — a single React hook each form/page calls when an AI flow is in flight. Wires up `beforeunload` (browser-controlled "Leave site?" prompt) AND React Router v7's `useBlocker` (in-app navigation, controlled prompt with custom message).
2. **AbortController plumbing** — frontend passes a `signal` into the `api()` fetch wrapper. The wrapper already accepts `RequestInit`, which has native `signal: AbortSignal` support. No api change needed.
3. **Best-effort async cancel** — new `cancelled` value on `GenerationRequest.status`, a new `POST /generation-requests/:id/cancel` route, and worker checkpoint guards.

## Frontend changes

### New: `frontend/src/hooks/useUnsavedAsync.ts`

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

    const blocker = useBlocker(({ currentLocation, nextLocation }) =>
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

Native `window.confirm` instead of building a `ConfirmDialog` — matches the existing convention (e.g. `ProjectsTab.tsx:49` uses native confirm for the project archive prompt).

### Each form/page wires the hook + a cancel button

**`frontend/src/components/brands/BrandBrainForm.tsx`** — already has a `generating` state for the auto-fill spinner. Wire:

```tsx
useUnsavedAsync(
    generating,
    "AI is auto-filling your brand brain — leave anyway? Your progress will be lost.",
);

// new ref
const abortRef = useRef<AbortController | null>(null);

// in the auto-fill handler, replace the bare api() call with:
const controller = new AbortController();
abortRef.current = controller;
try {
    const result = await api<...>("/api/workspaces/.../brands/scrape-preview", {
        method: "POST",
        body: JSON.stringify({ url }),
        signal: controller.signal,   // <-- new
    });
    // ... existing handling ...
} catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;  // user cancelled
    setError(e instanceof Error ? e.message : "Auto-fill failed");
} finally {
    abortRef.current = null;
}

// new Cancel button rendered next to the spinner:
{generating && (
    <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
        Cancel
    </Button>
)}
```

**`frontend/src/components/products/ProductForm.tsx`** — identical pattern (it has `generating` and an auto-fill handler around line 75–115).

**Topic generation page** (`TopicsPage.tsx` — submit-and-wait flow): wires `useUnsavedAsync` while a request is in flight. Adds a Cancel button that POSTs to the new cancel route (defined below) — no AbortController for the submit because the submit itself is fast (just enqueues the job); the spinner shows because we're polling/listening for completion.

**Content generation page** (`GeneratePage.tsx`): same as topic.

### Cancel button copy + caveat

For the two async flows, the Cancel button has a tooltip:

```
Cancel stops the next step. The current AI call will finish and may incur usage cost.
```

This sets the right expectation up front.

## Backend changes

### Schema (no migration needed)

`GenerationRequest.status` is already `String @default("pending")` — string column, free-form. Adding `"cancelled"` as a new valid value is a code-only change. Document the union in code comments / type aliases:

```ts
// Existing values: "pending" | "completed" | "failed"
// New: "cancelled" — user clicked Cancel before the worker finished.
//   The worker may still be running the in-flight AI call when this
//   value lands; downstream phases short-circuit.
```

### New route: cancel a generation request

`backend/src/routes/generation.route.ts` (new endpoint inside the existing route file):

```ts
// POST /:id/cancel — best-effort cancellation. Flips status to "cancelled"
// if currently "pending". Workers check this between phases.
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
```

The exact path placement depends on the existing generation route's URL prefix — the implementer adapts. If the route file is registered under `/api/workspaces/:wid/generation-requests`, the full URL becomes `POST /api/workspaces/:wid/generation-requests/:id/cancel`.

### Worker checkpoint guards

Both `TopicGenerationJob` and `ContentGenerationJob` already have a multi-phase shape (resolve providers → call AI → parse → save → notify). Add a tiny helper:

```ts
async function isCancelled(prisma: PrismaClient, requestId: string): Promise<boolean> {
    const row = await prisma.generationRequest.findUnique({
        where: { id: requestId },
        select: { status: true },
    });
    return row?.status === "cancelled";
}
```

In each worker's `handle()`, call `if (await isCancelled(prisma, requestId)) return;` at every checkpoint:

- After the first `await` that follows job pickup (so we catch a cancel that landed while pg-boss was dispatching).
- Immediately before the AI provider call.
- Immediately after the AI provider call returns, before saving any output.
- Before the SSE notification.

When cancelled, the worker:
- Does NOT throw (otherwise pg-boss retries it).
- Returns cleanly. No `GenerationOutput` rows are written.
- Logs an info-level message: `"generation cancelled by user"` with `requestId`.
- The status row stays at `"cancelled"` — the route already set it. The worker doesn't re-stamp it.

### "Cannot cancel — already completed" race

If the user clicks Cancel after the worker finished but before the SSE message arrived: the route returns 400 with the friendly "current status is 'completed'" message. Frontend shows it as a toast and removes the spinner anyway. Acceptable race.

## Testing

- Frontend: smoke only (no test infra exists for the relevant components).
- Backend unit tests:
  - `generation.route.test.ts` (or extend the existing route test if any) — happy path returns 200 + status flips, already-completed returns 400, wrong workspace returns 404.
  - Worker test — given a request that's already `"cancelled"` when the job picks up, the worker returns without writing output. (Whether the existing job test files exist is checked at implementation time; if not, manual smoke is acceptable per the project's test conventions.)
- Manual smoke after deploy:
  1. Brand auto-fill: start the auto-fill, wait for spinner, click Cancel → spinner clears, form is editable. Try to navigate away while spinner is up → see the leave prompt.
  2. Product auto-fill: same.
  3. Topic generation: submit, see spinner, click Cancel → spinner clears, status goes to `cancelled`, no notification arrives. DB check: `SELECT status FROM generation_requests WHERE id = 'X'` returns `cancelled`. No `GenerationOutput` rows for this request.
  4. Content generation: same.
  5. Try to refresh the tab while any of the above is mid-flight → see the browser's "Leave site?" prompt.

## Rollout

Single PR. The schema change is value-only (new string in an existing column), so no migration. Deploy backend first (so the cancel route exists), then frontend (which calls it). On the same branch this is one commit set, no version skew window.

## Open Questions

None. Scope locked at "Leave-warning + Cancel only" during brainstorming. Best-effort async cancel acknowledged with a tooltip.
