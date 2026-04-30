# Topic-Job Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cancel support for bulk topic generation by mirroring the content-gen pattern: a new `TopicGenerationRun` row created at submit time, worker checks its status between phases, frontend uses the row id for cancel.

**Architecture:** Schema adds `TopicGenerationRun` model. `topic.service.ts:generate()` writes the row first, returns `runId`. Worker reads `runId` from job payload and checks status at three phase boundaries (post-pickup, before AI call, after AI call). New cancel route flips status to `"cancelled"`. Pure additive — no existing flows change behavior.

**Tech Stack:** Prisma 7, Bun, Hono, pg-boss.

**Spec:** [docs/superpowers/specs/2026-04-30-topic-job-cancellation-design.md](../specs/2026-04-30-topic-job-cancellation-design.md)

---

## Task 1: Add `TopicGenerationRun` schema + db push

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the new model**

In `backend/prisma/schema.prisma`, find a sensible place near other workspace-scoped models (e.g. close to `GenerationRequest` or `ContentTopic`). Append the new model:

```prisma
model TopicGenerationRun {
  id          String    @id @default(uuid())
  workspaceId String    @map("workspace_id")
  userId      String    @map("user_id")
  status      String    @default("pending")
  createdAt   DateTime  @default(now()) @map("created_at")
  completedAt DateTime? @map("completed_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id])

  @@index([workspaceId])
  @@index([userId])
  @@map("topic_generation_runs")
}
```

- [ ] **Step 2: Add reverse relations to `Workspace` and `User`**

In the `Workspace` model, find the relation list (around the existing `auditLogs AuditLog[]`). Add:

```prisma
topicGenerationRuns TopicGenerationRun[]
```

In the `User` model, same — add:

```prisma
topicGenerationRuns TopicGenerationRun[]
```

- [ ] **Step 3: Push the schema and regenerate the Prisma client**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx prisma db push
bunx prisma generate
```

Expected from `prisma db push`: `🚀  Your database is now in sync with your Prisma schema.` No data warnings — pure additive change.

Expected from `prisma generate`: `✔ Generated Prisma Client …`.

- [ ] **Step 4: Verify the table in Postgres**

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c "\d topic_generation_runs"
```

Expected: a table with columns `id`, `workspace_id`, `user_id`, `status`, `created_at`, `completed_at`, and two indexes on `workspace_id` and `user_id`. The `status` column has a default of `'pending'`.

- [ ] **Step 5: Type-check + tests**

```bash
cd backend && set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "schema|topic-generation" || echo "NO_RELEVANT_ERRORS"
bun test 2>&1 | tail -5
```

Expected: `NO_RELEVANT_ERRORS` and same baseline (~219 pass / 1 pre-existing fail).

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/prisma/schema.prisma
git commit -m "feat(topic): add TopicGenerationRun schema for cancellation tracking"
```

---

## Task 2: Service writes the run row + returns `runId`

**Files:**
- Modify: `backend/src/services/topic.service.ts:54-84` (`generate()`)
- Modify: `backend/src/interfaces/services/topic.service.interface.ts` (return type)

- [ ] **Step 1: Update the interface return type**

In `backend/src/interfaces/services/topic.service.interface.ts`, find the `generate()` method signature and widen its return type:

```ts
generate(
    workspaceId: string,
    userId: string,
    input: GenerateTopicsInput,
): Promise<{ runId: string; jobId: string }>;
```

(If the existing signature returns just `{ jobId: string }`, add `runId` alongside.)

- [ ] **Step 2: Replace the `generate()` body**

In `backend/src/services/topic.service.ts`, replace the existing `generate()` method (lines 54–84) with:

```ts
async generate(
    workspaceId: string,
    userId: string,
    input: GenerateTopicsInput,
): Promise<{ runId: string; jobId: string }> {
    const brand = await this.prisma.brand.findUnique({
        where: { id: input.brandId },
        select: { language: true },
    });
    if (!brand) throw new Error("Brand not found");
    const language = brand.language;

    // Create the run row BEFORE enqueueing so the worker has something
    // to look up and the user can cancel between submit and pickup.
    const run = await this.prisma.topicGenerationRun.create({
        data: { workspaceId, userId, status: "pending" },
    });

    const jobId = await this.boss.send("topic-generation", {
        runId: run.id,
        workspaceId,
        brandId: input.brandId,
        productIds: input.productIds,
        platform: input.platform,
        objective: input.objective,
        formats: input.formats,
        pillars: input.pillars,
        language,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        count: input.count ?? 10,
        userId,
        prompt: input.prompt,
        referenceImages: input.referenceImages,
    });

    return { runId: run.id, jobId: jobId ?? "queued" };
}
```

The diff vs the existing method: a `prisma.topicGenerationRun.create` call before `boss.send`, the new `runId: run.id` field in the boss payload, and the widened return type.

- [ ] **Step 3: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep -v node_modules | grep "topic\.service" || echo "NO_ERRORS"
```

Expected: `NO_ERRORS`.

If there's a TS error in any caller of `topicService.generate()` because they were destructuring `{ jobId }` and now also have `runId`, that's fine — `runId` is just an extra field, callers that ignore it still work. But verify no caller breaks.

- [ ] **Step 4: Run tests**

```bash
bun test tests/services/topic.service.test.ts 2>&1 | tail -10
```

Expected: existing tests pass. If a test mocks `boss.send` or `prisma.topicGenerationRun.create`, ensure the mock supports the new call. Most likely the `MockTopicRepository` or a mock prisma in the test file needs `topicGenerationRun: { create: async (...) => ({ id: "..." }) }` added.

If a test fails because the mock prisma doesn't have `topicGenerationRun`, add it:

```ts
const mockPrisma = {
    // ... existing mocks ...
    topicGenerationRun: {
        create: async ({ data }: { data: any }) => ({
            id: crypto.randomUUID(),
            ...data,
            createdAt: new Date(),
            completedAt: null,
        }),
    },
} as any;
```

If no test exists for `topic.service.generate()`, that's fine — skip.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/topic.service.ts \
        backend/src/interfaces/services/topic.service.interface.ts \
        backend/tests/services/topic.service.test.ts
git commit -m "feat(topic): create TopicGenerationRun on generate, return runId"
```

(Stage the test file only if you actually changed it.)

---

## Task 3: Worker checkpoint guards + completion status flip

**Files:**
- Modify: `backend/src/utils/generation-cancellation.ts` (add the sibling helper)
- Modify: `backend/src/jobs/topic-generation.job.ts`

The worker file currently has the structure: `try { ... ai call ... persist topics ... notify ... } catch (err) { ... notify failed ... }`. We add three guards + a completion flip + a failure flip.

- [ ] **Step 1: Add the sibling helper**

In `backend/src/utils/generation-cancellation.ts` (which already exists from the parent plan's Task 3), append:

```ts
export async function isTopicRunCancelled(
    prisma: PrismaClient,
    runId: string,
): Promise<boolean> {
    const row = await prisma.topicGenerationRun.findUnique({
        where: { id: runId },
        select: { status: true },
    });
    return row?.status === "cancelled";
}
```

- [ ] **Step 2: Update the payload type**

In `backend/src/jobs/topic-generation.job.ts`, add `runId` to `TopicJobData`:

```ts
interface TopicJobData {
    runId: string;
    workspaceId: string;
    brandId?: string;
    productIds?: string[];
    platform?: string;
    objective?: string;
    formats?: string[];
    pillars?: string[];
    language?: string;
    dateFrom?: string;
    dateTo?: string;
    count: number;
    userId: string;
    prompt?: string;
    referenceImages?: string[];
}
```

And destructure it at the top of `handle()`:

```ts
const {
    runId,
    workspaceId,
    brandId,
    productIds,
    // ... rest unchanged ...
} = data;
```

- [ ] **Step 3: Add the import for the helper**

At the top of `topic-generation.job.ts`, alongside the existing imports:

```ts
import { isTopicRunCancelled } from "../utils/generation-cancellation";
```

- [ ] **Step 4: Insert the three checkpoint guards**

The `handle()` body has a `try { ... } catch (err) { ... }`. Inside the `try` block, insert guards at three points.

**Guard 1** — at the very top of the try block, BEFORE any expensive work (immediately after the destructuring, before the brand-context lookup):

```ts
try {
    if (await isTopicRunCancelled(this.prisma, runId)) {
        this.logger.info("topic-generation: cancelled by user", { runId, userId });
        return;
    }

    // existing brand context lookup follows...
```

**Guard 2** — immediately BEFORE the AI provider call. Find the existing line:

```ts
const topicGenerator = await this.aiFactory.getTopicGenerator(workspaceId);
const startTime = Date.now();
const output = await topicGenerator.generate(generationInput);
```

Insert the guard right before `topicGenerator.generate(...)`:

```ts
const topicGenerator = await this.aiFactory.getTopicGenerator(workspaceId);
if (await isTopicRunCancelled(this.prisma, runId)) {
    this.logger.info("topic-generation: cancelled by user", { runId, userId });
    return;
}
const startTime = Date.now();
const output = await topicGenerator.generate(generationInput);
```

**Guard 3** — immediately AFTER the AI provider call, BEFORE persisting `ContentTopic` rows. Find the existing block (around line 262 in the current file):

```ts
// Create ContentTopic records for each generated topic
await Promise.all(
    output.topics.map((topic) =>
        this.prisma.contentTopic.create({
            // ...
        }),
    ),
);
```

Insert the guard before that block:

```ts
if (await isTopicRunCancelled(this.prisma, runId)) {
    this.logger.info("topic-generation: cancelled by user", { runId, userId });
    return;
}

// Create ContentTopic records for each generated topic
await Promise.all(
    // ... existing call unchanged ...
);
```

- [ ] **Step 5: Flip status to `"completed"` after success**

After the `notificationService.notify(...)` and `logger.info("Topic generation completed", ...)` lines (right at the end of the try block), add:

```ts
await this.prisma.topicGenerationRun.update({
    where: { id: runId },
    data: { status: "completed", completedAt: new Date() },
});
```

- [ ] **Step 6: Flip status to `"failed"` in the catch block**

Inside the existing `catch (err)` block, after the existing error log + notify, add:

```ts
await this.prisma.topicGenerationRun.update({
    where: { id: runId },
    data: { status: "failed", completedAt: new Date() },
}).catch(() => {
    // Tolerate the secondary update failing — the original error is
    // already logged + the user already got the SSE failure notification.
});
```

The trailing `.catch(() => {})` is intentional: if the secondary update itself errors (e.g. DB hiccup), we don't want to double-throw and break the catch handler.

- [ ] **Step 7: Type-check + tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "(topic-generation|generation-cancellation)" || echo "NO_ERRORS"
bun test 2>&1 | tail -5
```

Expected: `NO_ERRORS` and same baseline pass count.

- [ ] **Step 8: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/utils/generation-cancellation.ts \
        backend/src/jobs/topic-generation.job.ts
git commit -m "feat(topic): worker checkpoint guards + status flip for run cancellation"
```

---

## Task 4: Cancel route on `/topics/runs/:id/cancel`

**Files:**
- Modify: `backend/src/routes/topic.route.ts`
- Modify: `backend/src/index.ts` (only if `topic.route.ts` doesn't already take `prisma`)

- [ ] **Step 1: Inspect the existing route file**

```bash
grep -n "createTopicRoutes\|prisma" /Users/bellinnn/Documents/projects/fce/backend/src/routes/topic.route.ts | head -10
```

If the factory already takes `prisma` (as a constructor arg), proceed to Step 2 directly. If not, the next sub-step adds it.

If `prisma` is NOT yet in the route's signature, modify the factory:

```ts
import type { PrismaClient } from "@prisma/client";

export function createTopicRoutes(
    topicService: TopicService,
    prisma: PrismaClient,  // NEW
) {
    // ... existing body ...
}
```

And update the call site in `backend/src/index.ts`:

```ts
workspaceScoped.route("/topics", createTopicRoutes(topicService, prisma));
```

- [ ] **Step 2: Add the cancel handler**

In `backend/src/routes/topic.route.ts`, inside the route factory body (alongside the existing topic endpoints), add:

```ts
// POST /runs/:id/cancel — best-effort cancellation. Flips status to
// "cancelled" if currently "pending"; the worker checks this between
// phases (the in-flight AI call still completes and is billed).
app.post("/runs/:id/cancel", async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const before = await prisma.topicGenerationRun.findUnique({
        where: { id },
        select: { workspaceId: true, status: true },
    });
    if (!before || before.workspaceId !== workspaceId) {
        return c.json({ error: "Run not found" }, 404);
    }
    if (before.status !== "pending") {
        return c.json(
            { error: `Cannot cancel — current status is "${before.status}"` },
            400,
        );
    }
    await prisma.topicGenerationRun.update({
        where: { id },
        data: { status: "cancelled" },
    });
    return c.json({ data: { ok: true } });
});
```

The full URL becomes `POST /api/workspaces/:wid/topics/runs/:id/cancel`.

- [ ] **Step 3: Type-check + tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "(topic\.route|index\.ts)" || echo "NO_ERRORS"
bun test 2>&1 | tail -5
```

Expected: `NO_ERRORS`. Tests at baseline.

- [ ] **Step 4: Smoke the new route locally (optional but recommended)**

Restart the backend dev server (`kill $(pgrep -f "bun.*src/index"); cd backend; bun run --hot src/index.ts &`).

Then trigger a topic generation and immediately cancel it via curl:

```bash
# Get a fresh runId by submitting a topic generation through the UI,
# then grab the id from the network tab. Or query directly:
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c \
  "SELECT id, status FROM topic_generation_runs ORDER BY created_at DESC LIMIT 1;"

# Then cancel it (replace <RUN_ID>, <WS_ID>, <ACCESS_TOKEN>):
curl -X POST http://localhost:3001/api/workspaces/<WS_ID>/topics/runs/<RUN_ID>/cancel \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json"
```

Expected: `{"data":{"ok":true}}`. Re-querying the DB shows `status = 'cancelled'`. The backend logs should show `topic-generation: cancelled by user` with the `runId` and `userId`.

If the smoke fails, fix before committing.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/topic.route.ts backend/src/index.ts
git commit -m "feat(topic): add cancel route on /topics/runs/:id/cancel"
```

(Stage `index.ts` only if you modified it in Step 1.)

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| `TopicGenerationRun` schema model | Task 1 |
| Reverse relations on Workspace + User | Task 1 |
| `topic.service.generate()` writes the run, returns `runId` | Task 2 |
| `isTopicRunCancelled` helper | Task 3 |
| Three worker checkpoint guards | Task 3 |
| Completion status flip + completedAt | Task 3 |
| Failure status flip | Task 3 |
| Cancel route at `POST /topics/runs/:id/cancel` | Task 4 |
| Frontend wire-up (TopicsPage Cancel button) | Parent plan Task 6 — folded back in once this lands |

All spec sections covered. Frontend wire-up explicitly deferred to the parent plan.

**Type / name consistency:**
- `runId: string` is used in payload, helper, and route consistently.
- The status union (`"pending" | "completed" | "failed" | "cancelled"`) matches `GenerationRequest.status`.
- The model name `TopicGenerationRun` is identical in schema, service, worker, route.

**Placeholder scan:** No "TBD", "implement later", or "similar to". Each step has the actual code or command.

---

## After this plan lands

Resume the parent cancel-and-leave-warning plan (`docs/superpowers/plans/2026-04-30-cancel-and-leave-warning.md`) at:

- **Task 4** (BrandBrainForm wire-up — unchanged)
- **Task 5** (ProductForm wire-up — unchanged)
- **Task 6** (TopicsPage wire-up) — point the Cancel button at `POST /api/workspaces/:wid/topics/runs/:id/cancel` and capture `runId` from the submit response (now `{ runId, jobId }`). The rest of Task 6's wiring is unchanged.
- **Task 7** (GeneratePage wire-up — unchanged)
- **Task 8** (Manual smoke — extends to also test topic-gen cancel)

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-30-topic-job-cancellation.md](2026-04-30-topic-job-cancellation.md). Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks directly in this session.

Which approach?
