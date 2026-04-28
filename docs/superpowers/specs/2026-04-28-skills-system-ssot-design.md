# Skills as System-Level Config — Design

**Date:** 2026-04-28
**Status:** Proposed

## Problem

Skills today live in the `AiSkill` table and are mapped to generators per-workspace via `WorkspaceSkillMapping`. The model assumes each workspace will curate its own skill selection, but in practice:

- Most workspaces never touch the picker.
- Engineering changes that require coordinated skill updates (e.g., add a new skill to all four generators) require careful workspace-by-workspace migration.
- The DB-backed table doesn't version cleanly with the application — skill content drifts from the codebase.
- Brand-brain and product-brain auto-fill flows don't use skills today, even though their prompts would benefit.

## Goal

Move skills entirely into the codebase. Skills are markdown files in `backend/src/config/skills/library/`, slug = filename. A typed manifest in `backend/src/config/skills/manifests.ts` lists which slugs apply to each of five generators: `brandBrain`, `productBrain`, `topic`, `content`, `chat`. The loader reads everything at server boot, validates manifests reference existing files, and exposes an in-memory registry that replaces today's `prisma.workspaceSkillMapping.findMany()` lookup.

The 40 starter skills come from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) — a community-curated marketing skills library that aligns with FCE's content-generation use cases.

## Non-goals

- **Per-workspace skill customization.** This was the whole reason we're refactoring; the new model has zero per-workspace state.
- **Per-skill activate/deactivate UI.** To remove a skill from a generator, edit `manifests.ts` and ship.
- **Skill versioning at runtime.** Source content is git-versioned. The `metadata.version` frontmatter from Corey's repo is read but unused.
- **Migrating historical `AiProviderLog.skillIds` rows from UUIDs to slugs.** Audit data stays as-is; new log rows store slugs in the same `String[]` column.
- **Adding skill injection to brand-scraping / product-scraping / competitor-pipeline jobs.** Those generators don't have skill support today and stay out of scope. (Adding any of them later is a one-line manifest entry + a `buildSkillContext` call.)
- **Hot-reloading the registry.** A skill content change requires a server restart. Acceptable — same as any other config change.

## Architecture

### File structure

```
backend/src/config/skills/
├── library/
│   ├── ab-test-setup.md
│   ├── ad-creative.md
│   ├── ai-seo.md
│   ├── ... (40 files total)
├── manifests.ts
└── loader.ts
```

### Markdown files

Each `library/<slug>.md` file is a Markdown document with optional YAML frontmatter:

```markdown
---
name: A/B Test Setup
description: When the user wants to plan, design, or implement an A/B test...
metadata:
  version: 1.2.0
---

# A/B Test Setup

You are an expert in experimentation and A/B testing...
```

Frontmatter is **optional**. The loader's fallback chain when frontmatter is absent or partial:

```
name:        frontmatter.name (if present and not equal to slug)
          → first H1 from body
          → titleCase(slug.replace(/-/g, " "))    // "ab-test-setup" → "Ab Test Setup"
description: frontmatter.description
          → first non-empty paragraph of body, truncated to ~200 chars
content:     full markdown body (always)
```

Corey's repo's frontmatter has `name` set equal to the slug (e.g., `name: ab-test-setup`), so for those files the loader will fall through to the H1 derivation, producing readable names like "A/B Test Setup".

### `manifests.ts`

```ts
export type GeneratorName = "brandBrain" | "productBrain" | "topic" | "content" | "chat";

/**
 * Which skills apply to each generator. Slug must match a filename in
 * library/<slug>.md. The loader validates this at boot and refuses to
 * start if a slug is missing.
 *
 * Adding a skill to a generator: list its slug here. To remove, delete
 * the entry. To delete a skill entirely, also remove its .md file.
 */
export const skillManifests: Record<GeneratorName, readonly string[]> = {
	brandBrain:   [/* curated subset for brand DNA work */],
	productBrain: [/* curated subset for product positioning */],
	topic:        [/* curated subset for content ideation */],
	content:      [/* curated subset for post copy + creative */],
	chat:         [/* curated subset for conversational use */],
};
```

The exact slug arrays are filled in during implementation based on Corey's 40 skills. First-pass guesses (the implementer adjusts based on actual skill content):

- `brandBrain` — `customer-research`, `competitor-alternatives`, `competitor-profiling`, `marketing-psychology`, `pricing-strategy`, `product-marketing-context`
- `productBrain` — `product-marketing-context`, `copywriting`, `pricing-strategy`, `marketing-ideas`
- `topic` — `content-strategy`, `social-content`, `ad-creative`, `marketing-ideas`, `customer-research`
- `content` — `copywriting`, `copy-editing`, `social-content`, `ad-creative`, `marketing-psychology`
- `chat` — `copywriting`, `content-strategy`, `marketing-ideas`, `customer-research`

### `loader.ts`

```ts
export interface SkillEntry {
	slug: string;
	name: string;
	description: string;
	content: string;
}

export type SkillRegistry = ReadonlyMap<string, SkillEntry>;

export async function loadSkillRegistry(): Promise<SkillRegistry>;
export function filterByManifest(registry: SkillRegistry, generator: GeneratorName): SkillEntry[];
```

Behavior:

1. Read every `library/*.md` at startup. Parse YAML frontmatter (use a lightweight parser; `gray-matter` is the standard pick if not already a dependency, otherwise inline a tiny one — frontmatter is well-defined and ~30 lines of code).
2. Apply the fallback chain to derive `name` and `description`.
3. Build the `Map<slug, SkillEntry>`.
4. Validate every slug in every manifest exists in the map. Fail with a clear error if not:
   ```
   Skill manifest "topic" references unknown slug "xyz".
   Add backend/src/config/skills/library/xyz.md or remove it from the manifest.
   ```
5. Pass the registry into the composition root's downstream consumers (jobs, services).

### Rewrite of `skill-context-builder.ts`

Today's signatures:

```ts
buildSkillContext(prisma, workspaceId, generator) → SkillContextResult
buildSkillContextFromIds(prisma, skillIds: string[]) → SkillContextResult
```

After:

```ts
buildSkillContext(registry, generator: GeneratorName) → SkillContextResult
buildSkillContextFromSlugs(registry, slugs: string[]) → SkillContextResult
```

`SkillContextResult` shape:

```ts
{
  context: string;
  skillSlugs: string[];   // renamed from skillIds — these are now slugs
  skillNames: string[];
  includedCount: number;
  truncatedCount: number;
}
```

The 8000-char cap (`MAX_SKILL_CONTEXT_CHARS`) and the `### Skill: <name>\n<content>` separator format are preserved byte-for-byte — the renderer logic moves intact.

### Backend wiring changes

| File | Change |
|---|---|
| `backend/src/utils/skill-context-builder.ts` | Rewritten — drops `prisma` dependency, takes `registry` parameter, renames `skillIds` → `skillSlugs`. |
| `backend/src/jobs/topic-generation.job.ts:150` | Pass `skillRegistry` instead of `prisma`; generator key stays `"topic"`. |
| `backend/src/jobs/topic-regeneration.job.ts` | Same. |
| `backend/src/jobs/content-generation.job.ts:162` | Same with `"content"`. |
| `backend/src/jobs/brand-scraping.job.ts` | NEW — call `buildSkillContext(registry, "brandBrain")` and inject into prompt. |
| `backend/src/routes/product.route.ts` | NEW — `/scrape-preview` and `/generate-brain` call `buildSkillContext(registry, "productBrain")` and inject. |
| `backend/src/services/chat.service.ts:88` | Pass `registry` and rename body field `requestedSkillIds` → `requestedSkillSlugs`. Call `buildSkillContextFromSlugs(registry, slugs)`. |
| `backend/src/index.ts` | Load registry at boot via `await loadSkillRegistry()`; pass into job/service constructors. Drop `createSkillRoutes` + `createWorkspaceSkillRoutes` mounts. |
| `backend/src/utils/ai-activity-logger.ts` | Field rename: `skillIds` → `skillSlugs` on the AI activity log input. The DB column `AiProviderLog.skillIds: String[]` keeps its name (audit table), just stores slugs going forward. |

### Routes that disappear

- `backend/src/routes/skill.route.ts` — entire file deleted. The list/detail/mapping/upsert endpoints are obsolete.
- `createSkillRoutes(prisma)` and `createWorkspaceSkillRoutes(prisma)` calls in `backend/src/index.ts` — removed.

### One small new route

- `GET /api/skills/chat` — returns `[{ slug, name, description }]` for the chat manifest. Used by the frontend chat composer's @-mention autocomplete.

```ts
// backend/src/routes/skill-list.route.ts (new, ~20 lines)
export function createSkillListRoutes(registry: SkillRegistry) {
	const app = new Hono();
	app.get("/chat", (c) => {
		const skills = filterByManifest(registry, "chat").map((s) => ({
			slug: s.slug,
			name: s.name,
			description: s.description,
		}));
		return c.json({ data: skills });
	});
	return app;
}
```

Mounted at `/api/skills` so `GET /api/skills/chat` works.

### Schema migration

Drop `AiSkill` and `WorkspaceSkillMapping` from `backend/prisma/schema.prisma`:

```prisma
// REMOVED:
//   model AiSkill { ... }
//   model WorkspaceSkillMapping { ... }
//   relation AiSkill[] / WorkspaceSkillMapping[] from Workspace and AiSkill
```

The `Workspace.skillMappings` relation field is also removed.

`AiProviderLog.skillIds: String[]` STAYS — it's an audit field, just stores slugs going forward.

`bunx prisma db push` drops the two tables on prod. Existing rows are lost. Accepted per the design choice (option B: drop the table, inline everything in config).

### Frontend changes

**Removed:**
- The Workspace Settings → Skills page (route + components).
- The frontend skill API service file.

**Modified:**
- `frontend/src/hooks/useAvailableSkills.ts` — repointed at `GET /api/skills/chat`. Returns `{ slug, name, description }[]`. Cached the same way (per-tab in-memory).
- The chat composer's @-mention autocomplete — same UI, just inserts slug instead of UUID.
- The chat message submission — sends `requestedSkillSlugs: string[]` instead of `requestedSkillIds: string[]`.
- Onboarding tutorial — if any coach mark or copy references the Skills page, drop that reference. (Likely the Workspace Settings coach mark mentions skills as a manageable thing; reword if so.)

### Migration data path

The 40 starter skills come from `coreyhaines31/marketingskills`. The plan includes a one-shot script to fetch them:

```bash
backend/scripts/fetch-corey-skills.ts
```

The script:
1. Lists `skills/*` directories from the GitHub API.
2. Fetches `skills/<slug>/SKILL.md` for each one.
3. Writes to `backend/src/config/skills/library/<slug>.md` verbatim (preserves frontmatter as-is — loader handles slug-equals-name fallback).
4. Reports count + any failures.

Run once at the start of implementation. The output (40 markdown files) is committed to the repo. Script can be deleted after — its job is done.

## Edge cases

| Scenario | Behavior |
|---|---|
| Loader finds a `.md` with malformed YAML frontmatter | Treat as no frontmatter — apply full fallback chain. Don't crash; warn-log the file path. |
| Manifest references slug that doesn't exist | Server boot fails with the "Add or remove" error message. Fail-fast. |
| `.md` file in `library/` not referenced by any manifest | Loaded but unused. No warning — lets you stage future skills. |
| Skill body exceeds 8000-char cap when rendered | Truncates at boundary, reports `truncatedCount > 0`. Same as today. |
| Chat user types a slug that's not in the chat manifest (typo or @mention of a skill from another generator) | `buildSkillContextFromSlugs` looks up by slug; if found in registry, includes it; if not found, silently drops. NO gating against the chat manifest — manifests gate UI display, not lookup. Power users can pull any skill by typing its slug; the autocomplete just won't show it. |
| `AiProviderLog` rows from before the change have UUIDs in `skillIds` | Stay as-is. New rows store slugs. The column is `String[]`; analytics consumers treat it as opaque. Pre-existing UUIDs that referenced now-deleted `AiSkill` rows become useless but don't break anything. |
| Frontend cache returns a stale UUID after deploy | `buildSkillContextFromSlugs` doesn't find it → empty context for that ref. Same effect as a typo. Frontend cache busts on next page load. |
| User adds a new `.md` file but forgets to update the manifest | The skill exists in the registry but won't be included in any generator's prompt. No error — the file is just inert. Acceptable: not every skill needs to be active. |
| Two manifests reference the same slug (e.g., `copywriting` in both `topic` and `content`) | Both generators include the skill. Expected behavior. |

## Testing

- **Backend unit tests** in `backend/tests/utils/skill-context-builder.test.ts` (rewrite of any existing test, or new):
  - `buildSkillContext(registry, "topic")` returns the manifest's slugs in order.
  - `buildSkillContextFromSlugs(registry, [...])` skips unknown slugs silently.
  - Truncation at `MAX_SKILL_CONTEXT_CHARS` boundary works for both functions.
  - Loader fallback chain: file with no frontmatter → name from H1; H1 missing → name from filename.
  - Loader fails on missing manifest slug.
- **Manual smoke**:
  - Restart backend after fetching skills + landing the loader. Server boots.
  - Submit a topic generation and a content generation. Confirm AI activity logs show `skillSlugs: ["copywriting", ...]` instead of UUIDs.
  - Open the campaign chat. @-mention a skill. Confirm the autocomplete shows `name` and the message body submits with `requestedSkillSlugs`. Verify the AI response reflects the skill's content.
  - Visit Workspace Settings → confirm the Skills tab is gone.
- No new E2E framework needed — existing manual-smoke pattern.

## Rollout

1. Land the new code, the 40 markdown files, the schema migration, and the frontend updates in a single deploy.
2. Same deploy: drop the `AiSkill` + `WorkspaceSkillMapping` tables via `prisma db push`. (Their rows are lost.)
3. After deploy, server fails fast at boot if the manifest references missing slugs — caught in CI / staging before prod.

No data backfill, no per-workspace migration, no parallel-write window. The new system is the source of truth from deploy onwards.

## YAGNI / deferred

- Hot-reload of the skill registry without server restart.
- Per-workspace overrides re-introduced as a thin layer on top.
- Versioning skills (the `metadata.version` frontmatter is read but unused).
- A `/api/skills/all` endpoint or admin UI for browsing skills — not needed; the markdown files are the documentation.
- Skill activate/deactivate without removing from manifest. To deactivate, comment out or remove the slug from the manifest array.
- Adding skill injection to `competitor-pipeline` (creator video analysis), `link-scraping`, `document-extraction`, `research-run`, or `creator-enrichment` jobs. Those generators don't have skill support today and stay out of scope. (Adding any of them later is a one-line manifest entry + a `buildSkillContext` call.)
- Auto-discovering manifest entries by filename. Manifests stay explicit so the per-generator curation is intentional.
