# Onboarding Checklist Topic Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert "Generate your first topic" between product and content in the Getting Started checklist; convert the `×` button to "hide" (localStorage-only); show a completion modal when all four steps are done; permanent dismissal happens only on modal close.

**Architecture:** Backend `OnboardingProgress` gains `hasTopic` from a new `prisma.contentTopic.count(...)`. Frontend rewrites `GettingStartedChecklist.tsx` — adds a 4th item, swaps `×` to localStorage-based hide with a floating "Show" button, replaces the inline celebration with a `role="dialog"` modal that calls `dismissChecklist()` on close.

**Tech Stack:** TypeScript, Bun, Hono, Prisma 7 (backend); React 19, Tailwind 4 (frontend). No new dependencies.

Spec: `docs/superpowers/specs/2026-04-28-onboarding-checklist-topic-step-design.md`

---

## File Structure

**Modify (backend):**
- `backend/src/interfaces/services/onboarding.service.interface.ts` — add `hasTopic: boolean` to `OnboardingProgress`.
- `backend/src/services/onboarding.service.ts` — add topic count to `getProgress(workspaceId)`.
- `backend/tests/services/onboarding.service.test.ts` — extend existing `getProgress` test for `hasTopic`.

**Modify (frontend):**
- `frontend/src/services/onboarding.api.ts` — mirror `hasTopic` on the type.
- `frontend/src/components/onboarding/GettingStartedChecklist.tsx` — main rewrite (4th item, hide vs dismiss, completion modal).

No new files. No deletions. No schema migration.

---

## Task 1: Backend — extend `OnboardingProgress` with `hasTopic`

**Files:**
- Modify: `backend/src/interfaces/services/onboarding.service.interface.ts`
- Modify: `backend/src/services/onboarding.service.ts`
- Modify: `backend/tests/services/onboarding.service.test.ts`

- [ ] **Step 1: Add `hasTopic` to the interface**

Edit `backend/src/interfaces/services/onboarding.service.interface.ts`. Find the `OnboardingProgress` interface (around line 9-13):

```ts
export interface OnboardingProgress {
	hasBrand: boolean;
	hasProduct: boolean;
	hasGenerated: boolean;
}
```

Add `hasTopic` between `hasProduct` and `hasGenerated`:

```ts
export interface OnboardingProgress {
	hasBrand: boolean;
	hasProduct: boolean;
	hasTopic: boolean;
	hasGenerated: boolean;
}
```

Order matters for readability — it mirrors the natural funnel.

- [ ] **Step 2: Add the topic count to `getProgress`**

Edit `backend/src/services/onboarding.service.ts`. Find `getProgress(workspaceId)` (the only public method besides `getFlags` / `patchFlags`). Around the existing brand/product/generation counts, ADD a topic count.

Existing code (around line 40-56):

```ts
async getProgress(workspaceId: string): Promise<OnboardingProgress> {
	const brandCount = await this.prisma.brand.count({
		where: { workspaceId, archivedAt: null },
	});
	const productCount = await this.prisma.product.count({
		where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
	});
	const generationCount = await this.prisma.generationRequest.count({
		where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
	});
	return {
		hasBrand: brandCount > 0,
		hasProduct: productCount > 0,
		hasGenerated: generationCount > 0,
	};
}
```

Replace with:

```ts
async getProgress(workspaceId: string): Promise<OnboardingProgress> {
	const brandCount = await this.prisma.brand.count({
		where: { workspaceId, archivedAt: null },
	});
	const productCount = await this.prisma.product.count({
		where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
	});
	const topicCount = await this.prisma.contentTopic.count({
		where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
	});
	const generationCount = await this.prisma.generationRequest.count({
		where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
	});
	return {
		hasBrand: brandCount > 0,
		hasProduct: productCount > 0,
		hasTopic: topicCount > 0,
		hasGenerated: generationCount > 0,
	};
}
```

The where-clause matches existing patterns (archived rows excluded, parent brand archive checked).

- [ ] **Step 3: Extend the existing test**

Edit `backend/tests/services/onboarding.service.test.ts`. Find the `getProgress` test block. The existing test stubs `prisma.brand.count`, `prisma.product.count`, `prisma.generationRequest.count`. Add a `prisma.contentTopic.count` stub matching the same pattern.

Locate the stub setup (likely a `prisma` mock object passed into the service). Add the new entry:

```ts
contentTopic: { count: async () => topicCount },
```

…where `topicCount` is a configurable variable in the test (mirrors the existing `brandCount`, `productCount`, `generationCount`).

Update assertions: every existing test that asserted `result.hasGenerated` should now also assert `result.hasTopic` matches the topic count expectation. Add at least one test that varies `topicCount` independently — e.g., `topicCount = 0, generationCount = 1` → `hasTopic === false, hasGenerated === true`.

The exact existing test shape depends on how `tests/services/onboarding.service.test.ts` is currently written — read it first, then extend in-style.

- [ ] **Step 4: Typecheck and run tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -3
```

Expected: tsc same baseline (typically 8 pre-existing errors in unrelated files). Tests all green plus the new `hasTopic` assertion.

If tsc rises, the most likely cause is a stale Prisma client — run `bunx prisma generate` and re-typecheck.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/interfaces/services/onboarding.service.interface.ts \
        backend/src/services/onboarding.service.ts \
        backend/tests/services/onboarding.service.test.ts
git commit -m "feat(backend): track topic count in OnboardingProgress

Adds hasTopic to OnboardingProgress, populated from
prisma.contentTopic.count using the same archived-row + parent-brand
filter as the other counts. The frontend Getting Started checklist
will use it to insert a 'Generate your first topic' step between
product and content."
```

---

## Task 2: Frontend — mirror `hasTopic` on the type

**Files:**
- Modify: `frontend/src/services/onboarding.api.ts`

- [ ] **Step 1: Add the field**

Edit `frontend/src/services/onboarding.api.ts`. Find the `OnboardingProgress` interface (around line 9-13):

```ts
export interface OnboardingProgress {
	hasBrand: boolean;
	hasProduct: boolean;
	hasGenerated: boolean;
}
```

Add `hasTopic` between `hasProduct` and `hasGenerated`:

```ts
export interface OnboardingProgress {
	hasBrand: boolean;
	hasProduct: boolean;
	hasTopic: boolean;
	hasGenerated: boolean;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npx tsc -b 2>&1 | tail -5
```

Expected: clean output, exit 0. The existing checklist still references `hasBrand | hasProduct | hasGenerated` and won't error — the new field is purely additive.

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/services/onboarding.api.ts
git commit -m "feat(frontend): mirror hasTopic on OnboardingProgress type

The backend now returns hasTopic on /api/workspaces/:w/onboarding-progress;
the frontend type catches up. The checklist component is rewritten in
the next commit."
```

---

## Task 3: Frontend — rewrite `GettingStartedChecklist.tsx`

**Files:**
- Modify: `frontend/src/components/onboarding/GettingStartedChecklist.tsx`

This is the main task. Reads the existing 96-line component and rewrites it to add the topic step, the localStorage-based hide flow, and the completion modal.

- [ ] **Step 1: Read the current component**

```bash
cat /Users/bellinnn/Documents/projects/fce/frontend/src/components/onboarding/GettingStartedChecklist.tsx
```

Note:
- Imports.
- The `Item` type / `ITEMS` array.
- The auto-dismiss `useEffect` that fires `setTimeout(dismissChecklist, 2000)`.
- The render guards (`welcomeSeenAt === null`, `checklistDismissedAt !== null`, `!progress`).
- The `allDone` derivation and the inline celebration message.

- [ ] **Step 2: Replace the entire file with the new version**

Replace `frontend/src/components/onboarding/GettingStartedChecklist.tsx` contents:

```tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, Sparkles } from "lucide-react";
import { useOnboarding } from "../../hooks/useOnboarding";

interface Item {
	key: "hasBrand" | "hasProduct" | "hasTopic" | "hasGenerated";
	label: string;
	to: string;
}

const ITEMS: Item[] = [
	{ key: "hasBrand", label: "Create your first brand", to: "/brands/new" },
	{ key: "hasProduct", label: "Add a product to your brand", to: "/products" },
	{ key: "hasTopic", label: "Generate your first topic", to: "/topics" },
	{ key: "hasGenerated", label: "Generate your first content", to: "/generate" },
];

const HIDE_KEY = "fce.onboarding.checklist.hidden";

export function GettingStartedChecklist() {
	const { welcomeSeenAt, checklistDismissedAt, progress, dismissChecklist } = useOnboarding();

	// Local hide state (localStorage). Doesn't touch the backend.
	const [hidden, setHidden] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		return window.localStorage.getItem(HIDE_KEY) === "1";
	});

	// Celebration modal triggers when all four progress items become true.
	// Use a ref to avoid re-triggering on subsequent re-renders after we've
	// already shown the modal once for this session.
	const [showCelebration, setShowCelebration] = useState(false);
	const triggeredRef = useRef(false);

	useEffect(() => {
		if (!progress) return;
		const allDone =
			progress.hasBrand &&
			progress.hasProduct &&
			progress.hasTopic &&
			progress.hasGenerated;
		if (allDone && !triggeredRef.current) {
			triggeredRef.current = true;
			setShowCelebration(true);
		}
	}, [progress]);

	// Render guards.
	if (welcomeSeenAt === null) return null;
	if (checklistDismissedAt !== null) return null;
	if (!progress) return null;

	function hide() {
		try {
			window.localStorage.setItem(HIDE_KEY, "1");
		} catch {
			// localStorage disabled or full — fall back to in-memory state.
		}
		setHidden(true);
	}

	function show() {
		try {
			window.localStorage.removeItem(HIDE_KEY);
		} catch {
			// ignore
		}
		setHidden(false);
	}

	async function handleCelebrationClose() {
		setShowCelebration(false);
		await dismissChecklist();
	}

	// Order matters: the celebration modal takes precedence over the
	// hidden-show-button state. Even if the user hid the checklist, the modal
	// pops up the moment they finish the last step.
	if (showCelebration) {
		return <CompletionModal onClose={handleCelebrationClose} />;
	}

	if (hidden) {
		return (
			<button
				type="button"
				onClick={show}
				aria-label="Show getting started"
				className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-md hover:bg-gray-50 hover:shadow-lg"
			>
				<Sparkles size={16} className="text-indigo-600" />
				Show getting started
			</button>
		);
	}

	return (
		<div className="fixed bottom-6 right-6 z-40 w-80 rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
			<div className="flex items-start justify-between">
				<h3 className="text-sm font-semibold text-gray-900">Getting started</h3>
				<button
					type="button"
					onClick={hide}
					aria-label="Hide getting started"
					className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
				>
					<X size={16} />
				</button>
			</div>

			<ul className="mt-4 space-y-3">
				{ITEMS.map((item) => {
					const done = Boolean(progress[item.key]);
					return (
						<li key={item.key} className="flex items-center gap-3">
							<span
								className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
									done
										? "border-green-600 bg-green-600 text-white"
										: "border-gray-300 bg-white"
								}`}
							>
								{done && <Check size={12} />}
							</span>
							{done ? (
								<span className="text-sm text-gray-500 line-through">{item.label}</span>
							) : (
								<Link
									to={item.to}
									className="text-sm text-gray-800 hover:text-indigo-700 hover:underline"
								>
									{item.label}
								</Link>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}

interface CompletionModalProps {
	onClose: () => void | Promise<void>;
}

function CompletionModal({ onClose }: CompletionModalProps) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			aria-labelledby="completion-modal-title"
		>
			<div className="w-[min(520px,90vw)] rounded-2xl bg-white p-8 shadow-2xl">
				<h2
					id="completion-modal-title"
					className="text-2xl font-semibold text-gray-900"
				>
					🎉 You're all set!
				</h2>
				<p className="mt-3 text-gray-600">
					You've created a brand, added a product, generated your first topic,
					and shipped your first content. The Getting Started checklist won't
					show again — you can find help via the <strong>?</strong> button on
					each page.
				</p>
				<div className="mt-8 flex justify-end">
					<button
						type="button"
						onClick={() => onClose()}
						className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
					>
						Sounds good
					</button>
				</div>
			</div>
		</div>
	);
}
```

Key changes from the previous version:
- `Item.key` union widened to include `"hasTopic"`.
- `ITEMS` array gains the topic entry between product and content; route is `/topics`.
- `dismissChecklist()` is no longer called from the `×` button. The button writes to localStorage and toggles local state.
- A new `<CompletionModal />` (defined inline at the bottom of the same file) replaces the previous `🎉 You're all set` inline message.
- The auto-dismiss `setTimeout(dismissChecklist, 2000)` is gone — modal close is the explicit dismiss action.
- A "Show getting started" floating button is rendered when `hidden && !showCelebration`.
- Render order: celebration modal wins over hidden state wins over normal checklist.
- The `triggeredRef` guard prevents the modal from re-opening if the user dismissed the modal but the `progress` re-fetches on next workspace switch (would otherwise be true again).

- [ ] **Step 3: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npx tsc -b 2>&1 | tail -5
```

Expected: clean. The `Sparkles` import from `lucide-react` is already used elsewhere in the codebase, no new dependency.

- [ ] **Step 4: Manual smoke (local)**

If the backend dev server isn't running, start it: `cd backend && bun run --hot src/index.ts`. Frontend: `cd frontend && npm run dev`.

Then in the browser:
1. Visit any page where the AppShell mounts the checklist.
2. Verify it shows four items: Brand → Product → Topic → Content.
3. Click `×`. Verify the checklist disappears and a "Show getting started" pill appears bottom-right.
4. Refresh the page. Verify the pill is still there (localStorage persisted).
5. Click the pill. Verify the checklist reappears.

You can't test the modal without actually completing all four steps — that's the user's smoke verification later. Just confirm the show/hide cycle works.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/onboarding/GettingStartedChecklist.tsx
git commit -m "feat(frontend): rewrite GettingStartedChecklist with topic step + hide-vs-dismiss

Four steps now: Brand → Product → Topic → Content. The × button hides
the checklist (localStorage-only) instead of permanently dismissing.
A floating 'Show getting started' button brings it back. Permanent
dismissal happens when the celebration modal — triggered on completion
of all four — is closed.

The completion modal replaces the previous inline 🎉 message and
auto-dismiss timeout. role='dialog' + aria-modal='true' + labelled by
the H2 title for screen readers."
```

---

## Task 4: Manual smoke verification (user-side)

End-to-end manual check, including the celebration path that requires actually generating content.

- [ ] **Step 1: Restart backend with hot reload**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun run --hot src/index.ts
```

- [ ] **Step 2: New user signup OR reset existing user**

If you have an existing test user, reset their checklist via SQL:

```sql
UPDATE users
SET onboarding_checklist_dismissed_at = NULL
WHERE email = 'your-test-email';
```

Then in the browser, also clear `fce.onboarding.checklist.hidden` from localStorage (Application tab → Local Storage).

- [ ] **Step 3: Verify the checklist + show/hide**

1. Sign in. Verify four items render: Brand → Product → Topic → Content.
2. Click `×`. Pill appears.
3. Refresh. Pill still there.
4. Click pill. Checklist back. Click `×` again. Pill back.
5. Refresh once more — confirm pill state is preserved.

- [ ] **Step 4: Tick each step**

1. Create a brand → checklist item 1 ticks (refresh might be needed if SSE doesn't fire fast).
2. Add a product → item 2 ticks.
3. Generate a topic → item 3 ticks (this is the new step).
4. Generate content → item 4 ticks → **celebration modal pops up**.

- [ ] **Step 5: Verify the celebration modal**

The modal should:
- Show a 🎉 title and the explanatory paragraph.
- Have a single "Sounds good" button.
- Be dismissible only via the button (no outside-click).

Click "Sounds good". The modal closes. Verify:
- Both the checklist AND any pill/show button are gone.
- DB row: `onboarding_checklist_dismissed_at` is non-null.
- Refresh — confirm still gone.

- [ ] **Step 6: Verify pre-dismissed users see nothing**

If you have an existing user with `onboarding_checklist_dismissed_at != NULL`, sign in as them. Verify NO checklist, NO pill renders. (This was the existing behavior; just confirm the new code doesn't accidentally bring it back.)

- [ ] **Step 7: Final sanity sweep**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -3
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
cd /Users/bellinnn/Documents/projects/fce/frontend && npx tsc -b
```

Expected: tests at baseline, tsc count unchanged, frontend clean.

---

## Summary

- 4 tasks, ~15 steps total.
- Backend: 3 files modified (interface + service + test). One new `prisma.contentTopic.count`.
- Frontend: 2 files modified (type + component rewrite). No new files.
- 3 functional commits + Task 4 is user-driven smoke verification (no commit unless the smoke surfaces a bug).
- No schema migration, no new dependencies, no new env vars.
