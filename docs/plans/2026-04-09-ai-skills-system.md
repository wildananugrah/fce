# AI Skills System — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a workspace-level AI Skills system where admins can manage marketing skills (from marketingskills repo) and map them to generators (Topic, Content, Campaign). When generating, the mapped skills' prompts are injected into the AI context, improving output quality.

**Architecture:** Skills are stored in the database (not as files). Each skill has a `name`, `slug`, `description`, `content` (the full SKILL.md prompt text), and `category`. A join table maps skills to generators per workspace. During generation, the job fetches mapped skills and appends their content to the AI prompt.

**Tech Stack:** Prisma 7 (PostgreSQL), Hono routes, React frontend

---

## Data Model

```
AiSkill (global, seeded from marketingskills repo)
├── id, slug, name, description, content (TEXT), category
├── referenceFiles (JSON - array of {name, content})
└── isSystem (boolean - true for seeded, false for custom)

WorkspaceSkillMapping (per workspace, maps skills to generators)
├── id, workspaceId, skillId, generator (enum: topic|content|campaign)
└── isActive (boolean)
```

## Skill Categories (for UI grouping)
- **strategy** — content-strategy, launch-strategy, marketing-ideas, pricing-strategy
- **content** — copywriting, copy-editing, social-content, ad-creative
- **seo** — ai-seo, seo-audit, programmatic-seo, schema-markup, site-architecture
- **conversion** — page-cro, form-cro, popup-cro, signup-flow-cro, onboarding-cro, paywall-upgrade-cro, ab-test-setup
- **outreach** — cold-email, email-sequence, lead-magnets, paid-ads
- **research** — customer-research, competitor-alternatives, marketing-psychology, product-marketing-context
- **growth** — churn-prevention, referral-program, free-tool-strategy, community-marketing, revops, sales-enablement, analytics-tracking

---

## Task 1: Prisma Schema — AiSkill + WorkspaceSkillMapping

**Files:**
- Modify: `backend/prisma/schema.prisma`

### Step 1.1: Add AiSkill model

```prisma
model AiSkill {
  id              String   @id @default(uuid())
  slug            String   @unique
  name            String
  description     String   @db.Text
  content         String   @db.Text
  category        String
  referenceFiles  Json?    @map("reference_files")
  isSystem        Boolean  @default(true) @map("is_system")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  workspaceMappings WorkspaceSkillMapping[]

  @@map("ai_skills")
}

model WorkspaceSkillMapping {
  id          String  @id @default(uuid())
  workspaceId String  @map("workspace_id")
  skillId     String  @map("skill_id")
  generator   String  // "topic" | "content" | "campaign"
  isActive    Boolean @default(true) @map("is_active")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  skill     AiSkill   @relation(fields: [skillId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, skillId, generator])
  @@index([workspaceId, generator])
  @@map("workspace_skill_mappings")
}
```

Add reverse relation on Workspace:
```prisma
// In model Workspace:
skillMappings WorkspaceSkillMapping[]
```

### Step 1.2: Run prisma db push + generate

```bash
cd backend && set -a && source .env && set +a && bunx prisma db push && bunx prisma generate
```

### Step 1.3: Commit

---

## Task 2: Seed Script — Import All 35 Skills

**Files:**
- Create: `backend/prisma/seeds/ai-skills.ts`
- Modify: `backend/prisma/seed.ts` (or create if doesn't exist)

### Step 2.1: Copy skill files into the project

Copy `/tmp/marketingskills/skills/` to `backend/data/marketing-skills/` for reference. The seed script reads each SKILL.md, parses the frontmatter (name, description), reads reference files, and inserts into AiSkill table.

### Step 2.2: Create seed script

The script:
1. Reads each skill directory under `backend/data/marketing-skills/`
2. Parses SKILL.md frontmatter for name, description
3. Reads all `references/*.md` files into a JSON array
4. Assigns category based on a hardcoded mapping
5. Upserts into AiSkill table (by slug)

### Step 2.3: Run seed

```bash
cd backend && set -a && source .env && set +a && bunx prisma db seed
```

### Step 2.4: Commit

---

## Task 3: Backend — Skills CRUD API

**Files:**
- Create: `backend/src/routes/skill.route.ts`
- Create: `backend/src/repositories/skill.repository.ts`
- Create: `backend/src/services/skill.service.ts`
- Create: `backend/src/interfaces/repositories/skill.repository.interface.ts`
- Create: `backend/src/interfaces/services/skill.service.interface.ts`
- Modify: `backend/src/index.ts` (wire routes)

### Endpoints:

**Global skills (admin):**
- `GET /api/skills` — List all skills (with search, category filter)
- `POST /api/skills` — Create custom skill
- `PATCH /api/skills/:id` — Update skill
- `DELETE /api/skills/:id` — Delete custom skill (isSystem=false only)

**Workspace skill mappings:**
- `GET /api/workspaces/:workspaceId/skills` — List skills mapped to this workspace (grouped by generator)
- `POST /api/workspaces/:workspaceId/skills/map` — Map a skill to a generator `{ skillId, generator }`
- `DELETE /api/workspaces/:workspaceId/skills/map/:mappingId` — Remove a mapping
- `GET /api/workspaces/:workspaceId/skills/generator/:generator` — Get active skills for a specific generator (used by jobs)

### Step 3.1 - 3.5: Implement repository, service, routes, wire in index.ts

### Step 3.6: Commit

---

## Task 4: Inject Skills into Generation Jobs

**Files:**
- Modify: `backend/src/jobs/content-generation.job.ts`
- Modify: `backend/src/jobs/topic-generation.job.ts`
- Modify: `backend/src/jobs/campaign-generation.job.ts` (if exists)

### How it works:

When a generation job runs:
1. Fetch active skill mappings for this workspace + generator type
2. For each mapped skill, get the skill content + reference files
3. Prepend the skill content to the AI prompt as additional system context

Example in content-generation.job.ts:
```typescript
// After building brand/product context, before calling generator:
const skillMappings = await this.prisma.workspaceSkillMapping.findMany({
  where: { workspaceId: request.workspaceId, generator: "content", isActive: true },
  include: { skill: true },
});

const skillContext = skillMappings
  .map(m => {
    let ctx = m.skill.content;
    if (m.skill.referenceFiles) {
      const refs = m.skill.referenceFiles as { name: string; content: string }[];
      ctx += "\n\n" + refs.map(r => `## Reference: ${r.name}\n${r.content}`).join("\n\n");
    }
    return ctx;
  })
  .join("\n\n---\n\n");
```

Then pass `skillContext` to the generator alongside brand/product context.

### Step 4.1: Update content-generation.job.ts
### Step 4.2: Update topic-generation.job.ts
### Step 4.3: Update campaign-generation.job.ts (if exists)
### Step 4.4: Commit

---

## Task 5: Frontend — AI Skills Management Page

**Files:**
- Create: `frontend/src/pages/SkillsPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)
- Modify: `frontend/src/components/layout/AppShell.tsx` (add nav item)

### Page layout:

**Header:** "AI Skills" + "Add Custom Skill" button

**Two views (tabs):**

**Tab 1: Skill Library** — All available skills (system + custom)
- Search bar + category filter dropdown
- Grid of skill cards: name, description, category badge, "System" or "Custom" badge
- Click to view/edit (custom only, system skills are read-only)
- Delete button for custom skills

**Tab 2: Generator Mappings** — Configure which skills are active per generator
- Three columns: Topic Generator | Content Generator | Campaign Generator
- Each column shows mapped skills as pills with remove (x) button
- "Add Skill" button per column opens a modal to pick from skill library
- Drag to reorder (nice to have, not MVP)

### Step 5.1: Create SkillsPage.tsx
### Step 5.2: Add route and nav item
### Step 5.3: Commit

---

## Task 6: Frontend — Skill Detail/Edit Modal

**Files:**
- Create: `frontend/src/components/skills/SkillDetailModal.tsx`
- Create: `frontend/src/components/skills/SkillFormModal.tsx`

### SkillDetailModal:
- View skill: name, description, category, full content (markdown rendered or pre-formatted)
- Reference files shown as expandable sections
- For custom skills: Edit and Delete buttons

### SkillFormModal:
- Create/Edit custom skill form
- Fields: Name, Slug (auto-generated), Description, Category (dropdown), Content (textarea/code editor)
- Save creates via POST /api/skills or updates via PATCH

### Step 6.1: Create both modals
### Step 6.2: Wire into SkillsPage
### Step 6.3: Commit

---

## Task 7: Frontend — Show Active Skills in Generator Pages

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx`
- Modify: `frontend/src/pages/GeneratePage.tsx`
- Modify: `frontend/src/pages/CampaignsPage.tsx` (if exists)

### What to add:

In each generator page, below the form header, show a small "Active Skills" section:
- Pill badges showing mapped skill names (e.g., "content-strategy", "social-content")
- Link to "Manage Skills" (goes to /skills page)
- If no skills mapped, show "No AI skills configured. Add skills to improve output quality."

This gives users visibility into which skills are influencing their generation.

### Step 7.1: Create a shared ActiveSkillsBadges component
### Step 7.2: Add to each generator page
### Step 7.3: Commit

---

## Task 8: Build Verification & Integration Test

### Step 8.1: Run backend type check
```bash
cd backend && bunx tsc --noEmit
```

### Step 8.2: Run frontend build
```bash
cd frontend && bun run build
```

### Step 8.3: Manual test flow
1. Seed skills → verify 35 skills appear in /skills page
2. Create a custom skill → verify it appears in library
3. Map skills to generators → verify mappings save
4. Generate topics with skills mapped → verify skill context in AI prompt (check logs)
5. Generate content with skills mapped → verify improved output

### Step 8.4: Final commit

---

## Summary

| Task | Description | Complexity |
|------|-------------|------------|
| 1 | Prisma schema (AiSkill + WorkspaceSkillMapping) | Small |
| 2 | Seed script (import 35 skills from repo) | Medium |
| 3 | Backend CRUD API (skills + mappings) | Medium |
| 4 | Inject skills into generation jobs | Medium |
| 5 | Frontend Skills management page | Large |
| 6 | Skill detail/edit modals | Medium |
| 7 | Show active skills in generator pages | Small |
| 8 | Build verification | Small |

**Total new files:** ~10 backend + ~4 frontend
**Modified files:** ~8 (schema, jobs, generator pages, app router)
