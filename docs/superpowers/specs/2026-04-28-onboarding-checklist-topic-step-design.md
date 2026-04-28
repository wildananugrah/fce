# Onboarding Checklist: Topic Step + Hide-vs-Dismiss + Completion Modal

**Date:** 2026-04-28
**Status:** Proposed

## Problem

Today's Getting Started checklist has three steps: Create brand → Add product → Generate first content. Two issues:

1. The checklist skips topic generation, even though FCE's natural funnel is brand → product → topic → content. New users are pushed into content generation before they've engaged with topics, missing the typical workflow.
2. The `×` button on the checklist permanently dismisses it via `User.onboardingChecklistDismissedAt`. There's no way to "hide for now" — once dismissed, the checklist is gone forever even if the user hasn't actually completed all steps.

## Goal

1. Insert a topic step between product and content. Final order: Create brand → Add product → Generate first **topic** → Generate first content.
2. Repurpose the `×` button to **hide** the checklist (with a small floating "Show" button to bring it back). The hide state is browser-local (localStorage), not persisted on the user.
3. **Permanently dismiss** the checklist only when the user completes all four steps. Show a celebration modal at that moment; closing the modal sets `onboardingChecklistDismissedAt` (the existing column), and the checklist + show-button both go away forever.

## Non-goals

- New persistence on the user model. The existing `onboardingChecklistDismissedAt` field's role narrows from "user clicked dismiss" to "user finished and closed the celebration modal". The column name, type, and presence stay.
- Per-workspace or per-project hide state. The hide is a personal browser-local preference.
- Skipping ahead through the checklist. Items can only be checked by actually performing the underlying action.
- Reordering existing items. Brand → product is unchanged; topic inserts between product and content.

## User experience

### Initial state (new user, post-welcome modal)

The checklist sits bottom-right with four unchecked items:

```
Getting started                                 ×
☐ Create your first brand
☐ Add a product to your brand
☐ Generate your first topic
☐ Generate your first content
```

Each row is a link to the matching page. Items auto-check based on workspace state — same mechanism as today, just one more counter (`hasTopic`) added.

### User clicks `×` (hide)

The checklist disappears. A small floating button takes its place at the bottom-right corner — minimal, e.g., a "?" icon or a "Show progress" pill. Clicking it brings the checklist back.

The hide state lives in `localStorage` under a single key (e.g., `fce.onboarding.checklist.hidden`). Cross-device behavior: each browser/device decides independently — acceptable since this is "hide for now," not a commitment.

### User completes all four steps

A celebration modal pops up:

```
🎉 You're all set!

You've created a brand, added a product, generated your first topic,
and shipped your first content. The Getting Started checklist won't
show again — you can find advanced tips in the Help button on each
page.

[Sounds good]
```

Closing the modal calls `dismissChecklist()` (the existing optimistic-update API call that `PATCH`es `onboardingChecklistDismissedAt`). After the response the checklist + show-button are gone permanently.

### User refreshes the page mid-flow

- If `localStorage` says hidden but `onboardingChecklistDismissedAt` is null: show the floating "Show" button (not the full checklist).
- If `localStorage` says shown and `onboardingChecklistDismissedAt` is null: show the full checklist.
- If `onboardingChecklistDismissedAt` is non-null: nothing renders (full dismissal wins over local hide preference).

## Architecture

### Backend

**`backend/src/interfaces/services/onboarding.service.interface.ts`** — extend `OnboardingProgress`:

```ts
export interface OnboardingProgress {
	hasBrand: boolean;
	hasProduct: boolean;
	hasTopic: boolean;       // NEW
	hasGenerated: boolean;
}
```

**`backend/src/services/onboarding.service.ts`** — `getProgress(workspaceId)` adds a topic count alongside the existing three. Match the existing filter style (archived rows excluded, parent brand archive state checked):

```ts
const topicCount = await this.prisma.contentTopic.count({
	where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
});
return {
	hasBrand: brandCount > 0,
	hasProduct: productCount > 0,
	hasTopic: topicCount > 0,
	hasGenerated: generationCount > 0,
};
```

The `ContentTopic` model already has `archivedAt` and a `brandId` relation — verified existing usage in `dashboard.service.ts` and elsewhere.

### Frontend

**`frontend/src/services/onboarding.api.ts`** — mirror the new field on `OnboardingProgress`.

**`frontend/src/contexts/OnboardingContext.tsx`** — no API surface change; the `progress` object naturally gains `hasTopic` from the typed response.

**`frontend/src/components/onboarding/GettingStartedChecklist.tsx`** — the main rewrite:

1. **Items array gains a fourth entry** for topic, between product and content:

```ts
const ITEMS: Item[] = [
	{ key: "hasBrand", label: "Create your first brand", to: "/brands/new" },
	{ key: "hasProduct", label: "Add a product to your brand", to: "/products" },
	{ key: "hasTopic", label: "Generate your first topic", to: "/topics" },
	{ key: "hasGenerated", label: "Generate your first content", to: "/generate" },
];
```

The `Item.key` union type widens to include `"hasTopic"`.

2. **`×` button writes to localStorage instead of calling `dismissChecklist()`:**

```ts
const HIDE_KEY = "fce.onboarding.checklist.hidden";
const [hidden, setHidden] = useState(() => localStorage.getItem(HIDE_KEY) === "1");

function hide() {
	localStorage.setItem(HIDE_KEY, "1");
	setHidden(true);
}
function show() {
	localStorage.removeItem(HIDE_KEY);
	setHidden(false);
}
```

3. **Floating "Show" button** when `hidden && !checklistDismissedAt && progress`:

A small fixed-position button bottom-right, same anchor as the checklist itself. Clicking it calls `show()`. Lives in the same component file — no new component file needed.

4. **Celebration modal** when all four progress flags are true:

```ts
useEffect(() => {
	if (!progress) return;
	if (progress.hasBrand && progress.hasProduct && progress.hasTopic && progress.hasGenerated) {
		setShowCelebration(true);
	}
}, [progress]);
```

The modal is full-screen (matches `WelcomeModal.tsx`'s style — `role="dialog"`, `aria-modal="true"`, `aria-labelledby="completion-modal-title"`). Body text per the spec; single primary button labeled "Sounds good". Clicking it calls `dismissChecklist()` and closes the modal.

The `useRef`-based "celebrated" guard from the existing component is removed — the modal replaces the auto-dismiss-after-2s behavior entirely.

5. **Render decision tree:**

```
welcomeSeenAt === null              → render nothing (waiting for welcome modal)
checklistDismissedAt !== null       → render nothing (dismissed forever)
showCelebration                     → render <CompletionModal />
hidden (localStorage) && !showCelebration → render <ShowButton />
otherwise                           → render <Checklist />
```

The `<ShowButton />` and the celebration modal are NOT exclusive — if all four steps complete while the checklist is hidden, the modal still pops up. The `<ShowButton />` is hidden behind the modal in that case (modal takes z-index priority).

### Edge cases

| Scenario | Behavior |
|---|---|
| User clicks `×`, then completes the final step in another tab | Local tab still shows hide-button; other tab fires the modal (since it sees `progress.hasGenerated` flip true via SSE/refresh). When user comes back to first tab and `progress` updates, the modal fires there too. |
| User completes all four steps before clicking anything | Celebration modal pops up unprompted. `dismissChecklist()` only fires on modal close, so the user still has to acknowledge it. |
| User clicks the "Show" button after dismissing the celebration modal | The dismiss flag means the show button is gone too — clicking is impossible because nothing renders. |
| User has `localStorage` cleared mid-flow (e.g., browser data wipe) | Hidden state lost; checklist re-appears. Acceptable — they can re-hide. |
| User completes all four steps but closes the modal via the X / outside click | Same effect as the primary button — calls `dismissChecklist()`. (If the modal is full-screen with no outside-click dismiss, the "X" close button has identical behavior to "Sounds good".) |
| `progress` is `null` (still loading) | Render nothing. Same as today's behavior. |
| Existing dismissed users (`checklistDismissedAt` already set) | Nothing renders for them. Their state pre-dates this change; we don't bring the checklist back. The "Show" button only appears for users with `checklistDismissedAt: null` AND `localStorage` says hidden. |

## Testing

- **Backend unit tests** in `backend/tests/services/onboarding.service.test.ts` — extend the existing `getProgress` test to cover `hasTopic`. Add a stub for `prisma.contentTopic.count`. Verify the where-clause filter matches the existing pattern (archived rows excluded, parent brand archive checked).
- **Frontend manual smoke** — fresh user signs up, sees four-item checklist, hides it (sees "Show" button), shows it again, completes each step (each ticks), final step triggers modal, modal close dismisses forever.
- No new test infrastructure.

## Rollout

1. Backend + frontend land together in the same release.
2. Existing users with `checklistDismissedAt` non-null see no change (still dismissed).
3. Existing users with `checklistDismissedAt` null and an in-progress checklist see the new four-item version on next page load — their existing progress flags carry over (brand, product, content). The new `hasTopic` step sits in the third slot; if they've already generated topics, it auto-checks; if not, they have one more step before completion.
4. No data migration. The existing `onboardingChecklistDismissedAt` column stays.

## YAGNI / deferred

- Persisting the `localStorage` hide state on the user (cross-device hiding).
- An admin tool for resetting a user's checklist for testing.
- Animations on the show / hide / celebrate transitions beyond what's already in place.
- Configurable item set (e.g., per-workspace skip of certain steps).
- The "outside-click closes the modal" behavior — keep it explicit-button only to avoid accidental dismissal of the only celebration the user gets.
