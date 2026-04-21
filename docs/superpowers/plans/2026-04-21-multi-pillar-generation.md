# Multi-pillar Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Topic Generator accept multiple pillars and make the Content Generator actually steer output via pillar(s) in the prompt.

**Architecture:** Rename the generation input `pillar?: string` → `pillars?: string[]` end-to-end for topic generation. Teach `buildTopicGenerationPrompt` to switch between three branches (0 pillars = mix all brand pillars, 1 pillar = locked, 2+ = distribute across the chosen subset). Add a new pillar section to `buildContentGenerationPrompt` driven by a `pillars: string[]` input resolved on the frontend (topic's pillar if a topic is selected, otherwise all brand pillars from the active brain).

**Tech Stack:** TypeScript, Bun test, Hono, pg-boss, Prisma 7, React 19, Vite.

---

## File Structure

Files to create:
- `backend/tests/utils/prompt-builder.test.ts` — unit tests for the prompt-builder's new branching logic (topic + content)

Files to modify:
- `backend/src/interfaces/providers/topic-generator.interface.ts` — `pillar?: string` → `pillars?: string[]` on `TopicGenerationInput`
- `backend/src/interfaces/providers/content-generator.interface.ts` — add `pillars?: string[]` to `ContentGenerationInput`
- `backend/src/utils/prompt-builder.ts` — new pillar branching in `buildTopicGenerationPrompt`; new pillar section in `buildContentGenerationPrompt`
- `backend/src/types/topic.types.ts` — `GenerateTopicsInput.pillar` → `pillars?: string[]`
- `backend/src/types/generation.types.ts` — add `pillars?: string[]` to `CreateGenerationInput`
- `backend/src/services/topic.service.ts` — forward `pillars` instead of `pillar`
- `backend/src/services/generation.service.ts` — forward `pillars` to the content-generation job
- `backend/src/jobs/topic-generation.job.ts` — `TopicJobData.pillars`, pass to prompt input
- `backend/src/jobs/topic-regeneration.job.ts` — keep single-pillar input (it regenerates one topic); wrap as `[pillar]` when calling the prompt
- `backend/src/jobs/content-generation.job.ts` — `ContentJobData.pillars`, pass to generation input
- `backend/src/routes/topic.route.ts` — accept `pillars` in POST `/generate` body (remove `pillar`)
- `backend/src/routes/generation.route.ts` — accept `pillars` in POST `/` body
- `backend/tests/services/topic.service.test.ts` — update the `forwards pillar…` test to assert `pillars`
- `frontend/src/pages/TopicsPage.tsx` — `selectedPillars: string[]` multi-select chip UI; send `pillars` in body
- `frontend/src/pages/GeneratePage.tsx` — fetch active-brain `contentPillars`, resolve `pillars` on submit, send in body, show "Mixed (all brand pillars)" line when no topic is selected

---

## Task 1: Write tests for topic prompt multi-pillar

**Files:**
- Create: `backend/tests/utils/prompt-builder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/utils/prompt-builder.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import {
	buildContentGenerationPrompt,
	buildTopicGenerationPrompt,
} from "../../src/utils/prompt-builder";

const baseTopicInput = {
	brandContext: "{}",
	language: "en",
	count: 3,
};

describe("buildTopicGenerationPrompt — pillars", () => {
	it("uses the 'mix across all brand pillars' instruction when pillars is undefined", () => {
		const { userPrompt } = buildTopicGenerationPrompt({ ...baseTopicInput });
		expect(userPrompt).toContain("Pick one appropriate pillar from the brand's pillar list");
		expect(userPrompt).toContain("Distribute topics across multiple pillars for variety");
	});

	it("uses the 'mix across all brand pillars' instruction when pillars is an empty array", () => {
		const { userPrompt } = buildTopicGenerationPrompt({ ...baseTopicInput, pillars: [] });
		expect(userPrompt).toContain("Pick one appropriate pillar from the brand's pillar list");
	});

	it("locks every topic to a single pillar when pillars has exactly one entry", () => {
		const { userPrompt } = buildTopicGenerationPrompt({
			...baseTopicInput,
			pillars: ["Education"],
		});
		expect(userPrompt).toContain('Use EXACTLY this pillar for every topic: "Education"');
		expect(userPrompt).toContain('Every topic\'s "pillar" field must be the exact string "Education"');
	});

	it("distributes topics across the provided pillars when pillars has 2+ entries", () => {
		const { userPrompt } = buildTopicGenerationPrompt({
			...baseTopicInput,
			pillars: ["Education", "Lifestyle", "Product Features"],
		});
		expect(userPrompt).toContain(
			'set the pillar field to exactly one of: "Education", "Lifestyle", "Product Features"',
		);
		expect(userPrompt).toContain("Distribute topics across these pillars for variety");
		expect(userPrompt).toContain("Do not invent or use any other pillars");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && bun test tests/utils/prompt-builder.test.ts`
Expected: tests fail — the `pillars` field is not yet supported by `TopicGenerationInput`, so TypeScript compile errors or assertions fail.

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/tests/utils/prompt-builder.test.ts
git commit -m "test: prompt-builder multi-pillar topic branches (failing)"
```

---

## Task 2: Update topic prompt builder + interface + topic jobs for `pillars`

This is one commit because the interface change breaks both callers (both jobs) and they must land together.

**Files:**
- Modify: `backend/src/interfaces/providers/topic-generator.interface.ts:8`
- Modify: `backend/src/utils/prompt-builder.ts:111-176` (specifically the pillar-instruction block at lines 142-144)
- Modify: `backend/src/jobs/topic-generation.job.ts` — `TopicJobData` interface, destructuring, generationInput
- Modify: `backend/src/jobs/topic-regeneration.job.ts` — pass `pillars: pillar ? [pillar] : undefined` to the prompt input

- [ ] **Step 1: Update `TopicGenerationInput` interface**

Edit `backend/src/interfaces/providers/topic-generator.interface.ts`:

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
}
```

(Replace `pillar?: string;` with `pillars?: string[];` on the line currently at position 8.)

- [ ] **Step 2: Update `buildTopicGenerationPrompt` pillar branching**

Edit `backend/src/utils/prompt-builder.ts`. Replace the existing 3-line `pillarInstruction` assignment at lines 142-144:

```typescript
const pillars = input.pillars ?? [];
const pillarInstruction =
	pillars.length === 0
		? `Pick one appropriate pillar from the brand's pillar list in the brand context. Distribute topics across multiple pillars for variety. Never leave empty.`
		: pillars.length === 1
			? `Use EXACTLY this pillar for every topic: "${pillars[0]}". Every topic's "pillar" field must be the exact string "${pillars[0]}". Do not invent other pillars.`
			: `For every topic, set the pillar field to exactly one of: ${pillars.map((p) => `"${p}"`).join(", ")}. Distribute topics across these pillars for variety. Do not invent or use any other pillars.`;
```

- [ ] **Step 3: Update `TopicJobData` + topic-generation job**

Edit `backend/src/jobs/topic-generation.job.ts`:

Replace `pillar?: string;` on line 17 with:

```typescript
	pillars?: string[];
```

Replace `pillar,` in the destructuring at line 44 with:

```typescript
			pillars,
```

Replace `pillar,` inside the `generationInput` object (currently line 199) with:

```typescript
				pillars,
```

- [ ] **Step 4: Update topic-regeneration job**

Edit `backend/src/jobs/topic-regeneration.job.ts`.

The regeneration job regenerates **one** topic, so its own data payload stays single-pillar (`pillar?: string`). Only the call into `buildTopicGenerationPrompt` needs to pass `pillars: string[]`.

Replace `pillar,` inside the `generationInput` object (currently line 97) with:

```typescript
			pillars: pillar ? [pillar] : undefined,
```

Leave `TopicRegenJobData.pillar` and the destructured `pillar` as-is — they still represent the original topic's single pillar value.

- [ ] **Step 5: Run prompt-builder tests to verify they pass**

Run: `cd backend && bun test tests/utils/prompt-builder.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 6: Run typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: exit 0 (no errors).

- [ ] **Step 7: Commit**

```bash
git add backend/src/interfaces/providers/topic-generator.interface.ts backend/src/utils/prompt-builder.ts backend/src/jobs/topic-generation.job.ts backend/src/jobs/topic-regeneration.job.ts
git commit -m "feat(topics): multi-pillar prompt branching"
```

---

## Task 3: Update topic service + route + service test for `pillars`

**Files:**
- Modify: `backend/src/types/topic.types.ts:19`
- Modify: `backend/src/services/topic.service.ts:62`
- Modify: `backend/src/routes/topic.route.ts:63,77`
- Modify: `backend/tests/services/topic.service.test.ts:86-105`

- [ ] **Step 1: Update `GenerateTopicsInput` type**

Edit `backend/src/types/topic.types.ts`. Replace `pillar?: string;` on line 19 with:

```typescript
	pillars?: string[];
```

(The `CreateTopicInput.pillar` on line 6 and `UpdateTopicInput.pillar` on line 31 stay as-is — single-topic rows still carry a single pillar.)

- [ ] **Step 2: Update `TopicService.generate` to forward `pillars`**

Edit `backend/src/services/topic.service.ts`. Replace `pillar: input.pillar,` on line 62 with:

```typescript
			pillars: input.pillars,
```

- [ ] **Step 3: Update the topic route to accept `pillars`**

Edit `backend/src/routes/topic.route.ts`. In the POST `/generate` handler, replace `pillar,` on line 63 (in the destructuring) and line 77 (in the service call) with:

```typescript
			pillars,
```

Line 63 becomes part of `const { brandId, productIds, platform, objective, formats, pillars, language, dateFrom, dateTo, count, prompt, referenceImages } = body;` — just rename `pillar` → `pillars` in that destructuring.

Line 77 becomes `pillars,` inside the `topicService.generate` argument object.

- [ ] **Step 4: Update the service test**

Edit `backend/tests/services/topic.service.test.ts`. Replace the entire `it("forwards pillar to the job queue", ...)` block (currently lines 86-105) with:

```typescript
		it("forwards pillars to the job queue", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const sent: any[] = [];
			const fakeBoss = {
				send: async (_q: string, data: any) => {
					sent.push(data);
					return "job-id";
				},
			} as any;
			const service = new TopicService(repo as any, fakeBoss);
			await service.generate(workspaceId, userId, {
				brandId: "b1",
				pillars: ["Education", "Lifestyle"],
				count: 5,
			});
			expect(sent).toHaveLength(1);
			expect(sent[0].pillars).toEqual(["Education", "Lifestyle"]);
			expect(sent[0].count).toBe(5);
		});
```

- [ ] **Step 5: Run the service tests**

Run: `cd backend && bun test tests/services/topic.service.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Run full backend typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/types/topic.types.ts backend/src/services/topic.service.ts backend/src/routes/topic.route.ts backend/tests/services/topic.service.test.ts
git commit -m "feat(topics): rename generate input pillar -> pillars (string[])"
```

---

## Task 4: Update TopicsPage for multi-pillar select

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx` — around lines 123, 178-208, 276, 493-527

- [ ] **Step 1: Rename state from `selectedPillar` to `selectedPillars`**

Edit `frontend/src/pages/TopicsPage.tsx`. Replace line 123:

```typescript
	const [selectedPillar, setSelectedPillar] = useState<string>("");
```

with:

```typescript
	const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
```

- [ ] **Step 2: Reset the array (not "") when brand changes**

In the `useEffect` that fetches content pillars (around lines 178-208), replace the `setSelectedPillar("")` call with:

```typescript
			setSelectedPillars([]);
```

- [ ] **Step 3: Update the generate POST body**

In `handleGenerate` around line 276, replace:

```typescript
						pillar: selectedPillar || undefined,
```

with:

```typescript
						pillars: selectedPillars.length > 0 ? selectedPillars : undefined,
```

- [ ] **Step 4: Update the chip UI block**

Replace the existing pillar chip block (lines 493-527) with:

```tsx
							{brandId && contentPillars.length > 0 && (
								<div className="pt-3 border-t border-gray-100">
									<div className="flex items-center justify-between mb-2">
										<label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
											Brand Content Pillars
										</label>
										<span className="text-[10px] text-gray-400">
											{selectedPillars.length === 0
												? "Mixed (all pillars)"
												: `Selected: ${selectedPillars.join(", ")}`}
										</span>
									</div>
									<div className="flex flex-wrap gap-1.5">
										{contentPillars.map((p, i) => {
											const isSelected = selectedPillars.includes(p);
											return (
												<button
													key={p}
													type="button"
													onClick={() =>
														setSelectedPillars((prev) =>
															prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
														)
													}
													className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
														isSelected
															? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
															: `${PILLAR_COLORS[i % PILLAR_COLORS.length]} border-transparent hover:border-gray-300`
													}`}
												>
													{p}
												</button>
											);
										})}
									</div>
									<p className="text-[10px] text-gray-400 mt-1.5">
										Pick one or more pillars, or leave blank to mix across all.
									</p>
								</div>
							)}
```

- [ ] **Step 5: Keep single-pillar semantics for the per-topic regenerate call**

The `handleRegenerateSingle` function (around line 325) regenerates a single topic and sends `pillar: topic?.pillar || selectedPillar || undefined` — `selectedPillar` no longer exists. Replace line 325:

```typescript
						pillar: topic?.pillar || selectedPillar || undefined,
```

with:

```typescript
						pillar: topic?.pillar || selectedPillars[0] || undefined,
```

(Regenerating one topic picks the first multi-selected pillar if the topic itself doesn't have one — a pragmatic fallback; the regenerate-preview route still accepts a single `pillar` and is out of scope for multi-select.)

- [ ] **Step 6: Run frontend typecheck**

Run: `cd frontend && npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/TopicsPage.tsx
git commit -m "feat(topics-ui): multi-pillar chip selection"
```

---

## Task 5: Write tests for content prompt pillar section

**Files:**
- Modify: `backend/tests/utils/prompt-builder.test.ts` (append a new `describe` block)

- [ ] **Step 1: Append failing content-prompt tests**

Append to `backend/tests/utils/prompt-builder.test.ts`:

```typescript
const baseContentInput = {
	brandContext: "{}",
	platform: "instagram",
	contentType: "carousel",
	framework: "aida",
	hookType: "question",
	language: "en",
};

describe("buildContentGenerationPrompt — pillars", () => {
	it("omits the pillar section when pillars is undefined", () => {
		const { userPrompt } = buildContentGenerationPrompt({ ...baseContentInput });
		expect(userPrompt).not.toContain("brand pillar");
		expect(userPrompt).not.toContain("content pillar");
	});

	it("omits the pillar section when pillars is an empty array", () => {
		const { userPrompt } = buildContentGenerationPrompt({ ...baseContentInput, pillars: [] });
		expect(userPrompt).not.toContain("brand pillar");
		expect(userPrompt).not.toContain("content pillar");
	});

	it("uses the single-pillar instruction when pillars has one entry", () => {
		const { userPrompt } = buildContentGenerationPrompt({
			...baseContentInput,
			pillars: ["Education"],
		});
		expect(userPrompt).toContain(
			'This content should reinforce the brand pillar: "Education"',
		);
	});

	it("uses the multi-pillar instruction when pillars has 2+ entries", () => {
		const { userPrompt } = buildContentGenerationPrompt({
			...baseContentInput,
			pillars: ["Education", "Lifestyle"],
		});
		expect(userPrompt).toContain(
			'Align this content with one of the brand\'s content pillars: "Education", "Lifestyle"',
		);
		expect(userPrompt).toContain("Pick the one that best fits");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && bun test tests/utils/prompt-builder.test.ts`
Expected: the 4 new content-prompt tests FAIL (feature not implemented yet). The earlier 4 topic-prompt tests from Task 1/2 still PASS.

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/tests/utils/prompt-builder.test.ts
git commit -m "test: content prompt pillar section (failing)"
```

---

## Task 6: Implement content prompt pillar section

**Files:**
- Modify: `backend/src/interfaces/providers/content-generator.interface.ts:1-13` (add `pillars`)
- Modify: `backend/src/utils/prompt-builder.ts:59-88` (buildContentGenerationPrompt)

- [ ] **Step 1: Add `pillars` to `ContentGenerationInput`**

Edit `backend/src/interfaces/providers/content-generator.interface.ts`. Replace the interface with:

```typescript
export interface ContentGenerationInput {
	brandContext: string;
	productContext?: string;
	skillContext?: string;
	platform: string;
	contentType: string;
	framework: string;
	hookType: string;
	language: string;
	prompt?: string;
	referenceImages?: string[];
	researchContext?: string;
	pillars?: string[];
}
```

- [ ] **Step 2: Add the pillar section to `buildContentGenerationPrompt`**

Edit `backend/src/utils/prompt-builder.ts`. Replace the entire `buildContentGenerationPrompt` function (starting at line 59) with:

```typescript
export function buildContentGenerationPrompt(input: ContentGenerationInput): PromptPair {
	const contextBlock = buildContextBlock(input);
	// Resolve the canonical contentType (e.g. "reels", "tiktok_video") to a
	// format category ("video", "carousel", "story", "single_image") so the
	// prompt matches the actual output shape the AI should produce.
	const formatCategory = getContentFormatCategory(input.contentType);
	const formatInstruction =
		CONTENT_TYPE_FORMAT_INSTRUCTIONS[formatCategory] ||
		CONTENT_TYPE_FORMAT_INSTRUCTIONS.single_image;

	const systemPrompt = `You are an expert content creator. You have the following brand context:
${contextBlock}

${JSON_ONLY_INSTRUCTION}`;

	const humanLanguage = normalizeLanguage(input.language);

	const pillars = input.pillars ?? [];
	const pillarLine =
		pillars.length === 0
			? ""
			: pillars.length === 1
				? `\nThis content should reinforce the brand pillar: "${pillars[0]}".`
				: `\nAlign this content with one of the brand's content pillars: ${pillars.map((p) => `"${p}"`).join(", ")}. Pick the one that best fits the requested platform, format, and objective.`;

	const userPrompt = `CRITICAL LANGUAGE REQUIREMENT: Write ALL user-facing copy (hook, caption, CTA, hashtags, slide/scene text, on-screen text, voiceover) in ${humanLanguage}. This overrides any language signal in the brand context. Do NOT switch languages mid-output.

Create ${input.contentType} content for ${input.platform} platform.
Framework: ${input.framework}
Hook type: ${input.hookType}
Language: ${humanLanguage}${pillarLine}
${input.prompt ? `\nAdditional instructions: ${input.prompt}` : ""}

${formatInstruction}

Apply the ${input.framework} framework and use a ${input.hookType} hook style.`;

	return { systemPrompt, userPrompt };
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd backend && bun test tests/utils/prompt-builder.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 4: Run typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/interfaces/providers/content-generator.interface.ts backend/src/utils/prompt-builder.ts
git commit -m "feat(content): add pillar section to content-generation prompt"
```

---

## Task 7: Thread `pillars` through generation types, service, route, and job

**Files:**
- Modify: `backend/src/types/generation.types.ts:1-18`
- Modify: `backend/src/services/generation.service.ts:37-71`
- Modify: `backend/src/routes/generation.route.ts:14-40`
- Modify: `backend/src/jobs/content-generation.job.ts:11-17,205-216`
- Modify: `backend/tests/services/generation.service.test.ts`

- [ ] **Step 1: Extend `CreateGenerationInput`**

Edit `backend/src/types/generation.types.ts`. Replace the interface with:

```typescript
export interface CreateGenerationInput {
	brandId: string;
	productId?: string;
	productIds?: string[];
	contentTopicId?: string;
	platform: string;
	contentType: string;
	framework: string;
	hookType: string;
	language?: string;
	prompt?: string;
	objective?: string;
	tonePreset?: string;
	visualStyle?: string;
	outputLength?: string;
	referenceImages?: string[];
	researchContext?: string;
	pillars?: string[];
}
```

- [ ] **Step 2: Forward `pillars` through `GenerationService.create`**

Edit `backend/src/services/generation.service.ts`. Replace the `boss.send` call (lines 62-68) with:

```typescript
		await this.boss.send("content-generation", {
			requestId: request.id,
			productIds: input.productIds ?? (input.productId ? [input.productId] : []),
			userId,
			referenceImages: input.referenceImages,
			researchContext: input.researchContext,
			pillars: input.pillars,
		});
```

- [ ] **Step 3: Accept `pillars` in the generation route**

Edit `backend/src/routes/generation.route.ts`. In the POST `/` handler, add `pillars: body.pillars,` to the service call argument object (around line 36, inside the `generationService.create` call):

```typescript
		const request = await generationService.create(workspaceId, userId, {
			brandId: body.brandId,
			productId: body.productId,
			productIds: body.productIds,
			contentTopicId: body.contentTopicId,
			platform: body.platform,
			contentType: body.contentType,
			framework: body.framework,
			hookType: body.hookType,
			language: body.language,
			prompt: body.prompt,
			objective: body.objective,
			tonePreset: body.tonePreset,
			visualStyle: body.visualStyle,
			outputLength: body.outputLength,
			referenceImages: body.referenceImages,
			researchContext: body.researchContext,
			pillars: body.pillars,
		});
```

- [ ] **Step 4: Extend `ContentJobData` and pass `pillars` into the prompt input**

Edit `backend/src/jobs/content-generation.job.ts`. Replace the `ContentJobData` interface (lines 11-17) with:

```typescript
interface ContentJobData {
	requestId: string;
	productIds?: string[];
	userId: string;
	referenceImages?: string[];
	researchContext?: string;
	pillars?: string[];
}
```

Replace the destructuring at line 30 with:

```typescript
		const { requestId, productIds, userId, referenceImages, researchContext, pillars } = data;
```

In the `generationInput` object (starting at line 205), add `pillars` as a new field:

```typescript
			// Build generation input
			const generationInput = {
				brandContext,
				productContext,
				skillContext: skillContext || undefined,
				platform: request.platform,
				contentType: request.contentType,
				framework: request.framework,
				hookType: request.hookType,
				language: request.language,
				prompt: enrichedPrompt,
				referenceImages,
				pillars,
			};
```

- [ ] **Step 5: Add a generation service test for `pillars`**

Edit `backend/tests/services/generation.service.test.ts`. Inside `describe("create", …)`, append a new `it(...)` block after the existing `it("should default language to 'id' when not provided", …)` (before the closing `});` of `describe("create")`):

```typescript
		it("forwards pillars to the content-generation job", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();

			await generationService.create(workspaceId, userId, {
				brandId: crypto.randomUUID(),
				platform: "instagram",
				contentType: "carousel",
				framework: "aida",
				hookType: "question",
				pillars: ["Education", "Lifestyle"],
			});

			expect(mockBoss.sentJobs).toHaveLength(1);
			const job = mockBoss.sentJobs[0];
			expect(job.name).toBe("content-generation");
			expect((job.data as any).pillars).toEqual(["Education", "Lifestyle"]);
		});
```

- [ ] **Step 6: Run generation service tests**

Run: `cd backend && bun test tests/services/generation.service.test.ts`
Expected: all tests PASS.

- [ ] **Step 7: Run full backend test suite + typecheck**

Run: `cd backend && bun test && bunx tsc --noEmit`
Expected: all tests PASS, typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add backend/src/types/generation.types.ts backend/src/services/generation.service.ts backend/src/routes/generation.route.ts backend/src/jobs/content-generation.job.ts backend/tests/services/generation.service.test.ts
git commit -m "feat(content): accept pillars in generation request"
```

---

## Task 8: Update GeneratePage to fetch pillars and send them

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx` — imports/interfaces, brain-fetch effect, submit body, no-topic pillar line display

- [ ] **Step 1: Add `contentPillars` state and fetch from the active brain**

Edit `frontend/src/pages/GeneratePage.tsx`. The existing brain-fetch effect around lines 560-585 already fetches the brand. Extend it so the active brand brain's `vocabulary.contentPillars` is captured alongside `brainTone`.

First, add state declaration near the other state hooks (group with `brainTone`/`brainUsp` — find the `useState` for `brainTone` and add immediately after):

```typescript
	const [brandContentPillars, setBrandContentPillars] = useState<string[]>([]);
```

Then update the brain-fetch effect body. In the block that currently reads:

```typescript
        const brand = (brandRes as any).data ?? brandRes;
        const activeBrandBrain = brand.brainVersions?.find((v: BrandBrainVersion) => v.isActive);
        setBrainTone(activeBrandBrain?.tone);
```

add the pillars pull **right after** `setBrainTone(...)`:

```typescript
        setBrandContentPillars(
          (activeBrandBrain as any)?.vocabulary?.contentPillars ?? [],
        );
```

And in the `catch` / "no brand" branches that currently reset `setBrainTone(undefined)`, also reset pillars:

```typescript
        setBrandContentPillars([]);
```

- [ ] **Step 2: Resolve and send `pillars` on submit**

Still in `GeneratePage.tsx`, find the submit `body: JSON.stringify({...})` block (around lines 608-626). Right before that `body:` call, compute the pillar list:

```typescript
      const selectedTopic = topics.find((t) => t.id === contentTopicId);
      const resolvedPillars =
        contentTopicId
          ? selectedTopic?.pillar
            ? [selectedTopic.pillar]
            : []
          : brandContentPillars;
```

Then add `pillars: resolvedPillars.length > 0 ? resolvedPillars : undefined,` as a new field inside the `body: JSON.stringify({...})`:

```typescript
        body: JSON.stringify({
          brandId,
          productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
          contentTopicId: contentTopicId || undefined,
          platform,
          contentType,
          framework: frameworkId || "PAS",
          hookType: hookTypeId || "curiosity",
          language,
          customPrompt: customPrompt.trim() || undefined,
          referenceImages: referenceImages.filter((i) => !i.uploading).map((i) => i.url).length > 0
            ? referenceImages.filter((i) => !i.uploading).map((i) => i.url)
            : undefined,
          tonePresetId: tonePresetId || undefined,
          visualStyleId: visualStyleId || undefined,
          objective: objective || undefined,
          outputLength: outputLength || undefined,
          researchContext: researchContext || undefined,
          pillars: resolvedPillars.length > 0 ? resolvedPillars : undefined,
        }),
```

- [ ] **Step 3: Show "Mixed (all brand pillars)" line when no topic is selected**

Still in `GeneratePage.tsx`, in the topic-selection block (around lines 770-808), find the `{contentTopicId && (() => { ... })()}` block and add an `else` case that renders the "mixed" line when a brand is chosen but no topic is selected. Replace the existing IIFE block that runs only when `contentTopicId` is truthy with:

```tsx
                  {contentTopicId ? (() => {
                    const selectedTopic = topics.find((t) => t.id === contentTopicId);
                    if (!selectedTopic) return null;
                    return (
                      <div className="flex items-center gap-2 -mt-1">
                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                          Pillar
                        </span>
                        {selectedTopic.pillar ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {selectedTopic.pillar}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">
                            Mixed (no pillar set)
                          </span>
                        )}
                      </div>
                    );
                  })() : (
                    brandId && brandContentPillars.length > 0 && (
                      <div className="flex items-center gap-2 -mt-1">
                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                          Pillar
                        </span>
                        <span className="text-[11px] text-gray-400 italic">
                          Mixed (all brand pillars)
                        </span>
                      </div>
                    )
                  )}
```

- [ ] **Step 4: Run frontend typecheck + build**

Run: `cd frontend && npm run typecheck`
Expected: exit 0.

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GeneratePage.tsx
git commit -m "feat(content-ui): resolve and send pillars on content generation"
```

---

## Task 9: End-to-end verification

**Files:** (no edits; run checks)

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && bun test`
Expected: every existing and new test PASSes.

- [ ] **Step 2: Run full backend typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Run frontend typecheck**

Run: `cd frontend && npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: exit 0.

- [ ] **Step 5: Manual smoke (browser)**

Start backend (`cd backend && bun run --hot src/index.ts`) and frontend (`cd frontend && npm run dev`). In the browser:

1. **Topic Generator** — open `/topics`:
   - Pick a brand with multiple content pillars. Click two pillar chips. The status line reads `Selected: <A>, <B>` and the helper text reads "Pick one or more pillars, or leave blank to mix across all."
   - Click one of the selected pillars again. It deselects.
   - Hit Generate with 0 pillars, 1 pillar, 2 pillars — verify:
     - 0 pillars → generated topics span multiple brand pillars
     - 1 pillar → every topic uses that pillar
     - 2 pillars → every topic uses one of the two (none outside)

2. **Content Generator** — open `/generate`:
   - Pick a brand, no topic. The Topic row shows "PILLAR: Mixed (all brand pillars)" in italic grey.
   - Generate content and inspect the AI-log entry (or the prompt in dev) — the user prompt should contain an "Align this content with one of the brand's content pillars: …" line.
   - Pick a topic that has a pillar. The Pillar badge appears (existing behavior). Generate content — the prompt should contain `This content should reinforce the brand pillar: "<pillar>"`.
   - Pick a topic whose `pillar` is blank (generated from the old mix path). The Pillar row shows "Mixed (no pillar set)". Generate — the prompt should have **no** pillar section.

- [ ] **Step 6: Commit verification artifacts (if any)**

If no further edits were required, nothing to commit. If manual smoke uncovered regressions, fix them and commit with a message like `fix(content): <what>`.

---

## Self-review notes

- All three topic-pillar branches (0, 1, 2+) are covered by prompt-builder tests in Task 1 and implemented in Task 2.
- All four content-pillar cases (none, empty, single, multi) are covered by tests in Task 5 and implemented in Task 6.
- No placeholders. Every code block is complete.
- Type consistency: `pillars?: string[]` used everywhere. `CreateTopicInput.pillar` and `UpdateTopicInput.pillar` deliberately left as single strings because a topic row still has one pillar.
- Breaking change (`pillar` → `pillars`) is landed atomically in Tasks 2–3 for topics and Task 7 for content so the tree compiles after each commit.
