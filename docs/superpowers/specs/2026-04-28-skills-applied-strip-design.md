# Skills Applied Strip

**Date:** 2026-04-28
**Status:** Proposed

## Problem

The four auto-injecting generators (Brand Brain, Product Brain, Topic Generator, Content Generator) silently inject 4–6 marketing skills from `backend/src/config/skills/manifests.ts` into every prompt. Users have no visibility into which skills are being applied — the information lives only in `AiProviderLog.skillIds` and is never surfaced in the UI.

A user looking at the Topic Generator page asked "where is the skills used information?". There is none.

## Goal

Show a compact, informational strip on each of the four generator forms listing the marketing skills that will be applied. The strip is read-only — no skill selection, no override, just transparency.

## Non-goals

- Per-workspace or per-user skill overrides. The manifest stays global.
- Historical "skills used" data on past topic/content cards. Separate concern.
- A real tooltip component. The browser-native `title` attribute is sufficient.
- Adding a strip to chat. Chat is `@mention`-driven; the existing autocomplete already shows the available skills.
- Persisting `skillSlugs` on `ContentTopic` or `GenerationOutput`. The strip is fed by the manifest, not by per-row history.

## User experience

A single line just above the primary action button on each of the four pages:

```
Marketing skills applied:  [Customer Research]  [Competitor Profiling]  [Pricing Strategy]  [Marketing Psychology]  …
```

- Label `Marketing skills applied:` in the page's muted text color.
- Chips: rounded pills using the same Tailwind classes as the existing chips on the page (e.g., the Brand Content Pillars on the topic page).
- Hovering a chip shows the skill's frontmatter `description` via the native `title` attribute.
- The strip wraps to additional rows when the chip count is wide.
- If the API call fails or the manifest is empty, the strip renders nothing (no error, no placeholder).

## Architecture

### Backend

`backend/src/routes/skill-list.route.ts` already exposes `GET /api/skills/chat`. Extend it to register one route per auto-injecting generator name from `manifests.ts`:

```
GET /api/skills/brand-brain    → manifest for "brandBrain"
GET /api/skills/product-brain  → manifest for "productBrain"
GET /api/skills/topic          → manifest for "topic"
GET /api/skills/content        → manifest for "content"
```

Each returns `{ slug, name, description }[]`, identical shape to the existing chat endpoint. The existing `chat` route is folded into the same loop — same URL, same behavior, just registered via the same mechanism for consistency.

Implementation: a small loop inside `createSkillListRoutes` over a hardcoded mapping of `GeneratorName → URL slug`. Keeping the URL slug mapping explicit (rather than mechanically transforming `brandBrain` → `brand-brain`) means renaming a generator never silently changes a public URL.

```ts
const ROUTES: Record<GeneratorName, string> = {
  brandBrain: "brand-brain",
  productBrain: "product-brain",
  topic: "topic",
  content: "content",
  chat: "chat",
};

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
```

Auth: same as today's `/api/skills/chat` — mounted under whatever middleware stack already wraps that route. No new RBAC needed since the manifest is non-sensitive global config.

### Frontend

**New hook** `frontend/src/hooks/useGeneratorSkills.ts`:

Same shape as the existing `useAvailableSkills`, but keyed by generator and with one cache slot per generator. Skills are static config — once fetched in a session, never refetched.

```ts
export type GeneratorKey = "brand-brain" | "product-brain" | "topic" | "content";

const cache: Partial<Record<GeneratorKey, SkillSummary[]>> = {};
const inflight: Partial<Record<GeneratorKey, Promise<SkillSummary[]>>> = {};

export function useGeneratorSkills(generator: GeneratorKey) { ... }
```

`SkillSummary` is reused from `useAvailableSkills` (or moved to a shared types file if cleaner — implementation choice for the plan).

**New component** `frontend/src/components/skills/SkillsAppliedStrip.tsx`:

```tsx
<SkillsAppliedStrip generator="topic" />
```

Self-contained — calls `useGeneratorSkills` internally, renders label + chips, returns `null` if skills array is empty.

Chip styling reuses the existing chip classes on the page so the strip looks native to whichever form it's embedded in. If those classes diverge per page, the component picks one neutral pill style (slate background, small rounded) and applies consistently.

**Wire the strip into the four pages:**

- `frontend/src/pages/TopicsPage.tsx` — above the `Generate N Topics` button
- `frontend/src/pages/GeneratePage.tsx` — above the content generate button
- `frontend/src/pages/NewBrandPage.tsx` — above the brand-brain auto-fill / submit button
- `frontend/src/pages/ProductDetailPage.tsx` — above the product-brain auto-fill button

The plan will pin the exact JSX insertion point in each page.

## Edge cases

| Scenario | Behavior |
|---|---|
| API request fails (network, 500) | Strip renders nothing. No error toast — failure is silent and informational only. Matches `useAvailableSkills` behavior. |
| Manifest is empty for a generator | Strip renders nothing. Should never happen at runtime (manifests are validated at boot), but defensive. |
| Manifest is updated after the user has the page cached | Stale list shown until next page reload. Acceptable — the strip is informational, the actual injection on the backend uses the live manifest. |
| Page renders multiple generator buttons (rare) | Render one strip per generator above each button. Component is reusable. |
| Skill `name` missing in frontmatter | Loader's existing `titleCase(slug)` fallback chain produces a name. No special-case in the strip. |
| Loading state | While inflight, render nothing — strip silently appears once cached. No skeleton (would create more visual churn than it saves). |

## Testing

- **Backend unit test** in the existing `backend/tests/routes/skill-list.route.test.ts` (or sibling) — extend the suite to cover all four new routes. Each asserts: status 200, body shape `{ data: [{ slug, name, description }] }`, slugs match the manifest.
- **Frontend manual smoke** — load each of the four pages, confirm the strip appears with the expected chips, hover a chip and confirm the description appears in the browser tooltip.

## Rollout

Backend + frontend land together. No data migration. Existing users see the new strip on next page load.

## YAGNI / deferred

- A custom tooltip component with formatted markdown for descriptions.
- Per-workspace overrides ("disable competitor-profiling for this workspace").
- Click-to-open-skill-doc affordance.
- Showing the skills count in the page header / breadcrumb.
- Adding the strip to chat (chat already shows skills via `@mention` autocomplete).
- Persisting `skillSlugs` on `ContentTopic` / `GenerationOutput` for historical attribution.
