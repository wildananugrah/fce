# FCE — Full Rewrite Design Spec

**Date:** 2026-04-07
**Approach:** Big Bang Rewrite (Clean Slate)
**Status:** Draft

---

## 1. Overview

Full rewrite of the FCE from a Next.js/Supabase monolith to a self-hosted architecture with separated frontend and backend. No data migration — fresh start.

### Current State

- Next.js 14 monolith deployed on Vercel
- Supabase for auth, database, RLS
- Anthropic Claude API for AI generation
- Dark purple theme, large single-file page components (400-830 lines each)
- ~19 TypeScript files, ~8,274 lines

### Target State

- Hono backend (Bun runtime, PM2 managed)
- React + Vite frontend (CSR SPA, Nginx served)
- Self-hosted PostgreSQL with Prisma ORM (via docker-compose)
- MinIO for object storage (via docker-compose)
- Configurable AI providers (Anthropic + Gemini)
- Black/white/light gray professional UI
- SOLID architecture with manual dependency injection

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nginx (port 80)                          │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │  /api/* → proxy to  │    │  /* → serve frontend/dist/      │ │
│  │  Hono backend :3001 │    │  (React + Vite static build)    │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌──────────────────┐          ┌──────────────────┐
│  Hono Backend    │          │  React Frontend  │
│  (PM2 managed)   │          │  (Vite CSR SPA)  │
│  Port 3001       │          │  Static files     │
│                  │          │                  │
│  - REST API      │          │  - Tailwind CSS  │
│  - JWT Auth      │          │  - React Router  │
│  - SSE endpoint  │          │  - SSE client    │
│  - pgboss jobs   │          │  - JWT in memory │
└────────┬─────────┘          └──────────────────┘
         │
    ┌────┴────────────────┐
    ▼                     ▼
┌──────────┐     ┌──────────────┐
│PostgreSQL│     │    MinIO      │
│(docker)  │     │   (docker)   │
│+ pgboss  │     │              │
└──────────┘     └──────────────┘
```

**Key decisions:**

- Single backend — no separate websocket service. SSE runs on the same Hono server.
- Nginx reverse-proxies `/api/*` to Hono, serves static frontend files for everything else.
- pgboss runs inside the Hono process — jobs registered in the composition root.
- PostgreSQL + MinIO via docker-compose. Backend and frontend run bare-metal (PM2 / Nginx).
- No websocket/ directory — SSE replaces WebSocket for AI generation notifications.

---

## 3. Repository Structure

```
fce/
├── frontend/                 # React + Vite SPA
├── backend/                  # Hono API server
├── minio/                    # MinIO config
├── monitoring/               # Observability stack (Grafana, Loki, Jaeger, Prometheus)
├── docs/                     # Documentation, todo, lessons learned
├── docker-compose.yml        # PostgreSQL + MinIO
├── nginx.conf                # Nginx config
└── .env.example              # Environment template
```

---

## 4. Backend Architecture

### 4.1 Directory Structure

```
backend/
├── src/
│   ├── index.ts                          # Composition root — wires all dependencies
│   ├── tracing.ts                        # OpenTelemetry setup (imported first)
│   │
│   ├── routes/
│   │   ├── auth.route.ts                 # login, signup, refresh, me
│   │   ├── workspace.route.ts            # CRUD, members, invitations
│   │   ├── brand.route.ts                # CRUD + brain versions
│   │   ├── product.route.ts              # CRUD + brain versions
│   │   ├── generation.route.ts           # request generation, list outputs
│   │   ├── campaign.route.ts             # CRUD campaigns
│   │   ├── topic.route.ts                # CRUD topics
│   │   ├── library.route.ts              # list/approve/reject outputs
│   │   ├── taxonomy.route.ts             # frameworks, hook types
│   │   ├── admin.route.ts                # superadmin operations
│   │   └── sse.route.ts                  # SSE connection endpoint
│   │
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── workspace.service.ts
│   │   ├── brand.service.ts
│   │   ├── product.service.ts
│   │   ├── generation.service.ts         # orchestrates AI generation
│   │   ├── campaign.service.ts
│   │   ├── topic.service.ts
│   │   ├── library.service.ts
│   │   ├── taxonomy.service.ts
│   │   ├── admin.service.ts
│   │   └── notification.service.ts       # manages SSE connections + pushes events
│   │
│   ├── repositories/
│   │   ├── user.repository.ts
│   │   ├── workspace.repository.ts
│   │   ├── brand.repository.ts
│   │   ├── product.repository.ts
│   │   ├── generation.repository.ts
│   │   ├── campaign.repository.ts
│   │   ├── topic.repository.ts
│   │   ├── taxonomy.repository.ts
│   │   └── admin.repository.ts
│   │
│   ├── providers/
│   │   ├── anthropic.provider.ts         # Claude implementation
│   │   ├── gemini.provider.ts            # Gemini implementation
│   │   ├── minio.provider.ts             # File storage
│   │   └── winston-logger.provider.ts    # Logging
│   │
│   ├── jobs/
│   │   ├── content-generation.job.ts     # single image, carousel, video, story
│   │   ├── campaign-generation.job.ts
│   │   ├── topic-generation.job.ts
│   │   └── brand-scraping.job.ts
│   │
│   ├── interfaces/
│   │   ├── services/
│   │   │   ├── auth.service.interface.ts
│   │   │   ├── workspace.service.interface.ts
│   │   │   ├── brand.service.interface.ts
│   │   │   ├── product.service.interface.ts
│   │   │   ├── generation.service.interface.ts
│   │   │   ├── campaign.service.interface.ts
│   │   │   ├── topic.service.interface.ts
│   │   │   ├── library.service.interface.ts
│   │   │   ├── taxonomy.service.interface.ts
│   │   │   ├── admin.service.interface.ts
│   │   │   └── notification.service.interface.ts
│   │   ├── repositories/
│   │   │   ├── user.repository.interface.ts
│   │   │   ├── workspace.repository.interface.ts
│   │   │   ├── brand.repository.interface.ts
│   │   │   ├── product.repository.interface.ts
│   │   │   ├── generation.repository.interface.ts
│   │   │   ├── campaign.repository.interface.ts
│   │   │   ├── topic.repository.interface.ts
│   │   │   ├── taxonomy.repository.interface.ts
│   │   │   └── admin.repository.interface.ts
│   │   └── providers/
│   │       ├── content-generator.interface.ts
│   │       ├── campaign-generator.interface.ts
│   │       ├── topic-generator.interface.ts
│   │       ├── brand-scraper.interface.ts
│   │       ├── storage.provider.interface.ts
│   │       └── logger.provider.interface.ts
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.ts            # JWT verification
│   │   ├── workspace.middleware.ts       # workspace access + role check
│   │   ├── request-logger.middleware.ts
│   │   └── error-handler.middleware.ts
│   │
│   ├── utils/
│   │   ├── jwt.ts                        # sign/verify helpers
│   │   ├── password.ts                   # hash/compare
│   │   └── env.ts                        # typed env config
│   │
│   └── types/
│       ├── auth.types.ts
│       ├── workspace.types.ts
│       ├── brand.types.ts
│       ├── product.types.ts
│       ├── generation.types.ts
│       ├── campaign.types.ts
│       ├── topic.types.ts
│       └── common.types.ts
│
├── tests/
│   ├── services/
│   ├── middlewares/
│   └── utils/
│
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                           # Seed taxonomy data (frameworks, hook types)
│
├── package.json
├── tsconfig.json
├── biome.json
└── ecosystem.config.js                   # PM2 config
```

### 4.2 SOLID + Manual DI Pattern

Every layer follows strict dependency inversion:

- **Routes** receive service interfaces via factory function parameters — stay thin (parse request, call service, return response).
- **Services** receive repository + provider interfaces via constructor — contain all business logic.
- **Repositories** receive PrismaClient via constructor — handle data access only.
- **Providers** wrap external SDKs (AI, MinIO) behind interfaces.
- **Jobs** receive provider + repository + service interfaces via constructor.
- **Composition root** (`index.ts`) wires all concrete implementations — the only file that imports concrete classes.

### 4.3 Authentication

- JWT-based (access token + refresh token)
- Access token: short-lived (15 min), stored in memory on frontend
- Refresh token: longer-lived (7 days), stored in httpOnly cookie
- Auth middleware extracts and verifies JWT, sets `userId` on Hono context
- Password hashing via Bun's native `Bun.password.hash()` / `Bun.password.verify()`

### 4.4 AI Provider Configuration

```env
# Default provider for all AI operations
AI_PROVIDER=anthropic

# Per-use-case overrides (optional, falls back to AI_PROVIDER)
AI_CONTENT_PROVIDER=
AI_CAMPAIGN_PROVIDER=
AI_TOPIC_PROVIDER=
AI_BRAND_SCRAPER_PROVIDER=

# Provider credentials
ANTHROPIC_API_KEY=sk-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash
```

Each use case has its own interface (`IContentGenerator`, `ICampaignGenerator`, `ITopicGenerator`, `IBrandScraper`). The composition root reads env vars and wires the appropriate provider implementation. If a per-use-case override is empty, it falls back to `AI_PROVIDER`.

### 4.5 Async Generation Flow (pgboss + SSE)

```
1. Client POST /api/workspaces/:wid/generations
   → generation.service creates record with status "pending"
   → enqueues pgboss job
   → returns { id, status: "pending" }

2. Client opens GET /api/sse?token=xxx
   → persistent SSE connection maintained by notification.service

3. pgboss picks up job in background
   → content-generation.job calls AI provider
   → saves output to DB with status "draft"
   → notification.service pushes event to user's SSE connection:
     { type: "generation_complete", generationId, status: "completed" }

4. Client receives SSE event
   → frontend fetches updated generation data
   → displays result to user
```

---

## 5. Database Schema (Prisma)

Direct translation from Supabase schema to Prisma models.

### 5.1 Core Models

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  fullName      String?
  avatarUrl     String?
  isSuperadmin  Boolean   @default(false)
  status        String    @default("active")  // active, suspended
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  workspaceRoles  UserWorkspaceRole[]
  invitations     WorkspaceInvitation[]
}

model Workspace {
  id            String    @id @default(uuid())
  name          String
  slug          String    @unique
  description   String?
  status        String    @default("active")
  apiLimitUsd   Decimal   @default(50.00)
  apiUsageUsd   Decimal   @default(0.00)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  roles         UserWorkspaceRole[]
  invitations   WorkspaceInvitation[]
  brands        Brand[]
  products      Product[]
  generations   GenerationRequest[]
  campaigns     Campaign[]
  topics        ContentTopic[]
}

model UserWorkspaceRole {
  id          String    @id @default(uuid())
  userId      String
  workspaceId String
  role        String    // admin, editor, viewer
  createdAt   DateTime  @default(now())
  user        User      @relation(fields: [userId], references: [id])
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  @@unique([userId, workspaceId])
}

model WorkspaceInvitation {
  id          String    @id @default(uuid())
  workspaceId String
  email       String
  role        String    @default("editor")
  status      String    @default("pending") // pending, accepted
  invitedBy   String
  createdAt   DateTime  @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  @@index([email])
}
```

### 5.2 Brand & Product System

```prisma
model Brand {
  id          String    @id @default(uuid())
  workspaceId String
  name        String
  slug        String
  category    String?
  status      String    @default("active")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  brainVersions BrandBrainVersion[]
  products    Product[]
  @@unique([workspaceId, slug])
}

model BrandBrainVersion {
  id          String    @id @default(uuid())
  brandId     String
  version     Int
  personality String?
  tone        String?
  values      Json?     // string array
  vocabulary  Json?     // string array
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  brand       Brand     @relation(fields: [brandId], references: [id])
  @@unique([brandId, version])
}

model Product {
  id          String    @id @default(uuid())
  workspaceId String
  brandId     String
  name        String
  slug        String
  type        String?
  status      String    @default("active")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  brand       Brand     @relation(fields: [brandId], references: [id])
  brainVersions ProductBrainVersion[]
  @@unique([workspaceId, slug])
}

model ProductBrainVersion {
  id          String    @id @default(uuid())
  productId   String
  version     Int
  usp         String?
  rtb         String?
  claims      Json?     // string array
  disclaimers Json?     // string array
  benefits    Json?     // string array
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  product     Product   @relation(fields: [productId], references: [id])
  @@unique([productId, version])
}
```

### 5.3 Generation Pipeline

```prisma
model GenerationRequest {
  id          String    @id @default(uuid())
  workspaceId String
  brandId     String
  productId   String?
  platform    String    // instagram, tiktok, facebook, linkedin
  contentType String    // single_image, carousel, video, story
  framework   String    // AIDA, PAS, BAB
  hookType    String    // curiosity, pain_point, bold_claim, social_proof, story
  prompt      String?
  status      String    @default("pending") // pending, processing, completed, failed
  errorMessage String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  outputs     GenerationOutput[]
}

model GenerationOutput {
  id           String    @id @default(uuid())
  requestId    String
  contentTitle String?
  content      Json      // structured content (slides, scenes, etc.)
  status       String    @default("draft") // draft, approved, rejected
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  request      GenerationRequest @relation(fields: [requestId], references: [id])
  feedbackEvents OutputFeedbackEvent[]
}

model OutputFeedbackEvent {
  id        String    @id @default(uuid())
  outputId  String
  eventType String    // hook_edit, copy_edit, approved, rejected
  data      Json?
  createdAt DateTime  @default(now())
  output    GenerationOutput @relation(fields: [outputId], references: [id])
}
```

### 5.4 Taxonomy & Content Planning

```prisma
model Framework {
  id          String  @id @default(uuid())
  name        String  @unique  // AIDA, PAS, BAB
  description String?
}

model HookType {
  id          String  @id @default(uuid())
  name        String  @unique  // Curiosity, Pain Point, Bold Claim, Social Proof, Story
  description String?
}

model Campaign {
  id          String    @id @default(uuid())
  workspaceId String
  name        String
  description String?
  content     Json?     // generated campaign strategy
  status      String    @default("draft")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
}

model ContentTopic {
  id          String    @id @default(uuid())
  workspaceId String
  title       String
  description String?
  publishDate DateTime?
  status      String    @default("draft")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
}
```

### 5.5 Seed Data

`prisma/seed.ts` populates:

- **Frameworks:** AIDA ("Attention, Interest, Desire, Action"), PAS ("Problem, Agitate, Solution"), BAB ("Before, After, Bridge")
- **Hook Types:** Curiosity, Pain Point, Bold Claim, Social Proof, Story

---

## 6. Frontend Architecture

### 6.1 Directory Structure

```
frontend/
├── src/
│   ├── main.tsx                          # App entry point
│   ├── App.tsx                           # Router setup
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── SignupPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── BrandsPage.tsx
│   │   ├── ProductsPage.tsx
│   │   ├── GeneratePage.tsx
│   │   ├── CampaignsPage.tsx
│   │   ├── TopicsPage.tsx
│   │   ├── TopicLibraryPage.tsx
│   │   ├── LibraryPage.tsx
│   │   ├── LearningPage.tsx
│   │   ├── SettingsPage.tsx
│   │   ├── WorkspaceSettingsPage.tsx
│   │   └── AdminPage.tsx
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx              # Sidebar + Topbar + content area
│   │   │   ├── Sidebar.tsx
│   │   │   └── Topbar.tsx
│   │   ├── ui/                           # Reusable primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Tabs.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── Spinner.tsx
│   │   ├── brands/
│   │   │   ├── BrandCard.tsx
│   │   │   ├── BrandForm.tsx
│   │   │   └── BrainVersionEditor.tsx
│   │   ├── products/
│   │   │   ├── ProductCard.tsx
│   │   │   └── ProductForm.tsx
│   │   ├── generation/
│   │   │   ├── GenerationForm.tsx
│   │   │   ├── OutputPreview.tsx
│   │   │   └── ContentTypeSelector.tsx
│   │   ├── campaigns/
│   │   │   └── CampaignForm.tsx
│   │   ├── topics/
│   │   │   └── TopicForm.tsx
│   │   ├── library/
│   │   │   ├── OutputCard.tsx
│   │   │   └── FeedbackControls.tsx
│   │   └── workspace/
│   │       ├── MemberList.tsx
│   │       └── InvitationForm.tsx
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx               # JWT token, user state, login/logout
│   │   └── WorkspaceContext.tsx          # Active workspace, switching
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useWorkspace.ts
│   │   ├── useSSE.ts                     # SSE connection management
│   │   └── useApi.ts                     # Fetch wrapper with JWT
│   │
│   ├── services/
│   │   └── api.ts                        # API client (base URL, auth headers)
│   │
│   ├── types/
│   │   └── index.ts                      # Shared TypeScript types
│   │
│   └── utils/
│       └── format.ts                     # Date, number formatters
│
├── public/
│   ├── manifest.json                     # PWA manifest (optional)
│   └── favicon.ico
│
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── postcss.config.js
```

### 6.2 Tech Stack

- **React 19** with TypeScript
- **React Router v7** for client-side routing
- **Tailwind CSS 4** for styling
- **Lucide React** for icons
- **Vite 6** as build tool

### 6.3 State Management

- **AuthContext** — JWT access token (in memory), user profile, login/logout/refresh
- **WorkspaceContext** — active workspace, workspace list, switching (persisted to localStorage)
- **Local state** — page-level state for forms, modals, filters (no global store)

### 6.4 Key Hooks

- **`useApi()`** — wraps fetch with JWT injection from AuthContext, handles 401 → refresh → retry, standardized error handling
- **`useSSE()`** — connects to `/api/sse?token=xxx`, auto-reconnects on disconnect, dispatches events via callback
- **`useAuth()`** — shortcut to AuthContext
- **`useWorkspace()`** — shortcut to WorkspaceContext

### 6.5 Routing

```typescript
// App.tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/signup" element={<SignupPage />} />
  <Route element={<ProtectedRoute />}>
    <Route element={<AppShell />}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/brands" element={<BrandsPage />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/generate" element={<GeneratePage />} />
      <Route path="/campaigns" element={<CampaignsPage />} />
      <Route path="/topics" element={<TopicsPage />} />
      <Route path="/topic-library" element={<TopicLibraryPage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/learning" element={<LearningPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/workspace-settings" element={<WorkspaceSettingsPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Route>
  </Route>
</Routes>
```

---

## 7. UI Design System

### 7.1 Theme: Dark Sidebar + Light Content

**Sidebar:**

- Background: `#111111`
- Text: `#ffffff` (active), `#aaaaaa` (inactive)
- Active item: `#333333` background, `border-radius: 6px`
- Hover: `#222222` background

**Content area:**

- Background: `#f5f5f5`
- Cards/panels: `#ffffff` with `1px solid #e5e5e5` border, `border-radius: 6px`

**Typography:**

- Primary text: `#111111`
- Secondary text: `#666666`
- Tertiary/labels: `#999999`
- Font: `Inter` (or system-ui fallback)
- Sizes: 10px labels, 11px table rows, 12px body, 14px nav items, 16px page titles

**Buttons:**

- Primary: `bg-black text-white` (hover: `bg-gray-800`)
- Secondary: `bg-white text-black border border-gray-300` (hover: `bg-gray-50`)
- Danger: `bg-white text-red-600 border border-red-200`

**Status badges:** Pill-shaped with subtle background fills:

- Completed/Active: `bg-green-50 text-green-700`
- Processing/Pending: `bg-amber-50 text-amber-700`
- Draft: `bg-gray-100 text-gray-600`
- Failed/Rejected: `bg-red-50 text-red-700`

**Form inputs:**

- `bg-white border border-gray-300 rounded-md` (focus: `border-black ring-1 ring-black`)

### 7.2 Layout

```
┌──────────────────────────────────────────────────┐
│ Sidebar (220px) │ Topbar (52px height)           │
│                 ├────────────────────────────────┤
│  Logo           │                                │
│  Navigation     │  Content area                  │
│    Dashboard    │  (padding: 24px)               │
│    Brands       │                                │
│    Products     │  Page title                    │
│    Generate     │  ┌──────────────────────────┐  │
│    Campaigns    │  │ Cards / Tables / Forms   │  │
│    Topics       │  │                          │  │
│    Library      │  └──────────────────────────┘  │
│    Learning     │                                │
│  ──────────     │                                │
│  Settings       │                                │
│  Workspace      │                                │
└──────────────────────────────────────────────────┘
```

---

## 8. REST API

### 8.1 Conventions

- All workspace-scoped routes under `/api/workspaces/:wid/`
- JWT in `Authorization: Bearer <token>` header
- Success: `{ data: ... }`
- Error: `{ error: "message" }` with appropriate HTTP status
- Pagination: `?page=1&limit=20` (default limit: 20)

### 8.2 Endpoints

**Auth:**

```
POST   /api/auth/signup              # { email, password, fullName } → { data: { user, accessToken } }
POST   /api/auth/login               # { email, password } → { data: { user, accessToken } } + refreshToken cookie
POST   /api/auth/refresh             # refreshToken cookie → { data: { accessToken } }
GET    /api/auth/me                  # → { data: user }
```

**Workspaces:**

```
GET    /api/workspaces               # list user's workspaces
POST   /api/workspaces               # create workspace
GET    /api/workspaces/:id
PATCH  /api/workspaces/:id
GET    /api/workspaces/:id/members
POST   /api/workspaces/:id/invitations
PATCH  /api/workspaces/:id/invitations/:invId   # accept/revoke
DELETE /api/workspaces/:id/members/:userId
```

**Brands:**

```
GET    /api/workspaces/:wid/brands
POST   /api/workspaces/:wid/brands
GET    /api/workspaces/:wid/brands/:id
PATCH  /api/workspaces/:wid/brands/:id
POST   /api/workspaces/:wid/brands/:id/brain-versions
POST   /api/workspaces/:wid/brands/:id/scrape
```

**Products:**

```
GET    /api/workspaces/:wid/products
POST   /api/workspaces/:wid/products
GET    /api/workspaces/:wid/products/:id
PATCH  /api/workspaces/:wid/products/:id
POST   /api/workspaces/:wid/products/:id/brain-versions
```

**Generation:**

```
POST   /api/workspaces/:wid/generations     # enqueues job → { data: { id, status: "pending" } }
GET    /api/workspaces/:wid/generations
GET    /api/workspaces/:wid/generations/:id
```

**Library:**

```
GET    /api/workspaces/:wid/library
PATCH  /api/workspaces/:wid/library/:id
POST   /api/workspaces/:wid/library/:id/feedback
```

**Campaigns:**

```
GET    /api/workspaces/:wid/campaigns
POST   /api/workspaces/:wid/campaigns
GET    /api/workspaces/:wid/campaigns/:id
PATCH  /api/workspaces/:wid/campaigns/:id
```

**Topics:**

```
GET    /api/workspaces/:wid/topics
POST   /api/workspaces/:wid/topics
GET    /api/workspaces/:wid/topics/:id
PATCH  /api/workspaces/:wid/topics/:id
```

**Taxonomy:**

```
GET    /api/taxonomy/frameworks
GET    /api/taxonomy/hook-types
```

**SSE:**

```
GET    /api/sse                      # auth via ?token=xxx query param
```

**Admin (superadmin only):**

```
GET    /api/admin/users
PATCH  /api/admin/users/:id
GET    /api/admin/workspaces
PATCH  /api/admin/workspaces/:id
```

---

## 9. Phased Implementation Plan

Each phase ends with a verifiable checkpoint.

### Phase 1: Foundation

- Project scaffolding (monorepo structure, package.json, configs)
- Prisma schema + docker-compose (PostgreSQL + MinIO)
- Database seed (frameworks, hook types)
- Backend skeleton (Hono app, composition root, env config)
- JWT auth (signup, login, refresh, middleware)
- **Checkpoint:** can signup, login, and hit protected endpoints

### Phase 2: Core Data Layer

- Workspace CRUD + member/invitation management
- Workspace middleware (access + role checking)
- Brand CRUD + brain versioning
- Product CRUD + brain versioning
- Taxonomy endpoints (read-only)
- **Checkpoint:** full CRUD for all core entities via API

### Phase 3: AI Generation Pipeline

- AI provider interfaces (content, campaign, topic, brand-scraper)
- Anthropic provider implementation
- Gemini provider implementation
- Configurable provider wiring (.env based)
- pgboss setup + job handlers (content, campaign, topic, brand-scrape)
- SSE notification service
- Generation, campaign, topic endpoints
- **Checkpoint:** can submit generation requests, jobs run, SSE delivers results

### Phase 4: Frontend Foundation

- Vite + React + Tailwind + Router setup
- Design system (UI primitives: Button, Input, Modal, Table, Card, Badge, Tabs, Toast, Spinner)
- AppShell layout (dark sidebar, topbar, content area)
- Auth pages (login, signup) + AuthContext + JWT management
- WorkspaceContext + workspace switching
- useApi hook + useSSE hook
- **Checkpoint:** can login, see app shell, switch workspaces

### Phase 5: Frontend Features

- Dashboard page (KPIs, recent generations)
- Brands page (CRUD + brain version editor)
- Products page (CRUD + brain version editor)
- Generate page (form + content type selector + SSE status updates)
- Campaigns page
- Topics page + Topic Library page
- Library page (outputs list, approve/reject, feedback)
- Learning page
- Settings page
- Workspace Settings page (members, invitations, branding)
- Admin page (superadmin controls)
- **Checkpoint:** full feature parity with current app

### Phase 6: Observability & Infrastructure

- Winston logger provider + Loki transport
- Request logger middleware + error handler middleware
- OpenTelemetry tracing setup
- Monitoring docker-compose (Grafana, Loki, Jaeger, Prometheus, Node Exporter)
- Grafana dashboard provisioning
- PM2 ecosystem config
- Nginx config (reverse proxy + static file serving)
- **Checkpoint:** full observability stack running, app served via Nginx

### Phase 7: Polish & Quality

- Unit tests for all services
- TypeScript strict checking (`bunx tsc --noEmit` — zero errors)
- Biome linting (`bun run lint` — zero warnings)
- PWA manifest (optional)
- **Checkpoint:** all tests pass, all checks green, production-ready

---

## 10. Environment Variables

```env
# Backend
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost:5432/fce_dashboard
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# AI Providers
AI_PROVIDER=anthropic
AI_CONTENT_PROVIDER=
AI_CAMPAIGN_PROVIDER=
AI_TOPIC_PROVIDER=
AI_BRAND_SCRAPER_PROVIDER=
ANTHROPIC_API_KEY=sk-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=fce-uploads

# Observability
SERVICE_NAME=fce-backend
LOKI_URL=http://localhost:3100
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Frontend (build-time)
# Dev: points directly to backend. Prod: empty (uses relative /api via Nginx proxy)
VITE_API_URL=http://localhost:3001
```

---

## 11. Out of Scope

- Data migration from Supabase
- Mobile app / native features
- Advanced PWA offline capabilities (basic manifest only)
- CI/CD pipeline
- Production deployment (AWS Lightsail — future discussion)
- SSL/HTTPS configuration
- Rate limiting / API throttling
- Email notifications (invitations are in-app only)
