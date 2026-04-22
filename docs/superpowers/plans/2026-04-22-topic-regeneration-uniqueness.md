# Topic Regeneration Uniqueness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pass an "avoid list" of batch-sibling topic titles into the regeneration prompt so regenerated topics don't duplicate siblings. Also fix the pre-existing bug where `existingLine` + `hintLine` were computed but never reached the AI.

**Architecture:** Add two optional fields (`avoidTitles: string[]`, `regenerationGuidance: string`) to `TopicGenerationInput`. Teach `buildTopicGenerationPrompt` to render both. Rewrite the regeneration job to pack context into `generationInput` instead of a dead-end local `userPrompt`. Thread the avoid list through service + route. Frontend computes it from current batch state.

**Tech Stack:** TypeScript, Bun test, Hono, pg-boss, React 19.

---

## File Structure

Files to modify:
- `backend/src/interfaces/providers/topic-generator.interface.ts` — extend `TopicGenerationInput` with two optional fields
- `backend/src/utils/prompt-builder.ts` — render avoid block + guidance block in `buildTopicGenerationPrompt`
- `backend/tests/utils/prompt-builder.test.ts` — add 5 tests for the new fields
- `backend/src/jobs/topic-regeneration.job.ts` — pack fields into `generationInput`, remove dead `userPrompt` concat, add `buildRegenerationGuidance` helper, extend `TopicRegenJobData`
- `backend/src/interfaces/services/topic.service.interface.ts` — extend `regenerate` + `regeneratePreview` signatures
- `backend/src/services/topic.service.ts` — forward `avoidTitles` to pg-boss payload
- `backend/tests/services/topic.service.test.ts` — add tests for `avoidTitles` forwarding
- `backend/src/routes/topic.route.ts` — destructure `avoidTitles` from body in both endpoints
- `frontend/src/pages/TopicsPage.tsx` — compute `avoidTitles` from `generatedTopics` state in `handleRegenerateSingle`

No new files. No schema change.

---

## Task 1: Add failing prompt-builder tests

**Files:**
- Modify: `backend/tests/utils/prompt-builder.test.ts`

- [ ] **Step 1: Append the new test block**

Append this to the end of `backend/tests/utils/prompt-builder.test.ts`:

```typescript
describe("buildTopicGenerationPrompt — regeneration context", () => {
	it("omits the avoid block when avoidTitles is undefined", () => {
		const { userPrompt } = buildTopicGenerationPrompt({ ...baseTopicInput });
		expect(userPrompt).not.toContain("CRITICAL UNIQUENESS REQUIREMENT");
	});

	it("omits the avoid block when avoidTitles is an empty array", () => {
		const { userPrompt } = buildTopicGenerationPrompt({
			...baseTopicInput,
			avoidTitles: [],
		});
		expect(userPrompt).not.toContain("CRITICAL UNIQUENESS REQUIREMENT");
	});

	it("renders the avoid block with each title quoted on its own bullet", () => {
		const { userPrompt } = buildTopicGenerationPrompt({
			...baseTopicInput,
			avoidTitles: ["Topic A title", "Topic B title"],
		});
		expect(userPrompt).toContain("CRITICAL UNIQUENESS REQUIREMENT");
		expect(userPrompt).toContain('- "Topic A title"');
		expect(userPrompt).toContain('- "Topic B title"');
		expect(userPrompt).toContain("even with rewording");
	});

	it("omits the guidance block when regenerationGuidance is undefined", () => {
		const { userPrompt } = buildTopicGenerationPrompt({ ...baseTopicInput });
		expect(userPrompt).not.toContain("Original topic being regenerated");
		expect(userPrompt).not.toContain("Additional guidance from the user");
	});

	it("renders the guidance text when regenerationGuidance is provided", () => {
		const { userPrompt } = buildTopicGenerationPrompt({
			...baseTopicInput,
			regenerationGuidance:
				'Original topic being regenerated — generate a DIFFERENT idea: "Foo" — "Bar".\nAdditional guidance from the user: Make it funnier',
		});
		expect(userPrompt).toContain('Original topic being regenerated — generate a DIFFERENT idea: "Foo"');
		expect(userPrompt).toContain("Additional guidance from the user: Make it funnier");
	});
});
```

(This uses the `baseTopicInput` const already defined at the top of the file from previous work.)

- [ ] **Step 2: Run the tests and verify they fail correctly**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/backend && bun test tests/utils/prompt-builder.test.ts 2>&1 | tail -20
```

Expected: the three tests that check for content presence ("renders the avoid block", "renders the guidance text") FAIL because the feature isn't implemented yet and the fields are unknown to `TopicGenerationInput`. The two "omits" tests may PASS (current prompt doesn't contain those strings) — that's fine. DO NOT modify source code in this task.

Note: TypeScript will likely flag `avoidTitles` and `regenerationGuidance` as unknown properties on `TopicGenerationInput`. That's the expected TDD red state.

- [ ] **Step 3: Commit the failing tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness && git add backend/tests/utils/prompt-builder.test.ts && git commit -m "test: prompt-builder avoid list + regeneration guidance (failing)"
```

---

## Task 2: Make the prompt-builder tests pass

**Files:**
- Modify: `backend/src/interfaces/providers/topic-generator.interface.ts` — lines 1-15
- Modify: `backend/src/utils/prompt-builder.ts` — inside `buildTopicGenerationPrompt`, around line 165-186

- [ ] **Step 1: Extend `TopicGenerationInput`**

Replace the entire interface at `backend/src/interfaces/providers/topic-generator.interface.ts` (currently ends at line 15) with:

```typescript
export interface TopicGenerationInput {
	brandContext: string;
	productContexts?: string[];
	skillContext?: string;
	platform?: string;
	objective?: string;
	formats?: string[];
	pillars?: string[];
	language?: string;
	dateFrom?: string;
	dateTo?: string;
	count?: number;
	prompt?: string;
	referenceImages?: string[];
	avoidTitles?: string[];
	regenerationGuidance?: string;
}
```

Everything below (`TopicGenerationOutput`, `ITopicGenerator`) stays the same.

- [ ] **Step 2: Render the avoid + guidance blocks in `buildTopicGenerationPrompt`**

In `backend/src/utils/prompt-builder.ts`, inside `buildTopicGenerationPrompt`. Replace the final `userPrompt` template literal (currently ending at line 186) with:

```typescript
	const humanLanguage = normalizeLanguage(input.language);

	const avoidTitles = input.avoidTitles ?? [];
	const avoidBlock =
		avoidTitles.length === 0
			? ""
			: `\n\nCRITICAL UNIQUENESS REQUIREMENT: The generated topic MUST be substantially different from ALL of the following existing topics. Do NOT duplicate their titles, angles, or key messaging — even with rewording:
${avoidTitles.map((t) => `- "${t}"`).join("\n")}

The new topic should explore a genuinely fresh angle — a different sub-topic, audience moment, or narrative frame.`;

	const guidanceBlock = input.regenerationGuidance
		? `\n\n${input.regenerationGuidance}`
		: "";

	const userPrompt = `CRITICAL LANGUAGE REQUIREMENT: Write every topic's "title" and "description" in ${humanLanguage}. This overrides any language signal in the brand context. Do NOT mix languages within a single topic.

Generate ${count} content topic ideas.
${multiProductLine}
${input.prompt ? `\nAdditional user instructions: ${input.prompt}` : ""}

Return JSON with a single field:
- topics: array of ${count} objects

EVERY topic object MUST contain ALL of these fields. Do NOT leave any field empty or null:

1. "title" (string, REQUIRED): A compelling, specific topic title (5-12 words). Never empty.
2. "description" (string, REQUIRED): 2-3 sentences describing what the content will cover and why it matters to the audience. Never empty.
3. "pillar" (string, REQUIRED): ${pillarInstruction}
4. "platform" (string, REQUIRED): ${platformInstruction}
5. "format" (string, REQUIRED): ${formatInstruction}
6. "objective" (string, REQUIRED): ${objectiveInstruction}
7. "publishDate" (string, REQUIRED): ${dateInstruction}

CRITICAL: Every field above is MANDATORY for every topic. If you cannot determine a value from the brand context, make a reasonable, on-brand choice — but never leave a field empty, null, or missing.

Make topics diverse, engaging, and aligned with the brand voice.${avoidBlock}${guidanceBlock}`;

	return { systemPrompt, userPrompt };
}
```

Only the last paragraph of the template literal changes: `brand voice.` now has `${avoidBlock}${guidanceBlock}` appended.

- [ ] **Step 3: Run the tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/backend && bun test tests/utils/prompt-builder.test.ts 2>&1 | tail -15
```

Expected: all tests PASS (the 8 pre-existing pillar tests + 5 new regeneration-context tests = 13 total).

- [ ] **Step 4: Run backend typecheck, confirm baseline unchanged**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/backend && bunx tsc --noEmit 2>&1 | wc -l
```

Expected: 14 (the pre-existing unrelated error baseline). If higher, a new error was introduced — investigate.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness && git add backend/src/interfaces/providers/topic-generator.interface.ts backend/src/utils/prompt-builder.ts && git commit -m "feat(topics): avoid-list + regeneration-guidance in prompt builder"
```

---

## Task 3: Fix the regeneration job

**Files:**
- Modify: `backend/src/jobs/topic-regeneration.job.ts` — the `TopicRegenJobData` interface (around line 8-21), the destructuring (around line 32-45), and the prompt-assembly section (around line 85-113)

- [ ] **Step 1: Extend `TopicRegenJobData`**

In `backend/src/jobs/topic-regeneration.job.ts`, find the `TopicRegenJobData` interface and add `avoidTitles?: string[];`:

```typescript
interface TopicRegenJobData {
	workspaceId: string;
	topicId?: string;
	brandId?: string;
	productIds?: string[];
	platform?: string;
	format?: string;
	objective?: string;
	pillar?: string;
	language?: string;
	hint?: string;
	preview: boolean;
	userId: string;
	avoidTitles?: string[];
}
```

- [ ] **Step 2: Destructure `avoidTitles` from `data`**

Find the destructuring block inside `handle(data: TopicRegenJobData)` and add `avoidTitles`:

```typescript
		const {
			workspaceId,
			topicId,
			brandId,
			productIds,
			platform,
			format,
			objective,
			pillar,
			language,
			hint,
			preview,
			userId,
			avoidTitles,
		} = data;
```

- [ ] **Step 3: Add the `buildRegenerationGuidance` helper**

At the bottom of the file (outside the `TopicRegenerationJob` class), add:

```typescript
function buildRegenerationGuidance(
	existingTitle: string,
	existingDescription: string,
	hint?: string,
): string | undefined {
	const parts: string[] = [];
	if (existingTitle) {
		parts.push(
			`Original topic being regenerated — generate a DIFFERENT idea: "${existingTitle}" — "${existingDescription}".`,
		);
	}
	if (hint) parts.push(`Additional guidance from the user: ${hint}`);
	return parts.length > 0 ? parts.join("\n") : undefined;
}
```

- [ ] **Step 4: Rewrite the prompt-assembly section**

Find the block that starts with `// Build a single-topic generation prompt with hint` and ends just before `// Generate single topic` (currently around line 85-105). Replace that entire block with:

```typescript
			// Pack regeneration context into generationInput so the prompt builder
			// actually renders it. The earlier code computed a userPrompt string
			// locally but then passed only generationInput to generate() — the
			// extra context was silently dropped.
			const generationInput = {
				brandContext,
				productContexts: productContexts.length > 0 ? productContexts : undefined,
				platform,
				objective,
				formats: format ? [format] : undefined,
				pillars: pillar ? [pillar] : undefined,
				language,
				count: 1,
				avoidTitles: avoidTitles && avoidTitles.length > 0 ? avoidTitles : undefined,
				regenerationGuidance: buildRegenerationGuidance(
					existingTitle,
					existingDescription,
					hint,
				),
			};

			const { systemPrompt, userPrompt } = buildTopicGenerationPrompt(generationInput);
```

The `existingLine`, `hintLine`, and the dead-end concatenated `userPrompt` (the one that was overwritten) are all removed. The `userPrompt` variable now comes directly from `buildTopicGenerationPrompt` and is authoritative — both for the AI call and for AI-activity logging.

- [ ] **Step 5: Ensure the `generate` call still uses `generationInput`**

The subsequent line that calls `topicGenerator.generate(...)` should already look like:

```typescript
			const output = await topicGenerator.generate({
				...generationInput,
				count: 1,
			});
```

No change needed there — `count: 1` is already in `generationInput`, so the spread is harmless but we don't touch it to minimize diff.

- [ ] **Step 6: Run the backend test suite**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/backend && bun test 2>&1 | tail -5
```

Expected: full suite passes (counts match the baseline 116 pass + 1 pre-existing fail, plus the 5 new prompt-builder tests = 121/1).

- [ ] **Step 7: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/backend && bunx tsc --noEmit 2>&1 | wc -l
```

Expected: 14 (baseline unchanged).

- [ ] **Step 8: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness && git add backend/src/jobs/topic-regeneration.job.ts && git commit -m "fix(topics): regeneration actually passes context + avoid list to AI"
```

---

## Task 4: Thread `avoidTitles` through service + route + service test

**Files:**
- Modify: `backend/src/interfaces/services/topic.service.interface.ts` — `regenerate` + `regeneratePreview` signatures
- Modify: `backend/src/services/topic.service.ts` — both regenerate methods
- Modify: `backend/src/routes/topic.route.ts` — both regenerate endpoints
- Modify: `backend/tests/services/topic.service.test.ts` — add forwarding tests

- [ ] **Step 1: Update the service interface**

Edit `backend/src/interfaces/services/topic.service.interface.ts`. Replace the `regenerate` and `regeneratePreview` entries:

```typescript
	regenerate(
		workspaceId: string,
		userId: string,
		topicId: string,
		hint?: string,
		avoidTitles?: string[],
	): Promise<{ jobId: string }>;
	regeneratePreview(
		workspaceId: string,
		userId: string,
		params: {
			brandId?: string;
			productIds?: string[];
			platform?: string;
			format?: string;
			objective?: string;
			pillar?: string;
			language?: string;
			avoidTitles?: string[];
		},
		hint?: string,
	): Promise<{ jobId: string }>;
```

(`regenerate` gets a new trailing arg; `regeneratePreview` puts `avoidTitles` inside the `params` object for symmetry with the rest of the regeneration-preview inputs.)

- [ ] **Step 2: Update the service implementation**

In `backend/src/services/topic.service.ts`, update both methods.

Replace `regenerate` (currently lines 75-101):

```typescript
	async regenerate(
		workspaceId: string,
		userId: string,
		topicId: string,
		hint?: string,
		avoidTitles?: string[],
	): Promise<{ jobId: string }> {
		const topic = await this.topicRepository.findById(topicId);
		if (!topic) {
			throw new Error("Topic not found");
		}

		const jobId = await this.boss.send("topic-regeneration", {
			workspaceId,
			topicId,
			brandId: topic.brandId,
			productIds: topic.products?.map((p) => p.product.id) ?? [],
			platform: topic.platform,
			format: topic.format,
			objective: topic.objective,
			pillar: topic.pillar ?? undefined,
			hint,
			preview: false,
			userId,
			avoidTitles,
		});

		return { jobId: jobId ?? "queued" };
	}
```

Replace `regeneratePreview` (currently lines 103-132):

```typescript
	async regeneratePreview(
		workspaceId: string,
		userId: string,
		params: {
			brandId?: string;
			productIds?: string[];
			platform?: string;
			format?: string;
			objective?: string;
			pillar?: string;
			language?: string;
			avoidTitles?: string[];
		},
		hint?: string,
	): Promise<{ jobId: string }> {
		const jobId = await this.boss.send("topic-regeneration", {
			workspaceId,
			brandId: params.brandId,
			productIds: params.productIds ?? [],
			platform: params.platform,
			format: params.format,
			objective: params.objective,
			pillar: params.pillar,
			language: params.language,
			hint,
			preview: true,
			userId,
			avoidTitles: params.avoidTitles,
		});

		return { jobId: jobId ?? "queued" };
	}
```

- [ ] **Step 3: Update the route**

Edit `backend/src/routes/topic.route.ts`.

In the `/regenerate-preview` POST handler, add `avoidTitles` to the body destructure and the service-call params:

```typescript
	app.post("/regenerate-preview", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = await c.req.json();
		const { brandId, productIds, platform, format, objective, pillar, language, hint, avoidTitles } =
			body;
		const result = await topicService.regeneratePreview(
			workspaceId,
			userId,
			{ brandId, productIds, platform, format, objective, pillar, language, avoidTitles },
			hint,
		);
		return c.json({ data: result }, 202);
	});
```

In the `/:id/regenerate` POST handler, add `avoidTitles` to the body destructure and forward:

```typescript
	app.post("/:id/regenerate", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const topicId = c.req.param("id");
		const body = await c.req.json().catch(() => ({}));
		const { hint, avoidTitles } = body;
		const result = await topicService.regenerate(workspaceId, userId, topicId, hint, avoidTitles);
		return c.json({ data: result }, 202);
	});
```

- [ ] **Step 4: Add service tests for avoidTitles forwarding**

Edit `backend/tests/services/topic.service.test.ts`. Inside `describe("regenerate", ...)` add this block immediately after the existing "should enqueue topic-regeneration job for a saved topic" test:

```typescript
		it("forwards avoidTitles to the job payload", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const topic = await service.create(workspaceId, { title: "Old idea" });

			await service.regenerate(workspaceId, userId, topic.id, undefined, [
				"Sibling A",
				"Sibling B",
			]);

			expect(boss.sentJobs).toHaveLength(1);
			const jobData = boss.sentJobs[0].data as any;
			expect(jobData.avoidTitles).toEqual(["Sibling A", "Sibling B"]);
		});
```

Inside `describe("regeneratePreview", ...)` add this block immediately after the existing "should enqueue topic-regeneration job with preview flag" test:

```typescript
		it("forwards avoidTitles to the job payload", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();

			await service.regeneratePreview(
				workspaceId,
				userId,
				{
					brandId: crypto.randomUUID(),
					platform: "instagram",
					format: "reels",
					avoidTitles: ["Sibling A", "Sibling B"],
				},
				undefined,
			);

			expect(boss.sentJobs).toHaveLength(1);
			const jobData = boss.sentJobs[0].data as any;
			expect(jobData.avoidTitles).toEqual(["Sibling A", "Sibling B"]);
		});
```

- [ ] **Step 5: Run service tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/backend && bun test tests/services/topic.service.test.ts 2>&1 | tail -10
```

Expected: all tests PASS (the existing ones plus the 2 new forwarding tests).

- [ ] **Step 6: Run full backend test suite + typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/backend && bun test 2>&1 | tail -5 && bunx tsc --noEmit 2>&1 | wc -l
```

Expected: 123 pass + 1 pre-existing fail; typecheck error count = 14 (baseline).

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness && git add backend/src/interfaces/services/topic.service.interface.ts backend/src/services/topic.service.ts backend/src/routes/topic.route.ts backend/tests/services/topic.service.test.ts && git commit -m "feat(topics): thread avoidTitles through service + route"
```

---

## Task 5: Frontend — compute and send `avoidTitles` from batch state

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx` — inside `handleRegenerateSingle`

- [ ] **Step 1: Update `handleRegenerateSingle`**

Find the `handleRegenerateSingle` function (around line 308 based on prior reads — search for `const handleRegenerateSingle`). Replace the entire body with:

```typescript
	const handleRegenerateSingle = async (topicId: string) => {
		if (!activeWorkspace) return;
		setRegeneratingTopicId(topicId);
		regeneratingTopicIdRef.current = topicId;
		setShowRegenInput(null);
		try {
			const topic = generatedTopics.find((t) => t.id === topicId);
			const avoidTitles = generatedTopics
				.filter((t) => t.id !== topicId && t.title?.trim())
				.map((t) => t.title);
			await api(
				`/api/workspaces/${activeWorkspace.id}/topics/regenerate-preview`,
				{
					method: "POST",
					body: JSON.stringify({
						brandId,
						productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
						platform: topic?.platform || platform || undefined,
						format: topic?.format || undefined,
						objective: topic?.objective || objective || undefined,
						pillar: topic?.pillar || selectedPillars[0] || undefined,
						language,
						hint: regenHints[topicId] || undefined,
						avoidTitles: avoidTitles.length > 0 ? avoidTitles : undefined,
					}),
				}
			);
			setRegenHints((prev) => ({ ...prev, [topicId]: "" }));
		} catch (e) {
			showToast(e instanceof Error ? e.message : "Regeneration failed", "error");
			setRegeneratingTopicId(null);
			regeneratingTopicIdRef.current = null;
		}
	};
```

Only change: the new `avoidTitles` computation before the `await`, and the new `avoidTitles: avoidTitles.length > 0 ? avoidTitles : undefined,` field inside the JSON body. Everything else is identical.

- [ ] **Step 2: Run frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/frontend && npx tsc --noEmit 2>&1 | tail -5
```

Expected: exit 0, no output.

- [ ] **Step 3: Run the frontend build as a broader sanity check**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness && git add frontend/src/pages/TopicsPage.tsx && git commit -m "feat(topics-ui): send avoidTitles from current batch on regenerate"
```

---

## Task 6: End-to-end verification

**Files:** (no edits; run checks)

- [ ] **Step 1: Run all backend tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/backend && bun test 2>&1 | tail -5
```

Expected: everything passes except the 1 pre-existing chat.service.test.ts failure.

- [ ] **Step 2: Backend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/backend && bunx tsc --noEmit 2>&1 | wc -l
```

Expected: 14 (baseline).

- [ ] **Step 3: Frontend typecheck + build**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/regen-uniqueness/frontend && npx tsc --noEmit 2>&1 | tail -3 && npm run build 2>&1 | tail -5
```

Expected: both clean.

- [ ] **Step 4: Manual smoke test**

Start the backend (`cd backend && bun run --hot src/index.ts`) and frontend (`cd frontend && npm run dev`).

1. Open `/topics`. Pick a brand with multiple pillars.
2. Generate a batch of topics (e.g. count=5).
3. Pick one topic and click the regenerate button. **Expected:** the resulting topic should NOT be a near-paraphrase of any of the other 4 topics still on screen.
4. Type a hint (e.g. "Make it funnier") and regenerate again. **Expected:** the new topic reflects the hint — previously (pre-fix) the hint was silently dropped.
5. Open the AI Activity Log (Workspace Settings → AI Activity, or inspect `ai_provider_logs`). For the regenerate you just ran, inspect the logged `userPrompt`. **Expected:** contains a "CRITICAL UNIQUENESS REQUIREMENT" section with the other 4 sibling titles as bullet items, and an "Original topic being regenerated" line referencing the original.

- [ ] **Step 5: If all cases pass, nothing to commit**

If the smoke test reveals a regression, fix it with a targeted commit (`fix(topics): <what>`) and re-run the failing case.

---

## Self-review notes

- **Spec coverage:**
  - "Interface changes" (§1) → Task 2 Step 1.
  - "Prompt-builder changes" (§2) → Task 1 (failing tests) + Task 2 Step 2 (impl).
  - "Job changes" (§3) → Task 3.
  - "Route + service" (§4) → Task 4 Steps 1–3.
  - "Frontend" (§5) → Task 5.
  - "Tests" (§6) → Task 1 (prompt-builder tests) + Task 4 Step 4 (service forwarding tests).
- **Placeholder scan:** no TBD/TODO. Every step has concrete code.
- **Type consistency:** `avoidTitles: string[]` used identically across interface, prompt builder, job, service (via params), route, and frontend. `regenerationGuidance: string` used identically across interface, prompt builder, job helper, and tests. The `buildRegenerationGuidance` helper has a stable signature.
- **Atomicity per commit:**
  - Task 2 ships the interface + prompt builder. No caller uses the new fields yet. Compiles. Prompt-builder tests go green. The wider app still behaves exactly as before (regeneration job hasn't been updated).
  - Task 3 flips the regeneration job to pack context. Behavior change: the AI now gets "Original topic" guidance even if no avoidTitles are passed yet. Hint also starts working.
  - Task 4 exposes the field to the outer API. No frontend call sends it yet.
  - Task 5 wires the frontend. Now the full feature is active.
  - Each commit leaves the app compiling and tests passing.
