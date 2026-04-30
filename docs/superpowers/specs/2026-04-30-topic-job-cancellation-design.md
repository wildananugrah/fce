# Topic-Job Cancellation — Design

**Date:** 2026-04-30
**Status:** Spec
**Owner:** Backend / Frontend

## Problem

The cancel-and-leave-warning work (in flight on `feat/cancel-and-leave-warning`) added a cancel mechanism for **content generation** by flipping `GenerationRequest.status` to `"cancelled"` and having the worker check it between phases. That mechanism doesn't extend to **topic generation** because the topic-gen flow ([topic.service.ts:66](../../../backend/src/services/topic.service.ts#L66)) enqueues a pg-boss job directly without ever creating a `GenerationRequest` row — there's no app-level row to flip.

Bulk topic generation can take 30+ seconds (multiple topics, multiple AI calls). Users want the same Cancel button on the Topic Library page that's planned for the content Generate page. This spec adds the missing infrastructure.

## Goals

- Bulk topic generation gets a Cancel button that mirrors the content-gen Cancel UX exactly.
- Same best-effort guarantee: clicking Cancel stops the next phase; the in-flight AI call finishes and is billed.
- Architecture mirrors the content-gen cancel pattern — one cancel mechanism in the codebase, not two.

## Non-Goals

- **`topic-regeneration` queue** (single-topic regen). Fast (~5–10s), not worth the complexity.
- A unified job-cancellation framework that subsumes both `GenerationRequest.status` and the new mechanism. Future cleanup.
- Cleanup / retention policy for `TopicGenerationRun` rows. Add to `ArchiveSweepJob` later if growth becomes a concern.

## Schema

New model in `backend/prisma/schema.prisma`:

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

Reverse relations on `Workspace` and `User`:

```prisma
// in Workspace:
topicGenerationRuns TopicGenerationRun[]

// in User:
topicGenerationRuns TopicGenerationRun[]
```

Status union: `"pending" | "completed" | "failed" | "cancelled"`. Free-form string, no enum, matches `GenerationRequest.status` convention.

Minimal columns on purpose: this row only carries the cancellation signal and a small audit trail (who started it, when, when it finished). The actual generated topics persist as `ContentTopic` rows on completion. We're not duplicating payload.

## Service Change

`backend/src/services/topic.service.ts:54-84` (`generate()`):

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
        runId: run.id,                 // NEW
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

Return type widens from `{ jobId }` to `{ runId, jobId }`. The frontend uses `runId` for cancel; `jobId` stays for backwards-compatibility / debugging.

`regenerate()` and `regeneratePreview()` are NOT touched — `topic-regeneration` is out of scope.

## Worker Change

`backend/src/jobs/topic-generation.job.ts`:

1. Payload type adds `runId: string`.
2. Add a sibling helper to `backend/src/utils/generation-cancellation.ts`:

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

3. Worker checks at three points, mirroring the content-gen pattern from Task 3:
   - After job pickup (first `await`).
   - Immediately before the AI provider call.
   - Immediately after the AI provider call returns, before persisting `ContentTopic` rows or sending the SSE notification.

   Each guard:

   ```ts
   if (await isTopicRunCancelled(this.prisma, runId)) {
       this.logger.info("topic-generation: cancelled by user", { runId, userId });
       return;
   }
   ```

   Returns cleanly (NOT throws) so pg-boss doesn't retry.

4. On successful completion, the worker flips status to `"completed"` and stamps `completedAt`:

   ```ts
   await this.prisma.topicGenerationRun.update({
       where: { id: runId },
       data: { status: "completed", completedAt: new Date() },
   });
   ```

5. On unhandled error, flip to `"failed"` and stamp `completedAt`. Wrap the existing job body in try/catch around the persistence section, OR add the status-flip at the natural error path the job already has. Implementer's call.

## Cancel Route

New endpoint mounted alongside the existing topic routes. Concrete location: extend `backend/src/routes/topic.route.ts` rather than create a new file.

```ts
// POST /topics/runs/:id/cancel — best-effort cancellation. Flips status
// to "cancelled" if currently "pending"; the worker checks this between
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

Mounted under `/topics/runs/:id/cancel` so the full URL is `POST /api/workspaces/:wid/topics/runs/:id/cancel`. The route file's existing factory likely already takes `prisma`; if not, add it as a constructor arg the same way Task 2 of the parent plan added it to `createGenerationRoutes`.

## Frontend Change

`frontend/src/pages/TopicsPage.tsx` (the wire-up Task 6 of the parent plan was already going to do, with one URL change):

1. `useUnsavedAsync(generating, "AI is generating topics — leave anyway?…")` — unchanged from the parent plan.
2. New state: `const [pendingRunId, setPendingRunId] = useState<string | null>(null);`
3. After the existing submit POST returns, capture `response.data.runId` (or whatever the existing api wrapper returns) into `pendingRunId`.
4. Cancel button calls `POST /api/workspaces/:wid/topics/runs/${pendingRunId}/cancel`.
5. On SSE complete or successful cancel, clear `setPendingRunId(null)` alongside `setGenerating(false)`.

Same Cancel button shape, same tooltip ("Cancel stops the next step. The current AI call will finish and may incur usage cost.") as the content-gen Cancel button — only the URL path differs.

## Effect on the Parent Plan

The cancel-and-leave-warning plan's Task 6 (`TopicsPage` wire-up) becomes implementable after this work lands. The original Task 6 referenced `/generations/:id/cancel` for topics, which would have been a dead URL because topic-gen doesn't write `GenerationRequest` rows. We update that task to point at `/topics/runs/:id/cancel` and capture `runId` instead of a generic id.

Branch strategy: this work lands on the same `feat/cancel-and-leave-warning` branch. The PR for that branch carries everything — content-gen cancel (already done in Tasks 1–3 + log fix), topic-gen cancel (this spec), the four UI surfaces (Tasks 4–7), and the smoke test. Single coherent feature.

## Testing

- Service unit test for `topic.service.ts:generate()` — asserts a `TopicGenerationRun` row is created and `runId` is returned.
- Cancel route test — happy path returns 200 + status flips to `"cancelled"`; already-completed returns 400; wrong workspace returns 404.
- Worker tests — out of scope (existing topic-gen job has no test infrastructure).
- Manual smoke part of the parent plan's Task 8 — exercise the topic Cancel button end-to-end.

## Rollout

Ordered:

1. Schema change + `bunx prisma db push` + `bunx prisma generate`.
2. Service change (`generate()` writes the run row, returns `runId`).
3. Worker change (payload reads `runId`, three guards, completion status flip).
4. Cancel route.
5. Frontend wire-up (covered by parent plan's Task 6).

Backwards compatibility: existing topic-gen runs that are mid-flight when this deploys won't have a run row — but they were enqueued under the old code which doesn't pass `runId` to the worker, so they finish under the old code path. New requests get the new code end-to-end. Safe rolling deploy.

## Open Questions

None. Architecture pattern (A — mirror content-gen) and scope (bulk only, no regeneration) locked during brainstorming.
