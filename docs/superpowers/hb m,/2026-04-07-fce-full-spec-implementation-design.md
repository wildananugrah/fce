# FCE Full Spec Implementation Design

**Date:** 2026-04-07
**Goal:** Bridge all gaps between the current FCE codebase and the full specification defined across 7 documents (PRD, ERD, API Spec, Sitemap, Wireframe, Blueprint, Strategic Content OS PDF).

---

## Current State Summary

The codebase implements ~60% of the full spec:
- Auth, workspace multi-tenancy, roles (admin/editor/viewer)
- Brand/Product CRUD with brain versions
- Content generation pipeline (pg-boss → AI → SSE)
- Campaign management with AI strategy generation
- Topic management with batch generation
- Content library with approve/reject/feedback
- Taxonomy (frameworks, hook types)
- Observability (Winston, Loki, Prometheus, Jaeger)
- 14 frontend pages, all functional

---

## Gap Analysis & Implementation Phases

### Phase 1: Database Schema Alignment

**Goal:** Align Prisma schema with the full ERD (21 tables).

**New tables to add:**
1. `BrandDocument` — file uploads linked to brand/product (fileName, fileType, fileUrl, extractionStatus, sourceType)
2. `DocumentChunk` — extracted text chunks with embedding support (chunkIndex, contentText, embeddingId, metadataJson, retrievalTags)
3. `OutputSection` — decomposed generation output into typed sections (hook, caption, cta, hashtag, visual_direction, rationale) with section_order
4. `CampaignBrief` — structured brief builder (objectiveDetail, channelMix JSONB, mandatoryDeliverables JSONB, culturalContext, trendContext, competitiveContext, kpiPreference JSONB, toneDirection)
5. `CampaignChannelRole` — per-channel role assignment from campaign output (channelCode, channelRole, priorityOrder)
6. `CampaignDeliverable` — deliverable items from campaign output (deliverableType, deliverableName, recommendedChannel, funnelStage, qtyRecommendation)
7. `CampaignFeedbackEvent` — feedback events for campaign outputs (same pattern as OutputFeedbackEvent)
8. `TonePreset` — taxonomy table for tone options (name, description, isGlobal)
9. `VisualStyle` — taxonomy table for visual style options (name, description, isGlobal)
10. `SavedTemplate` — reusable generation/campaign presets (templateType, name, configurationJson)

**Schema modifications to existing tables:**
- `GenerationRequest`: add `objective`, `tonePresetId`, `visualStyleId`, `outputLength`, `sourceContextSnapshot` JSONB
- `Campaign`: add `audienceSegment`, `durationStart`, `durationEnd`, `budgetMin`, `budgetMax`, `keyMessage`, `currentVersionId`
- `GenerationOutput`: add `rationale` text field, `versionNo` integer
- Ensure `RecommendationProfile` has all JSONB fields: preferredFrameworks, preferredHooks, preferredTones, preferredVisualStyles, preferredPlatforms, commonEditPatterns

**Files to modify:**
- `backend/prisma/schema.prisma`

**Files to create:**
- None (schema changes only)

---

### Phase 2: Document Ingestion System (PRD Module D)

**Goal:** Upload PDF/DOCX/TXT files, extract text, chunk, and store for retrieval during generation.

**Backend changes:**

**New files:**
- `backend/src/routes/document.route.ts` — Upload (multipart), list, get status, get chunks, reprocess
- `backend/src/services/document.service.ts` — Upload handling, extraction orchestration
- `backend/src/repositories/document.repository.ts` — BrandDocument + DocumentChunk CRUD
- `backend/src/jobs/document-extraction.job.ts` — Async text extraction from uploaded files
- `backend/src/interfaces/repositories/document.repository.interface.ts`
- `backend/src/interfaces/services/document.service.interface.ts`
- `backend/src/types/document.types.ts`

**Implementation details:**
- Multipart file upload via Hono's `parseBody()`
- Store files in MinIO (already configured in docker-compose)
- pg-boss job for extraction: PDF → text (use `pdf-parse`), DOCX → text (use `mammoth`)
- Chunk text into ~500 token segments with overlap
- Store chunks in `DocumentChunk` table
- No embedding/vector search for MVP — use keyword-based retrieval
- Extraction status tracking: pending → processing → completed → failed

**Frontend changes:**
- Add document upload section to BrandsPage detail modal (new tab "Documents")
- File upload component with drag-and-drop
- Document list with extraction status badges
- Chunk viewer (expandable list)

**Estimated effort:** Medium-High

---

### Phase 3: Output Sections Architecture (PRD Module E, ERD Layer 2)

**Goal:** Decompose generation outputs into typed, individually editable sections.

**Backend changes:**
- Modify content generation job to save output as `OutputSection` records instead of single JSON blob
- Each section: hook (multiple), caption (multiple), cta (multiple), hashtag, visual_direction, rationale
- Add per-section regenerate endpoint: `POST /api/workspaces/:wId/generations/:id/outputs/:outputId/sections/:sectionId/regenerate`
- Add section edit endpoint: `PATCH /api/workspaces/:wId/generations/:id/outputs/:outputId/sections/:sectionId`
- Modify library service to return outputs with sections

**Frontend changes:**
- Redesign generation result view: tabbed section viewer (Hooks | Caption | CTA | Hashtags | Visual Direction | Rationale)
- Each section has: editable text area, "Regenerate This Section" button, "Save Edit" button
- Source context summary bar at top of result
- Per-section feedback tracking

**AI Provider changes:**
- Update prompt templates to return structured sections (already partially done — content is returned as JSON)
- Parse AI response into individual OutputSection records

**Estimated effort:** Medium

---

### Phase 4: Campaign Brief Builder (API Spec, Sitemap Flow F)

**Goal:** Structured 13-field campaign brief that feeds into AI strategy generation.

**Backend changes:**

**New/Modified files:**
- Create `CampaignBrief` model operations in campaign repository
- Extend campaign service with brief creation and strategy generation flow
- Modify campaign generation job to use brief data as input
- Add campaign channel roles and deliverables to output

**Campaign Brief fields (13):**
1. Campaign name
2. Brand selection
3. Product selection (optional)
4. Objective detail
5. Audience segment
6. Duration (start + end dates)
7. Budget range (min + max)
8. Key message
9. Channel mix (multi-select: Instagram, Facebook, X, YouTube, TikTok)
10. Mandatory deliverables
11. Cultural context
12. Trend context
13. Competitive context

**Campaign Strategy Output sections:**
- Big Idea + Theme
- Message Pillars (array)
- Audience Insight
- Funnel Journey (awareness → consideration → conversion → loyalty)
- Channel Role Mapping (per platform)
- Content Pillar Plan
- Deliverables list with funnel stage
- Activation Ideas
- KOL Direction
- Budget Draft
- KPI Targets
- Strategy Rationale

**Frontend changes:**
- Redesign CampaignsPage: separate "Brief Builder" view with 13 fields
- Campaign strategy result page with section navigation (left sidebar)
- Each strategy section editable + regeneratable
- "Use for Content" button: bridge campaign → content generator with pre-filled context

**Estimated effort:** Medium-High

---

### Phase 5: Tone Presets & Visual Styles Taxonomy

**Goal:** Add tone preset and visual style taxonomy tables and CRUD.

**Backend changes:**
- Add to taxonomy repository: `findAllTonePresets()`, `findAllVisualStyles()`
- Add to taxonomy service and route
- Seed data: 8 tone presets (Professional, Casual, Playful, Authoritative, Empathetic, Inspirational, Educational, Conversational), 6 visual styles
- Admin CRUD endpoints for taxonomy management

**Frontend changes:**
- Add tone preset and visual style selectors to GeneratePage
- Admin page: taxonomy management tabs (Frameworks, Hook Types, Tone Presets, Visual Styles)

**Estimated effort:** Low

---

### Phase 6: Advanced Generator UI (Wireframe, Sitemap)

**Goal:** Basic/Advanced mode toggle with 10 selectors and recommendation chips.

**Frontend changes:**
- **Basic Mode:** Brand + Product + Platform + Objective → Generate (4 fields)
- **Advanced Mode:** All 10 selectors:
  1. Brand
  2. Product (optional)
  3. Platform (Instagram, Facebook, X, YouTube, TikTok)
  4. Objective (awareness, engagement, education, conversion, launch)
  5. Framework (from taxonomy)
  6. Hook Type (from taxonomy)
  7. Tone Preset (from taxonomy)
  8. Visual Style (from taxonomy)
  9. Output Length (short, medium, long)
  10. Language
- Mode toggle button (Basic ↔ Advanced)
- Recommendation chips: show suggested frameworks/hooks/tones based on brand's RecommendationProfile
- Additional context textarea
- Right helper panel in Advanced mode: source context summary, recommended settings

**Backend changes:**
- Modify generation request to accept new fields (objective, tonePresetId, visualStyleId, outputLength)
- Pass these to AI provider prompt assembly

**Estimated effort:** Medium

---

### Phase 7: Recommendation & Learning System (PRD Module I, ERD Layer 4)

**Goal:** Track user preferences and surface recommendations.

**Backend changes:**

**New files:**
- `backend/src/routes/recommendation.route.ts` — Get recommendations per brand/product/campaign
- `backend/src/services/recommendation.service.ts` — Compute and retrieve recommendation profiles
- `backend/src/repositories/recommendation.repository.ts` — RecommendationProfile CRUD
- `backend/src/jobs/recommendation-recompute.job.ts` — Async recomputation of profiles based on feedback events
- `backend/src/interfaces/repositories/recommendation.repository.interface.ts`
- `backend/src/interfaces/services/recommendation.service.interface.ts`

**Recommendation computation logic:**
- On each feedback event (approve/reject/edit/regenerate), trigger recompute job
- Aggregate: count approved outputs per framework, hook type, tone, platform
- Track common edit patterns (which sections get edited most, typical edit types)
- Store as JSONB in RecommendationProfile

**Frontend changes:**
- Add recommendation chips to GeneratePage (suggested settings based on brand/product history)
- Learning Center page redesign:
  - Brand recommendations tab
  - Product recommendations tab
  - Framework insights (success rates)
  - Hook type insights
  - Tone preference insights
  - Common edit patterns list

**Estimated effort:** Medium

---

### Phase 8: Admin Panel (API Spec, Wireframe)

**Goal:** Full admin functionality for superadmins.

**Backend changes:**

**New files:**
- `backend/src/routes/admin.route.ts` — User management, taxonomy CRUD, audit logs
- `backend/src/services/admin.service.ts` — Admin business logic
- `backend/src/middlewares/admin.middleware.ts` — Superadmin role check

**Admin endpoints:**
- `GET /api/admin/users` — List all users
- `PATCH /api/admin/users/:id` — Update user (role, status)
- `GET /api/admin/audit-logs` — List audit logs with filters
- `POST /api/admin/frameworks` — Create framework
- `PATCH /api/admin/frameworks/:id` — Update framework
- `DELETE /api/admin/frameworks/:id` — Delete framework
- Same CRUD for hook-types, tone-presets, visual-styles

**Frontend changes:**
- AdminPage redesign with left section nav:
  - User Management (table with role/status management)
  - Taxonomy Management:
    - Frameworks tab
    - Hook Types tab
    - Tone Presets tab
    - Visual Styles tab
  - Audit Logs (filterable table)

**Estimated effort:** Medium

---

### Phase 9: 3-Panel Brain Editor (Wireframe)

**Goal:** Redesign brand and product detail views with 3-panel layout.

**Frontend changes only:**
- **Left panel:** Section navigation (10 sections for brand, 11 for product)
- **Center panel:** Editor form for selected section (structured fields, not just textareas)
- **Right panel:** Context info (source summary, extraction status, version info, recommendations)

**Brand sections (10):**
1. Overview (name, category, summary)
2. Identity (vision, mission, values)
3. Tone of Voice (primary tone, secondary tone, do/don't)
4. Audience Persona (structured: name, age range, occupation, interests, pain points)
5. Messaging Rules (do/don't rules, key messages)
6. Vocabulary (whitelist/blacklist with add/remove UI)
7. Visual Direction (notes, mood, style)
8. Cultural Relevance (market context, cultural notes)
9. Documents (upload/list, linked to Phase 2)
10. Brain Versions (version history, activate/archive)

**Product sections (11):**
1. Overview (name, type, brand link)
2. Identity (description, category)
3. USP & RTB
4. Features & Benefits (functional + emotional, structured lists)
5. Audience Fit
6. Use Occasions
7. Claims & Disclaimers
8. Platform Relevance (per-platform notes)
9. Content Angles (structured list)
10. Brain Versions
11. Activity Log

**Implementation approach:**
- Extract brain editor into dedicated page routes (`/brands/:id`, `/products/:id`)
- Use tabs or section nav for navigation between sections
- Each section is a form with structured inputs (not raw JSON textareas)
- Save per-section, not all-at-once

**Estimated effort:** High (mostly frontend work)

---

### Phase 10: Dashboard Enhancement

**Goal:** Make dashboard dynamic with real data.

**Backend changes:**
- Add dashboard stats endpoint: `GET /api/workspaces/:wId/dashboard/stats`
  - Returns: brandCount, productCount, generationCount, campaignCount, apiUsage, recentGenerations, topRecommendations

**Frontend changes:**
- KPI cards with real data from API
- Recent generations list (last 10 with status badges)
- Quick actions (Create Brand, Add Product, Generate Content, Create Campaign)
- Recommendations snapshot (top 3 suggestions)
- Usage summary (API usage bar)

**Estimated effort:** Low

---

### Phase 11: Settings Page Enhancement

**Goal:** User profile editing and workspace configuration.

**Backend changes:**
- Add `PATCH /api/auth/profile` — Update user profile (fullName, avatarUrl)

**Frontend changes:**
- Editable profile fields (name, avatar URL)
- Password change form
- Notification preferences (future)

**Estimated effort:** Low

---

## Implementation Priority & Phasing

### Sprint 1: Foundation (Phases 1, 5, 10, 11)
- Database schema alignment
- Tone presets & visual styles
- Dashboard enhancement
- Settings enhancement

### Sprint 2: Core Generation (Phases 3, 6)
- Output sections architecture
- Advanced generator UI

### Sprint 3: Documents & Campaign (Phases 2, 4)
- Document ingestion system
- Campaign brief builder

### Sprint 4: Intelligence & Admin (Phases 7, 8)
- Recommendation & learning system
- Admin panel

### Sprint 5: UX Polish (Phase 9)
- 3-panel brain editor
- Overall UX refinements

---

## Architecture Decisions

### 1. Document Storage
Use MinIO (already in docker-compose) for file storage. Store file metadata in PostgreSQL, binary files in MinIO buckets.

### 2. Text Extraction
Use `pdf-parse` for PDF and `mammoth` for DOCX. Process asynchronously via pg-boss job. No vector embeddings for MVP — use simple keyword-based retrieval from chunks.

### 3. Output Sections
Decompose AI output into typed sections stored as separate database records. This enables per-section regeneration and editing without re-running the full prompt.

### 4. Recommendation Engine
Simple frequency-based recommendation (count approved outputs per framework/hook/tone). No ML model — compute aggregates from feedback events asynchronously.

### 5. Campaign Strategy Structure
Campaign outputs decomposed into structured sections (CampaignChannelRole, CampaignDeliverable) rather than single JSON blob. Enables per-section editing.

### 6. Frontend Routing for Detail Views
Brand and product detail views get their own routes (`/brands/:id`, `/products/:id`) instead of modals. This supports the 3-panel layout and deep linking.

---

## Testing Strategy

- **Backend unit tests:** Add tests for each new service (document, recommendation, admin) following existing mock repository pattern
- **Integration points:** Test AI provider prompt assembly with new fields (objective, tone, visual style)
- **Frontend:** Manual testing of new UI flows; ensure all forms validate correctly

---

## Risk Considerations

1. **Document extraction quality** — PDF parsing can be unreliable for complex layouts. Mitigation: allow manual chunk editing.
2. **Prompt size** — Adding document chunks + brand context + product context can exceed token limits. Mitigation: limit chunk count per generation, prioritize most relevant chunks.
3. **Migration complexity** — Schema changes must be backward-compatible with existing data. Mitigation: use Prisma migrations with default values for new required fields.
4. **Frontend scope** — 3-panel brain editor is the largest frontend change. Mitigation: implement incrementally, section by section.
