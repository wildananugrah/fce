# Onboarding Tutorial — Design

**Date:** 2026-04-24
**Status:** Proposed

## Problem

New FCE users log in to a dashboard with many pages (Brands, Products, Generate, Campaigns, Topics, Library, Competitor Analyzer, Workspace Settings, Admin) and no guidance. The mental model — "brand holds voice → product is what you talk about → generate runs against a product" — is not obvious from the UI alone, and first-time visitors to each page don't know what the page is for.

## Goal

On first login, give new users a short guided introduction and a persistent checklist that tracks real progress. On first visit to each major page, show a one-time coach mark that explains the page in two sentences. Give users a way to replay each coach mark later via a Help button.

## Non-goals

- Full interactive spotlight tours (Intro.js / Shepherd style). Rejected as intrusive and fragile to UI changes.
- Role-aware tutorial variants. Can layer on later without redesign.
- Analytics/funnel tracking on tutorial completion.
- Coach marks on every page. MVP covers the 6 most important: Dashboard, Brands, Products, Generate, Campaigns, Topics.
- Per-workspace dismiss of the checklist. One global flag per user.
- E2E test coverage of onboarding flow. FCE has no frontend E2E framework and adding one is out of scope.

## User experience

### First login (new user, never seen welcome)

1. User lands on Dashboard after login.
2. **Welcome modal** (full-screen, 3 slides):
   - Slide 1: "Welcome to FCE 👋 — You're set up and ready to go. In the next 30 seconds, we'll show you how FCE helps you turn your brand into ready-to-post content." `[Skip] [Next →]`
   - Slide 2: "Three steps from idea to post — **Brand** (voice, audience, rules) → **Product** (a specific thing you talk about) → **Generate** (AI writes + designs it)." `[← Back] [Skip] [Next →]`
   - Slide 3: "Let's set up your first brand. You'll give it a name, describe your audience, and paste any reference links you have. Takes about 2 minutes." `[Skip for now] [Create my first brand →]`
3. Dismissing (Skip or completing) sets `onboardingWelcomeSeenAt`. The CTA on slide 3 also navigates to `/brands/new`.
4. **Getting Started checklist** appears bottom-right after the welcome modal closes:
   - ☐ Create your first brand → `/brands/new`
   - ☐ Add a product to your brand → `/products/new`
   - ☐ Generate your first content → `/generate`
5. Each item auto-checks based on real workspace data. When all three complete, card shows "🎉 You're all set — great work." then fades and auto-dismisses. Manual `×` dismiss also supported at any time.

### First visit to a target page

When the user lands on one of the 6 target pages and `seenCoachMarks` does not include that page's key, a **coach mark** renders at the top of the page — a dismissible card with a two-sentence explanation. Closing it appends the page key to `seenCoachMarks`. Never auto-shown again.

### Replay via Help button

Each of the 6 target pages includes a `?` icon in its header. Clicking it force-shows the coach mark for that page regardless of seen state. Local-state-only — does not clear `seenCoachMarks`, so next page load still respects the dismissed state.

### Copy

Exact copy for all slides, checklist items, and per-page coach marks is specified in the "Copy" appendix below.

## Architecture

### Data model

Add three fields to `User` in `backend/prisma/schema.prisma`:

```prisma
model User {
  // ... existing fields
  onboardingWelcomeSeenAt        DateTime?
  onboardingChecklistDismissedAt DateTime?
  seenCoachMarks                 String[]  @default([])
}
```

- `onboardingWelcomeSeenAt` — set when the user dismisses the welcome modal (Skip or complete). `null` = show modal on next login.
- `onboardingChecklistDismissedAt` — set when the user clicks `×` or the card auto-dismisses after all three items are complete. `null` = show checklist (while any item incomplete).
- `seenCoachMarks` — array of page keys (`"dashboard"`, `"brands"`, `"products"`, `"generate"`, `"campaigns"`, `"topics"`). A key present = don't auto-show that page's coach mark.

Checklist progress is **not persisted**. It is derived per-request from the active workspace:

- `hasBrand` — `prisma.brand.count({ workspaceId, archivedAt: null }) > 0`
- `hasProduct` — `prisma.product.count({ brand: { workspaceId, archivedAt: null }, archivedAt: null }) > 0`
- `hasGenerated` — `prisma.generationOutput.count({ request: { workspaceId } }) > 0`

Archived brands/products are excluded. This matches the visibility rules documented in CLAUDE.md.

### Backend

New service + route, wired through the composition root in `backend/src/index.ts` following the existing pattern.

**Files:**

- `backend/prisma/schema.prisma` — add three fields to `User`.
- `backend/src/interfaces/repositories/user.repository.interface.ts` — add `updateOnboarding(userId, patch)`.
- `backend/src/repositories/user.repository.ts` — implement `updateOnboarding`.
- `backend/src/services/onboarding.service.ts` — new. Depends on `IUserRepository` + `PrismaClient`.
- `backend/src/routes/onboarding.route.ts` — new. Mounted under `/api/users/me/onboarding`.
- `backend/src/routes/workspace.route.ts` — add `GET /:workspaceId/onboarding-progress` to the existing workspace router.
- `backend/src/index.ts` — wire dependencies, mount routes.
- `backend/tests/helpers/mock-user.repository.ts` — add `updateOnboarding` stub.
- `backend/tests/services/onboarding.service.test.ts` — unit tests with mocks.
- `backend/scripts/migrate-onboarding.ts` — grandfather all existing users so nobody sees a surprise tutorial.

**Endpoints:**

```
GET /api/users/me/onboarding
  → 200 {
      welcomeSeenAt: string | null,
      checklistDismissedAt: string | null,
      seenCoachMarks: string[]
    }

PATCH /api/users/me/onboarding
  body: {
    welcomeSeen?: true,
    checklistDismissed?: true,
    markCoachSeen?: string
  }
  → 200 <same shape as GET>

GET /api/workspaces/:workspaceId/onboarding-progress
  → 200 { hasBrand: boolean, hasProduct: boolean, hasGenerated: boolean }
```

PATCH semantics (all partial, additive, idempotent):

- `welcomeSeen: true` — sets `onboardingWelcomeSeenAt = now()` only if currently null.
- `checklistDismissed: true` — sets `onboardingChecklistDismissedAt = now()` only if currently null.
- `markCoachSeen: "brands"` — appends to `seenCoachMarks` only if not already present.

Workspace-progress endpoint is auth-gated by the existing workspace middleware (verifies membership, injects `workspaceId` and `workspaceRole` into context).

### Frontend

**Files:**

- `frontend/src/contexts/OnboardingContext.tsx` — new provider.
- `frontend/src/services/onboardingService.ts` — new API client wrapper over existing `apiClient`.
- `frontend/src/components/onboarding/WelcomeModal.tsx` — new.
- `frontend/src/components/onboarding/GettingStartedChecklist.tsx` — new.
- `frontend/src/components/onboarding/CoachMark.tsx` — new.
- `frontend/src/components/onboarding/HelpButton.tsx` — new.
- `frontend/src/components/layout/AppShell.tsx` — mount `<WelcomeModal />` and `<GettingStartedChecklist />`.
- `frontend/src/App.tsx` (or wherever providers are composed) — add `<OnboardingProvider>` inside `<WorkspaceProvider>`.
- `frontend/src/pages/DashboardPage.tsx` — add `<CoachMark pageKey="dashboard" ... />` + `<HelpButton pageKey="dashboard" />`.
- `frontend/src/pages/BrandsPage.tsx` — same for `"brands"`.
- `frontend/src/pages/ProductsPage.tsx` — same for `"products"`.
- `frontend/src/pages/GeneratePage.tsx` — same for `"generate"`.
- `frontend/src/pages/CampaignsPage.tsx` — same for `"campaigns"`.
- `frontend/src/pages/TopicsPage.tsx` — same for `"topics"`.

**Context shape:**

```ts
interface OnboardingContextValue {
  welcomeSeenAt: Date | null;
  checklistDismissedAt: Date | null;
  seenCoachMarks: string[];
  progress: { hasBrand: boolean; hasProduct: boolean; hasGenerated: boolean } | null;
  dismissWelcome(): Promise<void>;
  dismissChecklist(): Promise<void>;
  markCoachSeen(pageKey: string): Promise<void>;
  hasSeenCoach(pageKey: string): boolean;
  refreshProgress(): Promise<void>;
}
```

- Loads user flags once after auth resolves.
- Loads workspace progress when `WorkspaceContext.activeWorkspaceId` changes.
- `refreshProgress()` is called after actions that could tick checklist items (brand create, product create, generation complete). Simplest wiring: call it from a `useEffect` that refetches whenever the relevant pages detect their own successful creations, or subscribe to the existing SSE generation-complete event in the context.
- Mutations update local state optimistically; the PATCH runs in the background and rolls back on failure.

**Mounting order in the React tree:**

```
<AuthProvider>
  <WorkspaceProvider>
    <ProjectProvider>
      <OnboardingProvider>
        <AppShell>
          <Routes>...</Routes>
          <WelcomeModal />
          <GettingStartedChecklist />
        </AppShell>
      </OnboardingProvider>
    </ProjectProvider>
  </WorkspaceProvider>
</AuthProvider>
```

`OnboardingContext` sits inside workspace/project contexts because progress is workspace-scoped.

**Welcome modal guards:**

- Only renders when `welcomeSeenAt === null` AND `WorkspaceContext.activeWorkspaceId` is resolved (so slide 3's CTA has a workspace to route into).

**Checklist guards:**

- Renders when `welcomeSeenAt !== null` AND `checklistDismissedAt === null` AND `progress !== null`.
- Auto-dismisses ~2 seconds after all three progress items become true (shows "🎉 You're all set" state first, then fades).

## Edge cases

- **Invitation signups** — auto-verified by the invitation flow, but `onboardingWelcomeSeenAt` is still `null` so they see the welcome modal on first login. Correct behavior.
- **Multi-workspace users** — flags are per-user; progress is per-workspace. Switching to a workspace with no brands while the checklist is still undismissed shows an unchecked checklist for that workspace. Once dismissed, it's dismissed everywhere.
- **Existing users on deploy** — the migration script sets `onboardingWelcomeSeenAt = now()`, `onboardingChecklistDismissedAt = now()`, `seenCoachMarks = ["dashboard","brands","products","generate","campaigns","topics"]` for all users created before deploy time. No existing user sees anything new. Only signups after deploy see the tutorial.
- **Dismiss then Help** — the Help button uses page-local state to force-show the coach mark; it doesn't clear `seenCoachMarks`. Next page load still respects dismissed state.
- **React StrictMode double-mount** — `markCoachSeen` is idempotent server-side (array append only if absent); double-fire is safe and converges.
- **Workspace not yet loaded** — welcome modal renders nothing until `activeWorkspaceId` is truthy. Prevents a broken "Create my first brand" CTA.
- **API failure mid-session** — optimistic local state holds; user experience isn't blocked. Retry happens on next PATCH.

## Testing

- **Backend unit tests** (`tests/services/onboarding.service.test.ts`):
  - PATCH idempotency for each of the three fields.
  - Progress aggregation respects `archivedAt: null` filter.
  - Workspace scoping: user sees only their active workspace's progress.
  - Unknown `markCoachSeen` keys are accepted (whitelist is a frontend concern).
- **Frontend manual verification** in browser:
  - Sign up a new user → verify email → welcome modal appears → complete or skip → checklist appears.
  - Create a brand → checklist item 1 ticks.
  - Create a product → checklist item 2 ticks.
  - Generate content → checklist item 3 ticks → auto-dismiss animation.
  - Visit each target page for the first time → coach mark appears.
  - Dismiss a coach mark → refresh page → not shown again.
  - Click `?` icon → coach mark re-shows → close → `?` icon still available next visit.
- No new E2E framework; FCE has no frontend E2E setup and adding one is out of scope.

## Rollout

1. Merge Prisma migration (three nullable/default-empty columns — no locking, no backfill).
2. Run `bun run scripts/migrate-onboarding.ts` on deploy to grandfather existing users.
3. Ship backend and frontend in the same release. No feature flag — grandfathered users see nothing; new signups see the tutorial.

## YAGNI / deferred

- Per-workspace checklist dismiss state.
- Role-specific onboarding paths.
- Analytics / completion funnel.
- Coach marks on Library, Competitor Analyzer, Learning, Workspace Settings, Admin. Can be added later with a one-line `<CoachMark />` addition and no data model or backend change.
- Interactive spotlight/highlight tours (Intro.js style).

---

## Copy (verbatim)

### Welcome modal

*Slide 1 — Welcome*

> **Welcome to FCE 👋**
> You're set up and ready to go. In the next 30 seconds, we'll show you how FCE helps you turn your brand into ready-to-post content.
> `[Skip]` `[Next →]`

*Slide 2 — Workflow*

> **Three steps from idea to post**
> 1. **Brand** — the voice, audience, and messaging rules your content follows.
> 2. **Product** — a specific thing you want to talk about, inheriting the brand.
> 3. **Generate** — pick a product, describe the angle, let AI write + design it.
>
> `[← Back]` `[Skip]` `[Next →]`

*Slide 3 — CTA*

> **Let's set up your first brand**
> You'll give it a name, describe your audience, and paste any reference links you have. Takes about 2 minutes.
>
> `[Skip for now]` `[Create my first brand →]`

### Getting Started checklist

> **Getting started** `×`
> ☐ Create your first brand
> ☐ Add a product to your brand
> ☐ Generate your first content
>
> *When all three complete:* "🎉 You're all set — great work."

### Coach marks (per page)

- **Dashboard** — "This is your dashboard. Generation jobs, recent content, and workspace activity show up here as they happen."
- **Brands** — "Brands hold the voice, audience, and messaging rules that all your content follows. Create one brand per business or sub-brand you manage."
- **Products** — "Products live inside a brand and represent what you're talking about — a service, a launch, a feature. Content is generated against a product, not a brand."
- **Generate** — "Generate content by picking a product and describing the angle. FCE runs the job in the background — you can keep working, and we'll notify you when it's done."
- **Campaigns** — "Campaigns group related content under one goal or launch — e.g., a product launch with posts, stories, and a long-form piece."
- **Topics** — "Topics are content ideas you can save, refine, and turn into posts later. Useful for capturing ideas you're not ready to generate yet."
