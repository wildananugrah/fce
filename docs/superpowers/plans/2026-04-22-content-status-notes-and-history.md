# Content Status Notes + History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let reviewers leave a note when changing a content output's status (required for rejections, optional otherwise) and show a chronological history of status changes inside the Library preview modal.

**Architecture:** Extend the existing `OutputFeedbackEvent` table with a nullable `note` column; use `eventType: "status_change"` for the new events. Update the PATCH route to validate + record events, add a new GET history route, and rework the modal's status footer into a two-step confirm with an inline note panel and a collapsible history list.

**Tech Stack:** TypeScript, Bun test, Prisma 7, Hono, React 19.

---

## File Structure

Files to modify:
- `backend/prisma/schema.prisma` — add `note` column to `OutputFeedbackEvent`
- `backend/src/interfaces/repositories/generation.repository.interface.ts` — extend `addFeedback` signature, add `findStatusChangesByOutput`
- `backend/src/repositories/generation.repository.ts` — implement both
- `backend/src/interfaces/services/library.service.interface.ts` — extend `addFeedback`, add `listStatusHistory`
- `backend/src/services/library.service.ts` — extend `addFeedback`, add `listStatusHistory`, update the status-change path so PATCH records a feedback event with the note
- `backend/src/routes/library.route.ts` — PATCH `/:id` accepts + validates `note`; new GET `/:id/history`
- `frontend/src/components/library/ContentPreviewModal.tsx` — two-step status confirm + history panel

Files to create:
- `backend/tests/services/library.service.test.ts` — new test file for `addFeedback` note persistence and `listStatusHistory` filter + sort

No existing frontend test harness; manual QA only for the UI.

---

## Task 1: Schema — add `note` to `OutputFeedbackEvent`

**Files:**
- Modify: `backend/prisma/schema.prisma` — the `OutputFeedbackEvent` model

- [ ] **Step 1: Add the `note` column**

Find the `OutputFeedbackEvent` model in `backend/prisma/schema.prisma`. Add a `note` line immediately after `after`:

```prisma
model OutputFeedbackEvent {
  id        String   @id @default(uuid())
  outputId  String   @map("output_id")
  eventType String   @map("event_type")
  before    Json?
  after     Json?
  note      String?  @db.Text
  userId    String?  @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  output GenerationOutput @relation(fields: [outputId], references: [id], onDelete: Cascade)

  @@index([outputId])
  @@map("output_feedback_events")
}
```

- [ ] **Step 2: Push schema to DB + regenerate client**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/backend && bunx prisma db push 2>&1 | tail -10
```

Expected: `"The database is now in sync with your Prisma schema."` plus a regenerated client.

If Prisma complains about `DATABASE_URL`, copy `.env` from the main checkout first:
```bash
cp /Users/bellinnn/Documents/projects/fce/backend/.env /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/backend/.env
```

- [ ] **Step 3: Confirm typecheck is unchanged**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/backend && bunx tsc --noEmit 2>&1 | wc -l
```

Expected: 14 (the pre-existing baseline).

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes && git add backend/prisma/schema.prisma && git commit -m "feat(schema): add note column to output_feedback_events"
```

---

## Task 2: Repository — extend `addFeedback` + add `findStatusChangesByOutput`

**Files:**
- Modify: `backend/src/interfaces/repositories/generation.repository.interface.ts` — `addFeedback` signature, new method declaration
- Modify: `backend/src/repositories/generation.repository.ts` — implement both

- [ ] **Step 1: Update the interface**

Open `backend/src/interfaces/repositories/generation.repository.interface.ts`. Find the `addFeedback` declaration (around line 40) and replace with:

```typescript
	addFeedback(data: {
		outputId: string;
		eventType: string;
		before?: any;
		after?: any;
		userId?: string;
		note?: string;
	}): Promise<OutputFeedbackEvent>;
	findStatusChangesByOutput(
		outputId: string,
	): Promise<
		Array<
			OutputFeedbackEvent & {
				user: { id: string; fullName: string | null; email: string } | null;
			}
		>
	>;
```

Add an import for `OutputFeedbackEvent` at the top if not already present.

- [ ] **Step 2: Update the implementation**

Open `backend/src/repositories/generation.repository.ts`. Find the existing `addFeedback` method (around line 232) and replace with:

```typescript
	async addFeedback(data: {
		outputId: string;
		eventType: string;
		before?: any;
		after?: any;
		userId?: string;
		note?: string;
	}): Promise<OutputFeedbackEvent> {
		return this.prisma.outputFeedbackEvent.create({
			data,
		});
	}

	async findStatusChangesByOutput(outputId: string) {
		return this.prisma.outputFeedbackEvent.findMany({
			where: { outputId, eventType: "status_change" },
			include: {
				// Join user for display name/email in the history list.
				// FK is nullable so user may be null for server-initiated events.
				output: { select: { id: true } }, // cheap no-op; keep the include block uniform
			},
			orderBy: { createdAt: "desc" },
		}) as any; // tightened below
	}
```

Wait — the user relation isn't on `OutputFeedbackEvent` in the current schema (userId is a string but there's no Prisma relation). For the join, we need to add the relation OR do a manual lookup. Pick the simpler: **manual second query**. Rewrite `findStatusChangesByOutput`:

```typescript
	async findStatusChangesByOutput(outputId: string) {
		const events = await this.prisma.outputFeedbackEvent.findMany({
			where: { outputId, eventType: "status_change" },
			orderBy: { createdAt: "desc" },
		});
		const userIds = Array.from(
			new Set(events.map((e) => e.userId).filter((id): id is string => !!id)),
		);
		const users =
			userIds.length > 0
				? await this.prisma.user.findMany({
						where: { id: { in: userIds } },
						select: { id: true, fullName: true, email: true },
					})
				: [];
		const userMap = new Map(users.map((u) => [u.id, u]));
		return events.map((e) => ({
			...e,
			user: e.userId ? (userMap.get(e.userId) ?? null) : null,
		}));
	}
```

- [ ] **Step 3: Update the interface return type** to match the implementation. Back in `backend/src/interfaces/repositories/generation.repository.interface.ts`, make sure the return type matches:

```typescript
	findStatusChangesByOutput(
		outputId: string,
	): Promise<
		Array<
			OutputFeedbackEvent & {
				user: { id: string; fullName: string | null; email: string } | null;
			}
		>
	>;
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/backend && bunx tsc --noEmit 2>&1 | wc -l
```

Expected: 14 (baseline unchanged). If higher, inspect with:

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/backend && bunx tsc --noEmit 2>&1 | grep -E "generation.repository" | head -5
```

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes && git add backend/src/interfaces/repositories/generation.repository.interface.ts backend/src/repositories/generation.repository.ts && git commit -m "feat(repo): accept note on addFeedback + add findStatusChangesByOutput"
```

---

## Task 3: Service — extend `addFeedback` + add `listStatusHistory` + route status-change through feedback

**Files:**
- Modify: `backend/src/interfaces/services/library.service.interface.ts`
- Modify: `backend/src/services/library.service.ts`
- Create: `backend/tests/services/library.service.test.ts`

- [ ] **Step 1: Write the failing service test**

Create `backend/tests/services/library.service.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "bun:test";
import { LibraryService } from "../../src/services/library.service";

// Minimal repo mock — only the methods exercised in these tests are implemented.
class MockGenerationRepository {
	feedbackCalls: any[] = [];
	feedbackStore: any[] = [];

	async addFeedback(data: any) {
		const event = {
			id: crypto.randomUUID(),
			outputId: data.outputId,
			eventType: data.eventType,
			before: data.before ?? null,
			after: data.after ?? null,
			note: data.note ?? null,
			userId: data.userId ?? null,
			createdAt: new Date(),
		};
		this.feedbackCalls.push(data);
		this.feedbackStore.push(event);
		return event;
	}

	async findStatusChangesByOutput(outputId: string) {
		return this.feedbackStore
			.filter((e) => e.outputId === outputId && e.eventType === "status_change")
			.map((e) => ({ ...e, user: e.userId ? { id: e.userId, fullName: "Test User", email: "t@example.com" } : null }))
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}

	async findOutputById() {
		return null;
	}

	// Unused by these tests but required by the interface type.
	async findById() { return null; }
	clear() {
		this.feedbackCalls = [];
		this.feedbackStore = [];
	}
}

describe("LibraryService", () => {
	const repo = new MockGenerationRepository();
	const service = new LibraryService(repo as any);

	afterEach(() => repo.clear());

	describe("addFeedback", () => {
		it("forwards note through to the repository", async () => {
			await service.addFeedback(
				"output-1",
				"status_change",
				"user-1",
				{ status: "draft" },
				{ status: "in_review" },
				"Ready for review",
			);
			expect(repo.feedbackCalls).toHaveLength(1);
			expect(repo.feedbackCalls[0].note).toBe("Ready for review");
		});

		it("passes note as undefined when not provided", async () => {
			await service.addFeedback("output-1", "status_change", "user-1");
			expect(repo.feedbackCalls[0].note).toBeUndefined();
		});
	});

	describe("changeStatus", () => {
		it("throws when rejecting without a note", async () => {
			await expect(
				service.changeStatus("output-1", "rejected", "user-1", "draft"),
			).rejects.toThrow("A note is required when rejecting content");
		});

		it("records a status_change feedback event with the note when rejecting", async () => {
			await service.changeStatus("output-1", "rejected", "user-1", "draft", "tone is off");
			expect(repo.feedbackCalls).toHaveLength(1);
			expect(repo.feedbackCalls[0].eventType).toBe("status_change");
			expect(repo.feedbackCalls[0].before).toEqual({ status: "draft" });
			expect(repo.feedbackCalls[0].after).toEqual({ status: "rejected" });
			expect(repo.feedbackCalls[0].note).toBe("tone is off");
		});

		it("allows non-reject changes without a note", async () => {
			await service.changeStatus("output-1", "approved", "user-1", "in_review");
			expect(repo.feedbackCalls).toHaveLength(1);
			expect(repo.feedbackCalls[0].note).toBeUndefined();
		});
	});

	describe("listStatusHistory", () => {
		it("returns newest-first events with user info", async () => {
			await service.changeStatus("o1", "in_review", "u1", "draft", "looks good");
			await new Promise((r) => setTimeout(r, 5));
			await service.changeStatus("o1", "approved", "u2", "in_review");

			const history = await service.listStatusHistory("o1");
			expect(history).toHaveLength(2);
			expect(history[0].after).toEqual({ status: "approved" });
			expect(history[1].after).toEqual({ status: "in_review" });
			expect(history[0].user?.id).toBe("u2");
		});
	});
});
```

`changeStatus` and `listStatusHistory` are the new service methods added in Step 3 below. They don't exist yet — these tests will fail compile.

**Missing repo method mock concern:** the service's existing `updateStatus` method will be called inside the new `changeStatus`. We need to add `updateOutput` and `updateManyOutputStatus` mocks if exercised. Looking at the service code, `updateStatus` calls `generationRepository.updateOutput(id, { status })`. Add to the mock class:

```typescript
	async updateOutput(id: string, data: { status: string }) {
		return { id, status: data.status };
	}
```

Also add an `updateManyOutputStatus` noop if TypeScript complains about the mock not matching `IGenerationRepository`:

```typescript
	async updateManyOutputStatus() { return 0; }
	async archiveManyOutputs() { return 0; }
	async deleteManyOutputs() { return 0; }
	async findOutputsByWorkspace() { return []; }
```

The `as any` cast when constructing `new LibraryService(repo as any)` sidesteps strict interface conformance; these stubs exist only to keep the file lint-clean.

- [ ] **Step 2: Run the tests and verify they fail**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/backend && bun test tests/services/library.service.test.ts 2>&1 | tail -20
```

Expected: tests fail because `service.changeStatus` and `service.listStatusHistory` don't exist, plus the `addFeedback` tests may compile-fail on the 6th arg (note).

- [ ] **Step 3: Update the service interface**

Open `backend/src/interfaces/services/library.service.interface.ts`. Replace with:

```typescript
import type { GenerationOutput, OutputFeedbackEvent } from "@prisma/client";

export interface ILibraryService {
	list(workspaceId: string, status?: string): Promise<any[]>;
	updateStatus(id: string, status: string): Promise<GenerationOutput>;
	changeStatus(
		id: string,
		newStatus: string,
		userId: string,
		oldStatus: string,
		note?: string,
	): Promise<GenerationOutput>;
	listStatusHistory(
		outputId: string,
	): Promise<
		Array<
			OutputFeedbackEvent & {
				user: { id: string; fullName: string | null; email: string } | null;
			}
		>
	>;
	updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	restoreMany(workspaceId: string, ids: string[]): Promise<number>;
	permanentDeleteMany(workspaceId: string, ids: string[]): Promise<number>;
	addFeedback(
		outputId: string,
		eventType: string,
		userId: string,
		before?: any,
		after?: any,
		note?: string,
	): Promise<OutputFeedbackEvent>;
	getSections(outputId: string): Promise<any[]>;
	updateSection(sectionId: string, contentText: string, userId: string): Promise<any>;
	createSection(
		outputId: string,
		sectionType: string,
		contentText: string,
		userId: string,
	): Promise<any>;
}
```

- [ ] **Step 4: Update the service implementation**

Open `backend/src/services/library.service.ts`.

**4a.** Extend `addFeedback` signature. Replace the existing method (around lines 42-72) with:

```typescript
	async addFeedback(
		outputId: string,
		eventType: string,
		userId: string,
		before?: any,
		after?: any,
		note?: string,
	): Promise<OutputFeedbackEvent> {
		const event = await this.generationRepository.addFeedback({
			outputId,
			eventType,
			userId,
			before,
			after,
			note,
		});

		if (this.boss && (eventType === "approve" || eventType === "reject")) {
			const output = await this.generationRepository.findOutputById(outputId);
			if (output) {
				const request = await this.generationRepository.findById((output as any).requestId);
				if (request) {
					await this.boss.send("recommendation-recompute", {
						brandId: request.brandId,
						workspaceId: request.workspaceId,
					});
				}
			}
		}

		return event;
	}
```

**4b.** Add `changeStatus` method just below `updateStatus` (around line 20). This is the new method that validates + records the feedback event:

```typescript
	async changeStatus(
		id: string,
		newStatus: string,
		userId: string,
		oldStatus: string,
		note?: string,
	): Promise<GenerationOutput> {
		if (newStatus === "rejected" && !note?.trim()) {
			throw new Error("A note is required when rejecting content");
		}
		const output = await this.generationRepository.updateOutput(id, { status: newStatus });
		await this.addFeedback(
			id,
			"status_change",
			userId,
			{ status: oldStatus },
			{ status: newStatus },
			note,
		);
		return output;
	}
```

**4c.** Add `listStatusHistory` method at the bottom of the class (before the closing `}`):

```typescript
	async listStatusHistory(outputId: string) {
		return this.generationRepository.findStatusChangesByOutput(outputId);
	}
```

- [ ] **Step 5: Run service tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/backend && bun test tests/services/library.service.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 6: Run full backend suite**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/backend && bun test 2>&1 | tail -5
```

Expected: all existing tests still pass + new library.service tests pass. (1 pre-existing chat failure remains — unrelated.)

- [ ] **Step 7: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/backend && bunx tsc --noEmit 2>&1 | wc -l
```

Expected: 14 baseline.

- [ ] **Step 8: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes && git add backend/src/interfaces/services/library.service.interface.ts backend/src/services/library.service.ts backend/tests/services/library.service.test.ts && git commit -m "feat(library-service): changeStatus with note + listStatusHistory"
```

---

## Task 4: Route — PATCH accepts note; new GET `/:id/history`

**Files:**
- Modify: `backend/src/routes/library.route.ts`

- [ ] **Step 1: Update the PATCH handler**

Open `backend/src/routes/library.route.ts`. Replace the existing PATCH `/:id` handler (around lines 80-89) with:

```typescript
	// PATCH /:id — update status (approve/reject/draft/in_review) — approver-only
	// Optional { note } carried alongside. Required when status === "rejected".
	app.patch("/:id", requireApprover(prisma), async (c) => {
		const userId = c.get("userId");
		const body = await c.req.json();
		const { status, note } = body as { status?: string; note?: string };
		if (!status) {
			return c.json({ error: "status is required" }, 400);
		}
		// Fetch current output to get oldStatus for the history event.
		const existing = await libraryService.list(c.get("workspaceId"));
		const current = existing.find((o: any) => o.id === c.req.param("id"));
		if (!current) {
			return c.json({ error: "Output not found" }, 404);
		}
		try {
			const output = await libraryService.changeStatus(
				c.req.param("id"),
				status,
				userId,
				current.status,
				note,
			);
			return c.json({ data: output });
		} catch (e) {
			return c.json(
				{ error: e instanceof Error ? e.message : "Failed to update status" },
				400,
			);
		}
	});
```

Note: `libraryService.list(workspaceId)` returns all outputs for the workspace — we use it here purely to resolve `oldStatus`. This is a pragmatic reuse; if performance is a concern later, add a `findOutputByIdWithStatus` method.

- [ ] **Step 2: Add the GET `/:id/history` handler**

Immediately after the PATCH handler, add:

```typescript
	// GET /:id/history — status-change history for the output (approver-only)
	app.get("/:id/history", requireApprover(prisma), async (c) => {
		const history = await libraryService.listStatusHistory(c.req.param("id"));
		return c.json({ data: history });
	});
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/backend && bunx tsc --noEmit 2>&1 | wc -l
```

Expected: 14 baseline.

- [ ] **Step 4: Smoke-test the routes (optional but recommended)**

Start the backend (`bun run --hot src/index.ts`) and hit:
- PATCH with `{"status": "rejected"}` and no note → expect 400 with `"A note is required when rejecting content"`
- PATCH with `{"status": "rejected", "note": "try again"}` → expect 200 with updated output
- GET `/history` → expect an array with the event just created

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes && git add backend/src/routes/library.route.ts && git commit -m "feat(library-route): PATCH takes note + GET :id/history"
```

---

## Task 5: Frontend — modal status confirm + history

**Files:**
- Modify: `frontend/src/components/library/ContentPreviewModal.tsx`

- [ ] **Step 1: Add state for the pending status change + history**

In `ContentPreviewModal.tsx`, find the existing state hooks near the top of the component (around lines 60-66). Add three new state declarations immediately after `savingSections`:

```typescript
  // Pending status change — user has picked a new status but hasn't confirmed
  // yet (so they can type a note, or cancel).
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string>("");

  // Status change history, fetched eagerly when the modal opens.
  const [history, setHistory] = useState<
    Array<{
      id: string;
      before: any;
      after: any;
      note: string | null;
      createdAt: string;
      user: { id: string; fullName: string | null; email: string } | null;
    }>
  >([]);
  const [historyOpen, setHistoryOpen] = useState(false);
```

- [ ] **Step 2: Fetch history on modal open**

Add a new `useEffect` right after the existing `useEffect` that syncs `localSections` (around line 73):

```typescript
  useEffect(() => {
    if (!canChangeStatus) return;
    (async () => {
      try {
        const res = await api<{
          data: typeof history;
        }>(`/api/workspaces/${workspaceId}/library/${item.id}/history`);
        setHistory((res as any).data ?? res);
      } catch {
        setHistory([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);
```

Only fetches when the current user can change status — read permissions mirror write permissions here.

- [ ] **Step 3: Replace `handleStatusChange` with a two-step flow**

Find the existing `handleStatusChange` function. Replace it with:

```typescript
  const handleStatusPick = (newStatus: string) => {
    // User picked a value in the dropdown but hasn't confirmed yet.
    if (newStatus === currentStatus) return;
    setPendingStatus(newStatus);
    setStatusNote("");
  };

  const handleCancelStatusChange = () => {
    setPendingStatus(null);
    setStatusNote("");
  };

  const handleConfirmStatusChange = async () => {
    if (!pendingStatus) return;
    if (pendingStatus === "rejected" && !statusNote.trim()) return; // UI button should prevent this, but double-check
    setUpdating(true);
    try {
      const res = await api<{ data: { status: string } }>(
        `/api/workspaces/${workspaceId}/library/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: pendingStatus,
            note: statusNote.trim() || undefined,
          }),
        },
      );
      const updated = (res as any).data ?? res;
      const newStatus = updated.status as string;
      setCurrentStatus(newStatus);
      onStatusChange(item.id, newStatus);
      // Prepend an optimistic history entry so the panel shows it immediately.
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          before: { status: currentStatus },
          after: { status: newStatus },
          note: statusNote.trim() || null,
          createdAt: new Date().toISOString(),
          user: null, // name not known client-side; a refresh can fill it
        },
        ...prev,
      ]);
      setPendingStatus(null);
      setStatusNote("");
      onToast(`Status changed to ${newStatus.replace(/_/g, " ")}`, "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to change status", "error");
    } finally {
      setUpdating(false);
    }
  };
```

- [ ] **Step 4: Update the status dropdown + add the note panel**

Find the existing footer status block. The approver-only `<select>` around lines 524-537 (after Task 4 patches). Replace the `<select>`'s `onChange={(e) => handleStatusChange(e.target.value)}` with:

```tsx
                onChange={(e) => handleStatusPick(e.target.value)}
```

Immediately after the status dropdown container's closing `</div>` (the one that wraps the status icon + select), but **before** the status-footer's closing `</div>`, insert the note panel:

```tsx
              {pendingStatus && (
                <div className="ml-auto flex items-center gap-2 w-full sm:w-auto sm:max-w-md">
                  <textarea
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    rows={2}
                    placeholder={
                      pendingStatus === "rejected"
                        ? "Note (required) — why are you rejecting?"
                        : "Note (optional)"
                    }
                    className="flex-1 px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleCancelStatusChange}
                    disabled={updating}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmStatusChange}
                    disabled={
                      updating ||
                      (pendingStatus === "rejected" && !statusNote.trim())
                    }
                    className="px-2.5 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {updating ? "Saving..." : "Confirm"}
                  </button>
                </div>
              )}
```

The note UI lives inline in the same footer row so it appears right next to the dropdown.

- [ ] **Step 5: Add the history panel below the footer**

After the closing `</div>` of the status footer, but still inside the outer modal container, add:

```tsx
        {!isGeneratorContext && canChangeStatus && history.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3 shrink-0">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${historyOpen ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              History ({history.length})
            </button>
            {historyOpen && (
              <ol className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {history.map((h) => {
                  const oldS = (h.before as any)?.status ?? "—";
                  const newS = (h.after as any)?.status ?? "—";
                  const who = h.user?.fullName || h.user?.email || "Someone";
                  return (
                    <li key={h.id} className="text-xs">
                      <div className="text-gray-700">
                        <span className="font-medium">{who}</span>
                        <span className="text-gray-400"> · </span>
                        <span className="capitalize">{oldS.replace(/_/g, " ")}</span>
                        <span className="text-gray-400"> → </span>
                        <span className="capitalize">{newS.replace(/_/g, " ")}</span>
                        <span className="text-gray-400"> · </span>
                        <span className="text-gray-500">
                          {new Date(h.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {h.note ? (
                        <p className="mt-0.5 pl-2 border-l-2 border-gray-200 text-gray-600">
                          "{h.note}"
                        </p>
                      ) : (
                        <p className="mt-0.5 pl-2 text-gray-400 italic">(no note)</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
```

Note: the `isGeneratorContext` flag from the previous save-and-send feature is reused — history only shown for Library items.

- [ ] **Step 6: Typecheck + build**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/frontend && bunx tsc --noEmit 2>&1 | tail -5
```

Expected: exit 0.

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes/frontend && bun run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-status-notes && git add frontend/src/components/library/ContentPreviewModal.tsx && git commit -m "feat(content-modal): note confirm + status history panel"
```

---

## Task 6: Manual QA

- [ ] **Step 1: Case 1 — Rejection requires a note**

Open `/content-library`, click a content row, change Status to "Rejected" via the dropdown. A note textarea appears. Confirm button is disabled. Type a note, Confirm enables, click → status becomes "Rejected", the new entry appears at the top of the History panel with the note.

- [ ] **Step 2: Case 2 — Optional note for other changes**

Change Status to "Approved" or "In Review". Note textarea appears with placeholder "Note (optional)". Confirm is enabled immediately. Click without typing → status changes, history shows `(no note)` for the entry.

- [ ] **Step 3: Case 3 — Cancel**

Pick a new status, type a note, click Cancel → dropdown does not revert visually (known limitation — fix in follow-up or accept) but no PATCH fires. Click Confirm after cancelling: no request → the dropdown reflects whatever value is shown, pending state cleared.

(If the dropdown-revert UX matters, add a follow-up commit that reverts the dropdown's `value` via `setCurrentStatus(currentStatus)` on Cancel. For now, acceptable scope-wise.)

- [ ] **Step 4: Case 4 — History populates on open**

Close and reopen the modal. History panel shows all past status changes for that item.

- [ ] **Step 5: Case 5 — Reloading the page + re-fetch**

Hard-refresh `/content-library`, reopen the modal → history is fetched from the server (not just optimistic cache). The latest event's user name is populated (the optimistic entry from Case 1 gets replaced).

- [ ] **Step 6: Case 6 — Non-approver**

Log in as a non-approver user. Open a Library item. The status dropdown is replaced by a read-only badge (existing behavior). The History panel is not shown (guarded by `canChangeStatus`). Confirm.

- [ ] **Step 7: Fix anything that broke + merge**

Follow-up commits as `fix(content-modal): <what>` if needed.

---

## Self-review notes

- **Spec coverage:**
  - §1 Schema → Task 1
  - §2 Backend (repo + service + route + history) → Tasks 2, 3, 4
  - §3 Frontend (status confirm + history) → Task 5
  - §5 Tests → Task 3's service test file
- **Placeholder scan:** none of the "TBD / add validation / handle edge cases" anti-patterns. Every step has code.
- **Type consistency:** `note?: string` used identically in repo input, service `addFeedback`, service `changeStatus`, route handler, and PATCH body. `listStatusHistory` return type threads through interface → repo → service → route → frontend.
- **Atomicity:** Task 1 lands schema alone (safe, non-breaking). Task 2 (repo) requires the column and the next task's callers — compiles because the new method is additive and `note` is optional. Task 3 (service) depends on Task 2. Task 4 (route) depends on Task 3. Task 5 (frontend) depends on Task 4. Each commit compiles.
- **Testing gap:** frontend has no automated tests (expected, modal has no existing test harness); manual QA in Task 6.
