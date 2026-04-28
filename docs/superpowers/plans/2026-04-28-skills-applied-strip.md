# Skills Applied Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the marketing skills that get auto-injected into prompts as a compact, read-only chip strip on the four auto-injecting generator forms (Brand Brain, Product Brain, Topic Generator, Content Generator).

**Architecture:** Backend exposes one endpoint per generator returning the manifest's resolved skill metadata (`{ slug, name, description }[]`). Frontend has a single shared hook + component pair: a per-generator session-level cache backs a `<SkillsAppliedStrip generator="topic" />` component, embedded once in each of the four pages above the relevant action button.

**Tech Stack:** Hono (backend routes), bun:test (backend tests), React 19 + Tailwind 4 (frontend), TypeScript strict.

**Branch:** Land everything on a feature branch — `feature/skills-applied-strip`. Branch is created in Task 1 step 1.

**Spec:** [docs/superpowers/specs/2026-04-28-skills-applied-strip-design.md](../specs/2026-04-28-skills-applied-strip-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/src/routes/skill-list.route.ts` | Modify | Register one route per `GeneratorName` from `manifests.ts` via a single loop. |
| `backend/tests/routes/skill-list.route.test.ts` | Create | bun:test suite hitting all five routes via `app.request()`, asserting status, shape, and slug lists. |
| `frontend/src/hooks/useGeneratorSkills.ts` | Create | React hook with per-`GeneratorKey` module-level cache. Mirrors `useAvailableSkills`. |
| `frontend/src/components/skills/SkillsAppliedStrip.tsx` | Create | Renders `Marketing skills applied:` label + chips. Self-contained — calls the hook and returns `null` when empty. |
| `frontend/src/pages/TopicsPage.tsx` | Modify | Insert `<SkillsAppliedStrip generator="topic" />` directly above the `Generate {count} Topics` button. |
| `frontend/src/pages/GeneratePage.tsx` | Modify | Insert `<SkillsAppliedStrip generator="content" />` directly above the `Generate Content` button. |
| `frontend/src/components/brands/BrandBrainForm.tsx` | Modify | Insert `<SkillsAppliedStrip generator="brand-brain" />` below the Website URL + Auto-fill row inside the `overview` tab. |
| `frontend/src/components/products/ProductForm.tsx` | Modify | Insert `<SkillsAppliedStrip generator="product-brain" />` below the Product URL + Auto-fill row, inside the `mode === "create"` block. |

---

## Task 1: Backend — refactor skill-list route to loop over generators (TDD)

**Files:**
- Modify: `backend/src/routes/skill-list.route.ts`
- Create: `backend/tests/routes/skill-list.route.test.ts`

- [ ] **Step 1: Create branch**

```bash
git checkout main && git pull --ff-only
git checkout -b feature/skills-applied-strip
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/routes/skill-list.route.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { SkillRegistry } from "../../src/config/skills/loader";
import { skillManifests } from "../../src/config/skills/manifests";
import { createSkillListRoutes } from "../../src/routes/skill-list.route";

function buildRegistry(): SkillRegistry {
	const all = new Set<string>();
	for (const slugs of Object.values(skillManifests)) for (const s of slugs) all.add(s);
	const map = new Map();
	for (const slug of all) {
		map.set(slug, {
			slug,
			name: slug
				.split("-")
				.map((p) => p[0].toUpperCase() + p.slice(1))
				.join(" "),
			description: `Description for ${slug}`,
			content: "",
		});
	}
	return map;
}

function mount(registry: SkillRegistry) {
	const app = new Hono();
	app.route("/api/skills", createSkillListRoutes(registry));
	return app;
}

describe("skill-list routes", () => {
	const registry = buildRegistry();
	const app = mount(registry);

	const cases: Array<[string, keyof typeof skillManifests]> = [
		["/api/skills/brand-brain", "brandBrain"],
		["/api/skills/product-brain", "productBrain"],
		["/api/skills/topic", "topic"],
		["/api/skills/content", "content"],
		["/api/skills/chat", "chat"],
	];

	for (const [path, generator] of cases) {
		test(`${path} returns the ${generator} manifest`, async () => {
			const res = await app.request(path);
			expect(res.status).toBe(200);
			const body = (await res.json()) as { data: Array<{ slug: string; name: string; description: string }> };
			expect(Array.isArray(body.data)).toBe(true);
			expect(body.data.map((s) => s.slug)).toEqual([...skillManifests[generator]]);
			for (const row of body.data) {
				expect(typeof row.slug).toBe("string");
				expect(typeof row.name).toBe("string");
				expect(typeof row.description).toBe("string");
			}
		});
	}
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && bun test tests/routes/skill-list.route.test.ts`
Expected: FAIL — only `/api/skills/chat` exists today; the four new paths return 404.

- [ ] **Step 4: Refactor `skill-list.route.ts` to loop**

Replace `backend/src/routes/skill-list.route.ts` with:

```ts
import { Hono } from "hono";
import type { SkillRegistry } from "../config/skills/loader";
import { filterByManifest } from "../config/skills/loader";
import type { GeneratorName } from "../config/skills/manifests";

/**
 * GET /api/skills/<generator> — returns the manifest's resolved skills as
 * { slug, name, description }[] for UI consumption (chat @-mention autocomplete,
 * generator-form "Skills applied" strips, etc.).
 *
 * The URL slug for each generator is mapped explicitly here so renaming a
 * generator type (e.g. brandBrain → brandBrainV2) never silently changes a
 * public URL.
 */
const ROUTES: Record<GeneratorName, string> = {
	brandBrain: "brand-brain",
	productBrain: "product-brain",
	topic: "topic",
	content: "content",
	chat: "chat",
};

export function createSkillListRoutes(skillRegistry: SkillRegistry) {
	const app = new Hono();

	for (const [generator, urlSlug] of Object.entries(ROUTES) as [GeneratorName, string][]) {
		app.get(`/${urlSlug}`, (c) => {
			const skills = filterByManifest(skillRegistry, generator).map((s) => ({
				slug: s.slug,
				name: s.name,
				description: s.description,
			}));
			return c.json({ data: skills });
		});
	}

	return app;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && bun test tests/routes/skill-list.route.test.ts`
Expected: PASS — five route tests pass.

- [ ] **Step 6: Run typecheck and existing tests**

Run: `cd backend && bunx tsc --noEmit && bun test`
Expected: typecheck clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/skill-list.route.ts backend/tests/routes/skill-list.route.test.ts
git commit -m "feat(backend): expose skill manifests for all 5 generators

Refactor /api/skills routes from one hardcoded /chat endpoint to a loop
that registers one route per GeneratorName. Frontend skills-applied
strips and chat autocomplete share the same shape."
```

---

## Task 2: Frontend — `useGeneratorSkills` hook

**Files:**
- Create: `frontend/src/hooks/useGeneratorSkills.ts`

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useGeneratorSkills.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";

export type GeneratorKey = "brand-brain" | "product-brain" | "topic" | "content";

export interface SkillSummary {
	slug: string;
	name: string;
	description: string;
}

const cache: Partial<Record<GeneratorKey, SkillSummary[]>> = {};
const inflight: Partial<Record<GeneratorKey, Promise<SkillSummary[]>>> = {};

async function load(generator: GeneratorKey): Promise<SkillSummary[]> {
	if (cache[generator]) return cache[generator] as SkillSummary[];
	const existing = inflight[generator];
	if (existing) return existing;
	const promise = api<{ data: SkillSummary[] } | SkillSummary[]>(`/api/skills/${generator}`)
		.then((res) => {
			const rows = Array.isArray(res)
				? res
				: Array.isArray((res as { data?: SkillSummary[] }).data)
					? ((res as { data: SkillSummary[] }).data)
					: [];
			cache[generator] = rows;
			return rows;
		})
		.catch(() => {
			cache[generator] = [];
			return [] as SkillSummary[];
		})
		.finally(() => {
			delete inflight[generator];
		});
	inflight[generator] = promise;
	return promise;
}

export function useGeneratorSkills(generator: GeneratorKey) {
	const [skills, setSkills] = useState<SkillSummary[]>(cache[generator] ?? []);
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		load(generator).then((list) => {
			if (mounted.current) setSkills(list);
		});
		return () => {
			mounted.current = false;
		};
	}, [generator]);
	return { skills };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useGeneratorSkills.ts
git commit -m "feat(frontend): useGeneratorSkills hook with per-key cache

One module-level cache slot per generator key. Mirrors useAvailableSkills
but parameterised. Skills are static config — fetched once per session
per generator, never refetched."
```

---

## Task 3: Frontend — `SkillsAppliedStrip` component

**Files:**
- Create: `frontend/src/components/skills/SkillsAppliedStrip.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/skills/SkillsAppliedStrip.tsx`:

```tsx
import { type GeneratorKey, useGeneratorSkills } from "../../hooks/useGeneratorSkills";

interface Props {
	generator: GeneratorKey;
	className?: string;
}

/**
 * Compact, read-only strip listing the marketing skills auto-injected into
 * prompts for a given generator. Renders nothing until the manifest loads
 * or if the manifest is empty.
 */
export function SkillsAppliedStrip({ generator, className }: Props) {
	const { skills } = useGeneratorSkills(generator);

	if (skills.length === 0) return null;

	return (
		<div
			className={`flex flex-wrap items-center gap-1.5 text-xs ${className ?? ""}`}
		>
			<span className="text-gray-500">Marketing skills applied:</span>
			{skills.map((s) => (
				<span
					key={s.slug}
					title={s.description}
					className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 cursor-help"
				>
					{s.name}
				</span>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/skills/SkillsAppliedStrip.tsx
git commit -m "feat(frontend): SkillsAppliedStrip component

Read-only chip strip showing which marketing skills get auto-injected
into prompts for a given generator. Hover a chip for the skill's
description (native title attribute)."
```

---

## Task 4: Wire strip into Topic Generator

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx` (around lines 800–810)

- [ ] **Step 1: Add import**

In `frontend/src/pages/TopicsPage.tsx`, add to the existing import block near the top of the file (after the other component imports):

```ts
import { SkillsAppliedStrip } from "../components/skills/SkillsAppliedStrip";
```

- [ ] **Step 2: Insert the strip above the Generate button**

Locate the `{/* Generate Button */}` comment and the `<Button onClick={handleGenerate}` block (around line 804). Insert the strip between the closing `</div>` of the form sections (line 802) and the comment for the Generate Button (line 804):

```tsx
                        </div>

                        <SkillsAppliedStrip generator="topic" className="mb-3 px-1" />

                        {/* Generate Button */}
                        <Button
                            onClick={handleGenerate}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TopicsPage.tsx
git commit -m "feat(frontend): show topic generator skills above Generate button"
```

---

## Task 5: Wire strip into Content Generator

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx` (around lines 1083–1090)

- [ ] **Step 1: Add import**

In `frontend/src/pages/GeneratePage.tsx`, add to the existing import block near the top of the file:

```ts
import { SkillsAppliedStrip } from "../components/skills/SkillsAppliedStrip";
```

- [ ] **Step 2: Insert the strip above the Generate Content button**

Locate the `{/* Generate Button */}` comment and the `<button type="button" onClick={handleSubmit}` block (around line 1086). Insert the strip directly before the comment:

```tsx
              </div>
            </div>

            <SkillsAppliedStrip generator="content" className="mb-3 px-1" />

            {/* Generate Button */}
            <button
              type="button"
              onClick={handleSubmit}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/GeneratePage.tsx
git commit -m "feat(frontend): show content generator skills above Generate button"
```

---

## Task 6: Wire strip into Brand Brain auto-fill

**Files:**
- Modify: `frontend/src/components/brands/BrandBrainForm.tsx` (around lines 626–648)

- [ ] **Step 1: Add import**

In `frontend/src/components/brands/BrandBrainForm.tsx`, add to the existing import block near the top of the file:

```ts
import { SkillsAppliedStrip } from "../skills/SkillsAppliedStrip";
```

- [ ] **Step 2: Insert the strip below the Website URL + Auto-fill row**

Locate the closing `</div>` of the URL + Auto-fill button row (the `<div className="flex gap-2 items-stretch">` block around line 626 ends at line 647). Insert the strip immediately after it, before the closing `</div>` of the `<div>` wrapping the Website section:

```tsx
                          <Button
                              variant="secondary"
                              onClick={handleAutoFill}
                              loading={scraping}
                              disabled={!form.websiteUrl.trim()}
                          >
                              <Sparkles size={14} className="mr-1.5" />
                              Auto-fill from Website
                          </Button>
                        </div>
                        <SkillsAppliedStrip generator="brand-brain" className="mt-2" />
                      </div>
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/brands/BrandBrainForm.tsx
git commit -m "feat(frontend): show brand brain skills below Auto-fill button"
```

---

## Task 7: Wire strip into Product Brain auto-fill

**Files:**
- Modify: `frontend/src/components/products/ProductForm.tsx` (around lines 270–292)

- [ ] **Step 1: Add import**

In `frontend/src/components/products/ProductForm.tsx`, add to the existing import block near the top of the file:

```ts
import { SkillsAppliedStrip } from "../skills/SkillsAppliedStrip";
```

- [ ] **Step 2: Insert the strip below the Product URL + Auto-fill row**

Locate the `mode === "create"` block (line 261). Inside it, the URL + Auto-fill row's outer `<div className="flex gap-2 items-stretch">` ends at line 290. Add the strip after that closing `</div>`, before the closing `</div>` of the conditional block:

```tsx
            <button
              type="button"
              onClick={handleAutoFill}
              disabled={scraping || !productUrl.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {scraping ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {scraping ? "Analyzing..." : "Auto-fill from URL"}
            </button>
          </div>
          <SkillsAppliedStrip generator="product-brain" className="mt-2" />
        </div>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/products/ProductForm.tsx
git commit -m "feat(frontend): show product brain skills below Auto-fill button"
```

---

## Task 8: Manual smoke test

**No file changes — verification only.**

- [ ] **Step 1: Start backend and frontend**

Two terminals:

```bash
# terminal 1
cd backend && bun run --hot src/index.ts
```

```bash
# terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Verify each page**

Open each page in the browser and confirm:

| Page | Expected behavior |
|---|---|
| `/topics` | "Marketing skills applied:" strip appears directly above the `Generate N Topics` button. Chips show: Customer Research, Content Strategy, Social Content, Ad Creative, Marketing Ideas (titles may vary by frontmatter). |
| `/generate` | Strip appears directly above the `Generate Content` button. Chips show the `content` manifest skills. |
| `/brands/new` (overview tab) | Strip appears directly below the Website URL + Auto-fill row. Chips show the `brandBrain` manifest skills. |
| Any product create flow (e.g. brand detail → "Add product") | Strip appears directly below the Product URL + Auto-fill row. Chips show the `productBrain` manifest skills. |

- [ ] **Step 3: Verify chip hover**

Hover a chip on any of the four pages and confirm the browser tooltip shows the skill's frontmatter `description`.

- [ ] **Step 4: Verify failure mode (optional)**

Stop the backend, reload `/topics`. The strip should render nothing — no error toast, no placeholder. (Optional check; frontend handles `cache[generator] = []` on failure.)

- [ ] **Step 5: If all checks pass, mark this task complete and proceed to merge.**

---

## Final: Merge to main

- [ ] **Step 1: Push branch**

```bash
git push -u origin feature/skills-applied-strip
```

- [ ] **Step 2: Open PR or merge directly per project preference**

The user's stated preference for previous features has been to merge straight to main locally with `--no-ff`. Confirm with the user before this step.

```bash
git checkout main
git merge --no-ff feature/skills-applied-strip -m "Merge feature/skills-applied-strip"
```

---

## Notes

- The plan introduces no new dependencies, no schema changes, no migrations.
- Existing `useAvailableSkills` (chat composer's `@mention` autocomplete) is left untouched. It still hits `/api/skills/chat`, which now lives in the same loop as the other four routes.
- Auth: `/api/skills/*` is mounted in [backend/src/index.ts:736](../../../backend/src/index.ts#L736) outside any workspace middleware. The new routes inherit that posture — they remain auth-protected at the global level (whatever the existing middleware stack provides) but are not workspace-scoped, since the manifest is global config.
