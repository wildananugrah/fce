# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the backend and frontend projects, set up the database with Prisma, implement JWT authentication, and verify end-to-end auth flow.

**Architecture:** Hono backend (Bun runtime) with manual DI, Prisma ORM on PostgreSQL (docker-compose), React+Vite frontend shell. JWT auth with access token (15min) + refresh token (7d httpOnly cookie).

**Tech Stack:** Bun, Hono, Prisma, PostgreSQL, React, Vite, Tailwind CSS 4, Biome, PM2

**Spec:** `docs/superpowers/specs/2026-04-07-fce-rewrite-design.md`

---

## File Structure

### Root

```
fce/
├── docker-compose.yml            # PostgreSQL + MinIO
├── .env.example                  # Environment template
├── nginx.conf                    # Nginx reverse proxy config
```

### Backend

```
backend/
├── package.json
├── tsconfig.json
├── biome.json
├── ecosystem.config.js           # PM2 config
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── index.ts                  # Composition root
│   ├── interfaces/
│   │   ├── providers/
│   │   │   └── logger.provider.interface.ts
│   │   ├── repositories/
│   │   │   └── user.repository.interface.ts
│   │   └── services/
│   │       └── auth.service.interface.ts
│   ├── repositories/
│   │   └── user.repository.ts
│   ├── services/
│   │   └── auth.service.ts
│   ├── routes/
│   │   └── auth.route.ts
│   ├── middlewares/
│   │   ├── auth.middleware.ts
│   │   └── error-handler.middleware.ts
│   ├── providers/
│   │   └── console-logger.provider.ts
│   ├── utils/
│   │   ├── jwt.ts
│   │   ├── password.ts
│   │   └── env.ts
│   └── types/
│       ├── auth.types.ts
│       └── common.types.ts
└── tests/
    ├── services/
    │   └── auth.service.test.ts
    ├── utils/
    │   ├── jwt.test.ts
    │   └── password.test.ts
    └── helpers/
        └── mock-user.repository.ts
```

### Frontend

```
frontend/
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css                 # Tailwind directives + base theme
    ├── pages/
    │   ├── LoginPage.tsx
    │   └── SignupPage.tsx
    ├── components/
    │   ├── layout/
    │   │   └── AppShell.tsx      # Placeholder shell
    │   └── ui/
    │       ├── Button.tsx
    │       ├── Input.tsx
    │       └── Spinner.tsx
    ├── contexts/
    │   └── AuthContext.tsx
    ├── hooks/
    │   └── useAuth.ts
    ├── services/
    │   └── api.ts
    └── types/
        └── index.ts
```

---

## Task 1: Docker Compose + Environment Config

**Files:**

- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
# docker-compose.yml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-fce}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-fce_secret}
      POSTGRES_DB: ${POSTGRES_DB:-fce_dashboard}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-fce}"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY:-minioadmin}
    volumes:
      - minio-data:/data
    command: server /data --console-address ":9001"

volumes:
  postgres-data:
  minio-data:
```

- [ ] **Step 2: Create .env.example**

```env
# Database
POSTGRES_USER=fce
POSTGRES_PASSWORD=fce_secret
POSTGRES_DB=fce_dashboard
DATABASE_URL=postgresql://fce:fce_secret@localhost:5432/fce_dashboard

# Backend
PORT=3001
JWT_SECRET=change-me-to-a-random-64-char-string
JWT_REFRESH_SECRET=change-me-to-another-random-64-char-string
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# AI Providers
AI_PROVIDER=anthropic
AI_CONTENT_PROVIDER=
AI_CAMPAIGN_PROVIDER=
AI_TOPIC_PROVIDER=
AI_BRAND_SCRAPER_PROVIDER=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=fce-uploads

# Observability (Phase 6)
SERVICE_NAME=fce-backend
LOKI_URL=http://localhost:3100
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Frontend (build-time)
VITE_API_URL=http://localhost:3001
```

- [ ] **Step 3: Start docker-compose and verify**

Run: `docker compose up -d`
Expected: Both `postgres` and `minio` containers running.

Run: `docker compose ps`
Expected: Both services show status "Up" / "healthy".

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add docker-compose for PostgreSQL and MinIO"
```

---

## Task 2: Backend Project Scaffolding

**Files:**

- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/biome.json`
- Create: `backend/ecosystem.config.js`

- [ ] **Step 1: Initialize backend project**

```bash
cd backend
bun init -y
```

- [ ] **Step 2: Install dependencies**

```bash
cd backend
bun add hono @hono/node-server @prisma/client pg-boss jsonwebtoken cookie
bun add -d prisma typescript @types/jsonwebtoken @biomejs/biome
```

- [ ] **Step 3: Replace package.json with proper config**

```json
{
  "name": "fce-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "start": "bun run src/index.ts",
    "lint": "bunx biome check --write .",
    "lint:check": "bunx biome check .",
    "typecheck": "bunx tsc --noEmit",
    "test": "bun test",
    "db:generate": "bunx prisma generate",
    "db:migrate": "bunx prisma migrate dev",
    "db:push": "bunx prisma db push",
    "db:seed": "bunx prisma db seed",
    "db:studio": "bunx prisma studio"
  },
  "prisma": {
    "seed": "bun run prisma/seed.ts"
  }
}
```

Note: Keep the `dependencies` and `devDependencies` sections that `bun add` created. Only replace the top-level fields shown above.

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "prisma/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "lineWidth": 100
  },
  "files": {
    "ignore": ["node_modules", "dist", "prisma/migrations"]
  }
}
```

- [ ] **Step 6: Create ecosystem.config.js (PM2)**

```javascript
module.exports = {
  apps: [
    {
      name: "fce-backend",
      script: "src/index.ts",
      interpreter: "bun",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
    },
  ],
};
```

- [ ] **Step 7: Commit**

```bash
cd backend
git add package.json tsconfig.json biome.json ecosystem.config.js bun.lockb
git commit -m "chore: scaffold backend project with Hono, Prisma, Biome, PM2"
```

---

## Task 3: Prisma Schema

**Files:**

- Create: `backend/prisma/schema.prisma`
- Create: `backend/prisma/seed.ts`

- [ ] **Step 1: Create schema.prisma**

This schema is a direct translation of the existing `supabase-schema.sql`, including all fields from the original schema and migrations.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Core ───────────────────────────────────────────────────────

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  fullName     String?  @map("full_name")
  avatarUrl    String?  @map("avatar_url")
  isSuperadmin Boolean  @default(false) @map("is_superadmin")
  status       String   @default("active") // active, suspended
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  workspaceRoles UserWorkspaceRole[]
  invitations    WorkspaceInvitation[]
  auditLogs      AuditLog[]

  @@map("users")
}

model Workspace {
  id           String   @id @default(uuid())
  name         String
  slug         String   @unique
  description  String?
  logoUrl      String?  @map("logo_url")
  avatarColor  String   @default("#7c6dfa") @map("avatar_color")
  avatarEmoji  String?  @map("avatar_emoji")
  status       String   @default("active")
  apiLimitUsd  Decimal  @default(50.00) @map("api_limit_usd") @db.Decimal(10, 2)
  apiUsageUsd  Decimal  @default(0.00) @map("api_usage_usd") @db.Decimal(10, 2)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  roles       UserWorkspaceRole[]
  invitations WorkspaceInvitation[]
  brands      Brand[]
  products    Product[]
  generations GenerationRequest[]
  campaigns   Campaign[]
  topics      ContentTopic[]
  auditLogs   AuditLog[]

  @@map("workspaces")
}

model UserWorkspaceRole {
  id          String   @id @default(uuid())
  userId      String   @map("user_id")
  workspaceId String   @map("workspace_id")
  role        String   // admin, editor, viewer
  createdAt   DateTime @default(now()) @map("created_at")

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([userId, workspaceId])
  @@map("user_workspace_roles")
}

model WorkspaceInvitation {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  email       String
  role        String   @default("editor")
  status      String   @default("pending") // pending, accepted, revoked
  invitedBy   String   @map("invited_by")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  inviter   User      @relation(fields: [invitedBy], references: [id])

  @@index([email])
  @@map("workspace_invitations")
}

// ─── Brand System ───────────────────────────────────────────────

model Brand {
  id                   String   @id @default(uuid())
  workspaceId          String   @map("workspace_id")
  name                 String
  slug                 String
  category             String?
  websiteUrl           String?  @map("website_url")
  activeBrainVersionId String?  @map("active_brain_version_id")
  status               String   @default("draft") // draft, active, archived
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  workspace     Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  brainVersions BrandBrainVersion[]
  products      Product[]

  @@unique([workspaceId, slug])
  @@map("brands")
}

model BrandBrainVersion {
  id             String   @id @default(uuid())
  brandId        String   @map("brand_id")
  version        Int
  personality    String?
  tone           String?
  audiencePersonas Json?  @map("audience_personas") // array of persona objects
  values         Json?    // string array
  messagingRules Json?    @map("messaging_rules") // array of rule objects
  vocabulary     Json?    // { preferred: string[], avoided: string[] }
  isActive       Boolean  @default(true) @map("is_active")
  status         String   @default("draft") // draft, approved
  createdAt      DateTime @default(now()) @map("created_at")

  brand Brand @relation(fields: [brandId], references: [id], onDelete: Cascade)

  @@unique([brandId, version])
  @@map("brand_brain_versions")
}

// ─── Product System ─────────────────────────────────────────────

model Product {
  id                   String   @id @default(uuid())
  workspaceId          String   @map("workspace_id")
  brandId              String   @map("brand_id")
  name                 String
  slug                 String
  type                 String?
  activeBrainVersionId String?  @map("active_brain_version_id")
  status               String   @default("draft") // draft, active, archived
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  workspace     Workspace            @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  brand         Brand                @relation(fields: [brandId], references: [id], onDelete: Cascade)
  brainVersions ProductBrainVersion[]

  @@unique([workspaceId, slug])
  @@map("products")
}

model ProductBrainVersion {
  id                 String   @id @default(uuid())
  productId          String   @map("product_id")
  version            Int
  usp                String?  // unique selling proposition
  rtb                String?  // reason to believe
  functionalBenefits Json?    @map("functional_benefits") // string array
  emotionalBenefits  Json?    @map("emotional_benefits") // string array
  targetAudience     String?  @map("target_audience")
  claims             Json?    // string array
  disclaimers        Json?    // string array
  isActive           Boolean  @default(true) @map("is_active")
  status             String   @default("draft") // draft, approved
  createdAt          DateTime @default(now()) @map("created_at")

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, version])
  @@map("product_brain_versions")
}

// ─── Generation Pipeline ────────────────────────────────────────

model GenerationRequest {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  brandId     String   @map("brand_id")
  productId   String?  @map("product_id")
  platform    String   // instagram, tiktok, facebook, linkedin
  contentType String   @map("content_type") // single_image, carousel, video, story
  framework   String   // AIDA, PAS, BAB
  hookType    String   @map("hook_type") // curiosity, pain_point, bold_claim, social_proof, story
  language    String   @default("id")
  prompt      String?
  status      String   @default("pending") // pending, processing, completed, failed
  errorMessage String? @map("error_message")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  workspace Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  outputs   GenerationOutput[]

  @@index([workspaceId])
  @@map("generation_requests")
}

model GenerationOutput {
  id           String   @id @default(uuid())
  requestId    String   @map("request_id")
  contentTitle String?  @map("content_title")
  content      Json     // structured: { copy, captions, slides, scenes, ctas, hashtags }
  status       String   @default("draft") // draft, approved, rejected
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  request        GenerationRequest     @relation(fields: [requestId], references: [id], onDelete: Cascade)
  feedbackEvents OutputFeedbackEvent[]

  @@index([requestId])
  @@map("generation_outputs")
}

model OutputFeedbackEvent {
  id        String   @id @default(uuid())
  outputId  String   @map("output_id")
  eventType String   @map("event_type") // hook_edit, copy_edit, approved, rejected
  before    Json?    // previous value
  after     Json?    // new value
  userId    String?  @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  output GenerationOutput @relation(fields: [outputId], references: [id], onDelete: Cascade)

  @@index([outputId])
  @@map("output_feedback_events")
}

// ─── Taxonomy ───────────────────────────────────────────────────

model Framework {
  id          String  @id @default(uuid())
  name        String  @unique
  description String?
  isGlobal    Boolean @default(true) @map("is_global")

  @@map("frameworks")
}

model HookType {
  id          String  @id @default(uuid())
  name        String  @unique
  description String?
  isGlobal    Boolean @default(true) @map("is_global")

  @@map("hook_types")
}

// ─── Campaign System ────────────────────────────────────────────

model Campaign {
  id             String   @id @default(uuid())
  workspaceId    String   @map("workspace_id")
  brandId        String?  @map("brand_id")
  name           String
  description    String?
  objective      String?
  budget         String?
  channelMix     Json?    @map("channel_mix") // string array
  culturalContext String? @map("cultural_context")
  status         String   @default("draft") // draft, active, completed
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  workspace Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  outputs   CampaignOutput[]

  @@index([workspaceId])
  @@map("campaigns")
}

model CampaignOutput {
  id               String   @id @default(uuid())
  campaignId       String   @map("campaign_id")
  bigIdea          String?  @map("big_idea")
  messagingPillars Json?    @map("messaging_pillars") // array of pillar objects
  funnelJourney    Json?    @map("funnel_journey") // structured funnel data
  channelRoles     Json?    @map("channel_roles") // channel role mapping
  rawContent       Json?    @map("raw_content") // full AI response
  status           String   @default("draft")
  createdAt        DateTime @default(now()) @map("created_at")

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([campaignId])
  @@map("campaign_outputs")
}

// ─── Content Planning ───────────────────────────────────────────

model ContentTopic {
  id          String    @id @default(uuid())
  workspaceId String    @map("workspace_id")
  brandId     String?   @map("brand_id")
  productId   String?   @map("product_id")
  title       String
  description String?
  pillar      String?
  platform    String?
  format      String?
  objective   String?
  publishDate DateTime? @map("publish_date")
  status      String    @default("draft") // draft, scheduled, published
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@map("content_topics")
}

// ─── Audit & Analytics ──────────────────────────────────────────

model AuditLog {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  userId      String   @map("user_id")
  action      String   // create, update, delete, approve, reject, etc.
  entityType  String   @map("entity_type") // brand, product, generation, etc.
  entityId    String?  @map("entity_id")
  metadata    Json?    // additional context
  createdAt   DateTime @default(now()) @map("created_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id])

  @@index([workspaceId])
  @@index([userId])
  @@map("audit_logs")
}

model RecommendationProfile {
  id             String   @id @default(uuid())
  brandId        String   @map("brand_id")
  bestFrameworks Json?    @map("best_frameworks") // ranked framework performance
  bestHookTypes  Json?    @map("best_hook_types") // ranked hook type performance
  bestTones      Json?    @map("best_tones") // ranked tone performance
  sampleSize     Int      @default(0) @map("sample_size")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@unique([brandId])
  @@map("recommendation_profiles")
}
```

- [ ] **Step 2: Create seed.ts**

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Seed frameworks
  const frameworks = [
    {
      name: "AIDA",
      description: "Attention, Interest, Desire, Action",
    },
    {
      name: "PAS",
      description: "Problem, Agitate, Solution",
    },
    {
      name: "BAB",
      description: "Before, After, Bridge",
    },
  ];

  for (const framework of frameworks) {
    await prisma.framework.upsert({
      where: { name: framework.name },
      update: {},
      create: framework,
    });
  }

  // Seed hook types
  const hookTypes = [
    {
      name: "Curiosity",
      description: "Spark curiosity with unexpected questions or facts",
    },
    {
      name: "Pain Point",
      description: "Address a specific pain point the audience experiences",
    },
    {
      name: "Bold Claim",
      description: "Make a bold, attention-grabbing statement",
    },
    {
      name: "Social Proof",
      description: "Leverage testimonials, stats, or authority",
    },
    {
      name: "Story",
      description: "Open with a relatable narrative or anecdote",
    },
  ];

  for (const hookType of hookTypes) {
    await prisma.hookType.upsert({
      where: { name: hookType.name },
      update: {},
      create: hookType,
    });
  }

  console.log("Seed completed: frameworks and hook types");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 3: Generate Prisma client and run migration**

```bash
cd backend
cp ../.env.example .env
bunx prisma generate
bunx prisma migrate dev --name init
```

Expected: Migration created successfully, Prisma client generated.

- [ ] **Step 4: Run seed**

```bash
cd backend
bunx prisma db seed
```

Expected: "Seed completed: frameworks and hook types"

- [ ] **Step 5: Verify with Prisma Studio**

```bash
cd backend
bunx prisma studio
```

Expected: Opens browser at `http://localhost:5555`. Verify `frameworks` (3 rows) and `hook_types` (5 rows) tables are populated.

- [ ] **Step 6: Commit**

```bash
cd backend
git add prisma/schema.prisma prisma/seed.ts
git commit -m "feat: add Prisma schema with full database model and seed data"
```

---

## Task 4: Backend Utility Modules

**Files:**

- Create: `backend/src/utils/env.ts`
- Create: `backend/src/utils/password.ts`
- Create: `backend/src/utils/jwt.ts`
- Create: `backend/tests/utils/password.test.ts`
- Create: `backend/tests/utils/jwt.test.ts`

- [ ] **Step 1: Create env.ts**

```typescript
// backend/src/utils/env.ts

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue = ""): string {
  return process.env[key] || defaultValue;
}

export const env = {
  // Server
  port: Number.parseInt(optionalEnv("PORT", "3001"), 10),

  // Database
  databaseUrl: requireEnv("DATABASE_URL"),

  // JWT
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtRefreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  jwtExpiry: optionalEnv("JWT_EXPIRY", "15m"),
  jwtRefreshExpiry: optionalEnv("JWT_REFRESH_EXPIRY", "7d"),

  // AI Providers
  aiProvider: optionalEnv("AI_PROVIDER", "anthropic"),
  aiContentProvider: optionalEnv("AI_CONTENT_PROVIDER"),
  aiCampaignProvider: optionalEnv("AI_CAMPAIGN_PROVIDER"),
  aiTopicProvider: optionalEnv("AI_TOPIC_PROVIDER"),
  aiBrandScraperProvider: optionalEnv("AI_BRAND_SCRAPER_PROVIDER"),
  anthropicApiKey: optionalEnv("ANTHROPIC_API_KEY"),
  anthropicModel: optionalEnv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
  geminiApiKey: optionalEnv("GEMINI_API_KEY"),
  geminiModel: optionalEnv("GEMINI_MODEL", "gemini-2.0-flash"),

  // MinIO
  minioEndpoint: optionalEnv("MINIO_ENDPOINT", "localhost"),
  minioPort: Number.parseInt(optionalEnv("MINIO_PORT", "9000"), 10),
  minioAccessKey: optionalEnv("MINIO_ACCESS_KEY", "minioadmin"),
  minioSecretKey: optionalEnv("MINIO_SECRET_KEY", "minioadmin"),
  minioBucket: optionalEnv("MINIO_BUCKET", "fce-uploads"),

  // Observability
  serviceName: optionalEnv("SERVICE_NAME", "fce-backend"),
  lokiUrl: optionalEnv("LOKI_URL"),
  otelEndpoint: optionalEnv("OTEL_EXPORTER_OTLP_ENDPOINT"),
} as const;
```

- [ ] **Step 2: Create password.ts**

```typescript
// backend/src/utils/password.ts

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return Bun.password.verify(password, hash);
}
```

- [ ] **Step 3: Write password tests**

```typescript
// backend/tests/utils/password.test.ts
import { describe, expect, it } from "bun:test";
import { hashPassword, verifyPassword } from "../../src/utils/password";

describe("password", () => {
  it("should hash a password and verify it", async () => {
    const password = "my-secure-password";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(0);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it("should reject wrong password", async () => {
    const hash = await hashPassword("correct-password");
    const isValid = await verifyPassword("wrong-password", hash);
    expect(isValid).toBe(false);
  });

  it("should produce different hashes for same password", async () => {
    const password = "same-password";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2);
  });
});
```

- [ ] **Step 4: Run password tests**

```bash
cd backend
bun test tests/utils/password.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Create jwt.ts**

```typescript
// backend/src/utils/jwt.ts
import jwt from "jsonwebtoken";

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
}

export function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  expiry: string,
): string {
  return jwt.sign(payload, secret, { expiresIn: expiry });
}

export function signRefreshToken(
  payload: RefreshTokenPayload,
  secret: string,
  expiry: string,
): string {
  return jwt.sign(payload, secret, { expiresIn: expiry });
}

export function verifyAccessToken(
  token: string,
  secret: string,
): AccessTokenPayload {
  return jwt.verify(token, secret) as AccessTokenPayload;
}

export function verifyRefreshToken(
  token: string,
  secret: string,
): RefreshTokenPayload {
  return jwt.verify(token, secret) as RefreshTokenPayload;
}
```

- [ ] **Step 6: Write JWT tests**

```typescript
// backend/tests/utils/jwt.test.ts
import { describe, expect, it } from "bun:test";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../../src/utils/jwt";

const ACCESS_SECRET = "test-access-secret";
const REFRESH_SECRET = "test-refresh-secret";

describe("jwt", () => {
  it("should sign and verify an access token", () => {
    const payload = { userId: "user-1", email: "test@example.com" };
    const token = signAccessToken(payload, ACCESS_SECRET, "15m");

    expect(token).toBeTruthy();

    const decoded = verifyAccessToken(token, ACCESS_SECRET);
    expect(decoded.userId).toBe("user-1");
    expect(decoded.email).toBe("test@example.com");
  });

  it("should sign and verify a refresh token", () => {
    const payload = { userId: "user-1" };
    const token = signRefreshToken(payload, REFRESH_SECRET, "7d");

    expect(token).toBeTruthy();

    const decoded = verifyRefreshToken(token, REFRESH_SECRET);
    expect(decoded.userId).toBe("user-1");
  });

  it("should reject token with wrong secret", () => {
    const token = signAccessToken(
      { userId: "user-1", email: "test@example.com" },
      ACCESS_SECRET,
      "15m",
    );

    expect(() => verifyAccessToken(token, "wrong-secret")).toThrow();
  });

  it("should reject expired token", () => {
    const token = signAccessToken(
      { userId: "user-1", email: "test@example.com" },
      ACCESS_SECRET,
      "0s",
    );

    // Token with 0s expiry is already expired
    expect(() => verifyAccessToken(token, ACCESS_SECRET)).toThrow();
  });
});
```

- [ ] **Step 7: Run JWT tests**

```bash
cd backend
bun test tests/utils/jwt.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 8: Run all tests**

```bash
cd backend
bun test
```

Expected: 7 tests pass (3 password + 4 JWT).

- [ ] **Step 9: Commit**

```bash
cd backend
git add src/utils/ tests/utils/
git commit -m "feat: add env config, password hashing, and JWT utilities with tests"
```

---

## Task 5: Logger Interface + Console Logger Provider

**Files:**

- Create: `backend/src/interfaces/providers/logger.provider.interface.ts`
- Create: `backend/src/providers/console-logger.provider.ts`

- [ ] **Step 1: Create logger interface**

```typescript
// backend/src/interfaces/providers/logger.provider.interface.ts

export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  child(meta: Record<string, unknown>): ILogger;
}
```

- [ ] **Step 2: Create console logger (placeholder for Winston in Phase 6)**

```typescript
// backend/src/providers/console-logger.provider.ts
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

export class ConsoleLogger implements ILogger {
  private meta: Record<string, unknown>;

  constructor(
    private serviceName: string,
    parentMeta: Record<string, unknown> = {},
  ) {
    this.meta = { service: serviceName, ...parentMeta };
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.log(
      JSON.stringify({ level: "INFO", message, ...this.meta, ...meta }),
    );
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(
      JSON.stringify({ level: "WARN", message, ...this.meta, ...meta }),
    );
  }

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(
      JSON.stringify({ level: "ERROR", message, ...this.meta, ...meta }),
    );
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(
      JSON.stringify({ level: "DEBUG", message, ...this.meta, ...meta }),
    );
  }

  child(meta: Record<string, unknown>): ILogger {
    return new ConsoleLogger(this.serviceName, { ...this.meta, ...meta });
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd backend
git add src/interfaces/providers/ src/providers/
git commit -m "feat: add ILogger interface and ConsoleLogger provider"
```

---

## Task 6: Auth Types + User Repository Interface & Implementation

**Files:**

- Create: `backend/src/types/common.types.ts`
- Create: `backend/src/types/auth.types.ts`
- Create: `backend/src/interfaces/repositories/user.repository.interface.ts`
- Create: `backend/src/repositories/user.repository.ts`

- [ ] **Step 1: Create common types**

```typescript
// backend/src/types/common.types.ts

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

- [ ] **Step 2: Create auth types**

```typescript
// backend/src/types/auth.types.ts

export interface SignupInput {
  email: string;
  password: string;
  fullName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
    isSuperadmin: boolean;
  };
  accessToken: string;
}
```

- [ ] **Step 3: Create user repository interface**

```typescript
// backend/src/interfaces/repositories/user.repository.interface.ts
import type { User } from "@prisma/client";

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: {
    email: string;
    passwordHash: string;
    fullName?: string;
  }): Promise<User>;
  update(
    id: string,
    data: Partial<Pick<User, "fullName" | "avatarUrl" | "status">>,
  ): Promise<User>;
}
```

- [ ] **Step 4: Create user repository implementation**

```typescript
// backend/src/repositories/user.repository.ts
import type { PrismaClient, User } from "@prisma/client";
import type { IUserRepository } from "../interfaces/repositories/user.repository.interface";

export class UserRepository implements IUserRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    fullName?: string;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async update(
    id: string,
    data: Partial<Pick<User, "fullName" | "avatarUrl" | "status">>,
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }
}
```

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/types/ src/interfaces/repositories/ src/repositories/
git commit -m "feat: add auth types, IUserRepository interface, and UserRepository"
```

---

## Task 7: Auth Service Interface & Implementation

**Files:**

- Create: `backend/src/interfaces/services/auth.service.interface.ts`
- Create: `backend/src/services/auth.service.ts`
- Create: `backend/tests/helpers/mock-user.repository.ts`
- Create: `backend/tests/services/auth.service.test.ts`

- [ ] **Step 1: Create auth service interface**

```typescript
// backend/src/interfaces/services/auth.service.interface.ts
import type {
  AuthResponse,
  LoginInput,
  SignupInput,
} from "../types/auth.types";

export interface IAuthService {
  signup(input: SignupInput): Promise<AuthResponse>;
  login(input: LoginInput): Promise<AuthResponse & { refreshToken: string }>;
  refresh(refreshToken: string): Promise<{ accessToken: string }>;
  me(userId: string): Promise<AuthResponse["user"]>;
}
```

Note: Fix the import path — the types are at `../../types/auth.types` from this file's location, but in the interface file we use a relative path from `interfaces/services/`. The correct path:

```typescript
// backend/src/interfaces/services/auth.service.interface.ts
import type {
  AuthResponse,
  LoginInput,
  SignupInput,
} from "../../types/auth.types";

export interface IAuthService {
  signup(input: SignupInput): Promise<AuthResponse>;
  login(input: LoginInput): Promise<AuthResponse & { refreshToken: string }>;
  refresh(refreshToken: string): Promise<{ accessToken: string }>;
  me(userId: string): Promise<AuthResponse["user"]>;
}
```

- [ ] **Step 2: Create mock user repository for tests**

```typescript
// backend/tests/helpers/mock-user.repository.ts
import type { User } from "@prisma/client";
import type { IUserRepository } from "../../src/interfaces/repositories/user.repository.interface";

export class MockUserRepository implements IUserRepository {
  private users: User[] = [];

  async findById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async create(data: {
    email: string;
    passwordHash: string;
    fullName?: string;
  }): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      email: data.email,
      passwordHash: data.passwordHash,
      fullName: data.fullName ?? null,
      avatarUrl: null,
      isSuperadmin: false,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);
    return user;
  }

  async update(
    id: string,
    data: Partial<Pick<User, "fullName" | "avatarUrl" | "status">>,
  ): Promise<User> {
    const index = this.users.findIndex((u) => u.id === id);
    if (index === -1) throw new Error("User not found");
    this.users[index] = {
      ...this.users[index],
      ...data,
      updatedAt: new Date(),
    };
    return this.users[index];
  }

  // Test helper: clear all users
  clear(): void {
    this.users = [];
  }
}
```

- [ ] **Step 3: Write auth service tests**

```typescript
// backend/tests/services/auth.service.test.ts
import { afterEach, describe, expect, it } from "bun:test";
import { AuthService } from "../../src/services/auth.service";
import { MockUserRepository } from "../helpers/mock-user.repository";

const JWT_SECRET = "test-access-secret-key-for-testing";
const JWT_REFRESH_SECRET = "test-refresh-secret-key-for-testing";

describe("AuthService", () => {
  const userRepo = new MockUserRepository();
  const authService = new AuthService(userRepo, {
    jwtSecret: JWT_SECRET,
    jwtRefreshSecret: JWT_REFRESH_SECRET,
    jwtExpiry: "15m",
    jwtRefreshExpiry: "7d",
  });

  afterEach(() => {
    userRepo.clear();
  });

  describe("signup", () => {
    it("should create a new user and return access token", async () => {
      const result = await authService.signup({
        email: "test@example.com",
        password: "password123",
        fullName: "Test User",
      });

      expect(result.user.email).toBe("test@example.com");
      expect(result.user.fullName).toBe("Test User");
      expect(result.accessToken).toBeTruthy();
    });

    it("should reject duplicate email", async () => {
      await authService.signup({
        email: "dupe@example.com",
        password: "password123",
      });

      await expect(
        authService.signup({
          email: "dupe@example.com",
          password: "password456",
        }),
      ).rejects.toThrow("Email already registered");
    });
  });

  describe("login", () => {
    it("should return tokens for valid credentials", async () => {
      await authService.signup({
        email: "login@example.com",
        password: "password123",
      });

      const result = await authService.login({
        email: "login@example.com",
        password: "password123",
      });

      expect(result.user.email).toBe("login@example.com");
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it("should reject invalid email", async () => {
      await expect(
        authService.login({
          email: "nonexistent@example.com",
          password: "password123",
        }),
      ).rejects.toThrow("Invalid email or password");
    });

    it("should reject wrong password", async () => {
      await authService.signup({
        email: "wrongpw@example.com",
        password: "correct-password",
      });

      await expect(
        authService.login({
          email: "wrongpw@example.com",
          password: "wrong-password",
        }),
      ).rejects.toThrow("Invalid email or password");
    });
  });

  describe("refresh", () => {
    it("should return a new access token for valid refresh token", async () => {
      await authService.signup({
        email: "refresh@example.com",
        password: "password123",
      });

      const loginResult = await authService.login({
        email: "refresh@example.com",
        password: "password123",
      });

      const result = await authService.refresh(loginResult.refreshToken);
      expect(result.accessToken).toBeTruthy();
      expect(result.accessToken).not.toBe(loginResult.accessToken);
    });

    it("should reject invalid refresh token", async () => {
      await expect(authService.refresh("invalid-token")).rejects.toThrow();
    });
  });

  describe("me", () => {
    it("should return user profile", async () => {
      const signup = await authService.signup({
        email: "me@example.com",
        password: "password123",
        fullName: "Me User",
      });

      const user = await authService.me(signup.user.id);
      expect(user.email).toBe("me@example.com");
      expect(user.fullName).toBe("Me User");
    });

    it("should throw for nonexistent user", async () => {
      await expect(authService.me("nonexistent-id")).rejects.toThrow(
        "User not found",
      );
    });
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd backend
bun test tests/services/auth.service.test.ts
```

Expected: FAIL — `AuthService` module not found.

- [ ] **Step 5: Implement auth service**

```typescript
// backend/src/services/auth.service.ts
import type { IAuthService } from "../interfaces/services/auth.service.interface";
import type { IUserRepository } from "../interfaces/repositories/user.repository.interface";
import type {
  AuthResponse,
  LoginInput,
  SignupInput,
} from "../types/auth.types";
import { hashPassword, verifyPassword } from "../utils/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";

interface AuthConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
  jwtExpiry: string;
  jwtRefreshExpiry: string;
}

export class AuthService implements IAuthService {
  constructor(
    private userRepository: IUserRepository,
    private config: AuthConfig,
  ) {}

  async signup(input: SignupInput): Promise<AuthResponse> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new Error("Email already registered");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.userRepository.create({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
    });

    const accessToken = signAccessToken(
      { userId: user.id, email: user.email },
      this.config.jwtSecret,
      this.config.jwtExpiry,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        isSuperadmin: user.isSuperadmin,
      },
      accessToken,
    };
  }

  async login(
    input: LoginInput,
  ): Promise<AuthResponse & { refreshToken: string }> {
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      throw new Error("Invalid email or password");
    }

    const isValid = await verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw new Error("Invalid email or password");
    }

    const accessToken = signAccessToken(
      { userId: user.id, email: user.email },
      this.config.jwtSecret,
      this.config.jwtExpiry,
    );

    const refreshToken = signRefreshToken(
      { userId: user.id },
      this.config.jwtRefreshSecret,
      this.config.jwtRefreshExpiry,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        isSuperadmin: user.isSuperadmin,
      },
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = verifyRefreshToken(
      refreshToken,
      this.config.jwtRefreshSecret,
    );

    const user = await this.userRepository.findById(payload.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const accessToken = signAccessToken(
      { userId: user.id, email: user.email },
      this.config.jwtSecret,
      this.config.jwtExpiry,
    );

    return { accessToken };
  }

  async me(userId: string): Promise<AuthResponse["user"]> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      isSuperadmin: user.isSuperadmin,
    };
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend
bun test tests/services/auth.service.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 7: Commit**

```bash
cd backend
git add src/interfaces/services/ src/services/ tests/
git commit -m "feat: add AuthService with IAuthService interface and tests"
```

---

## Task 8: Error Handler Middleware + Auth Middleware

**Files:**

- Create: `backend/src/middlewares/error-handler.middleware.ts`
- Create: `backend/src/middlewares/auth.middleware.ts`

- [ ] **Step 1: Create error handler middleware**

```typescript
// backend/src/middlewares/error-handler.middleware.ts
import { createMiddleware } from "hono/factory";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

export function createErrorHandlerMiddleware(logger: ILogger) {
  return createMiddleware(async (c, next) => {
    try {
      await next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;

      logger.error("Unhandled exception", {
        error: message,
        stack,
        method: c.req.method,
        path: c.req.path,
      });

      // Known business errors return 400
      const knownErrors = [
        "Email already registered",
        "Invalid email or password",
        "User not found",
      ];
      if (knownErrors.includes(message)) {
        return c.json({ error: message }, 400);
      }

      return c.json({ error: "Internal server error" }, 500);
    }
  });
}
```

- [ ] **Step 2: Create auth middleware**

```typescript
// backend/src/middlewares/auth.middleware.ts
import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../utils/jwt";

export function createAuthMiddleware(jwtSecret: string) {
  return createMiddleware(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid authorization header" }, 401);
    }

    const token = authHeader.slice(7);
    try {
      const payload = verifyAccessToken(token, jwtSecret);
      c.set("userId", payload.userId);
      c.set("userEmail", payload.email);
      await next();
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  });
}
```

- [ ] **Step 3: Commit**

```bash
cd backend
git add src/middlewares/
git commit -m "feat: add error handler and auth middlewares"
```

---

## Task 9: Auth Route

**Files:**

- Create: `backend/src/routes/auth.route.ts`

- [ ] **Step 1: Create auth route**

```typescript
// backend/src/routes/auth.route.ts
import { Hono } from "hono";
import { setCookie, getCookie } from "hono/cookie";
import type { IAuthService } from "../interfaces/services/auth.service.interface";

export function createAuthRoutes(authService: IAuthService) {
  const app = new Hono();

  // POST /auth/signup
  app.post("/signup", async (c) => {
    const body = await c.req.json();
    const { email, password, fullName } = body;

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const result = await authService.signup({ email, password, fullName });
    return c.json({ data: result }, 201);
  });

  // POST /auth/login
  app.post("/login", async (c) => {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const { refreshToken, ...result } = await authService.login({
      email,
      password,
    });

    setCookie(c, "refreshToken", refreshToken, {
      httpOnly: true,
      secure: false, // set to true in production with HTTPS
      sameSite: "Lax",
      path: "/api/auth/refresh",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return c.json({ data: result });
  });

  // POST /auth/refresh
  app.post("/refresh", async (c) => {
    const refreshToken = getCookie(c, "refreshToken");
    if (!refreshToken) {
      return c.json({ error: "No refresh token" }, 401);
    }

    const result = await authService.refresh(refreshToken);
    return c.json({ data: result });
  });

  // GET /auth/me (requires auth middleware applied at app level)
  app.get("/me", async (c) => {
    const userId = c.get("userId");
    if (!userId) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const user = await authService.me(userId);
    return c.json({ data: user });
  });

  return app;
}
```

- [ ] **Step 2: Commit**

```bash
cd backend
git add src/routes/
git commit -m "feat: add auth routes (signup, login, refresh, me)"
```

---

## Task 10: Composition Root (index.ts)

**Files:**

- Create: `backend/src/index.ts`

- [ ] **Step 1: Create the composition root**

```typescript
// backend/src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { PrismaClient } from "@prisma/client";
import { env } from "./utils/env";
import { ConsoleLogger } from "./providers/console-logger.provider";
import { UserRepository } from "./repositories/user.repository";
import { AuthService } from "./services/auth.service";
import { createAuthRoutes } from "./routes/auth.route";
import { createErrorHandlerMiddleware } from "./middlewares/error-handler.middleware";
import { createAuthMiddleware } from "./middlewares/auth.middleware";

// ─── Infra ──────────────────────────────────────────────────────
const prisma = new PrismaClient();
const logger = new ConsoleLogger(env.serviceName);

// ─── Repositories ───────────────────────────────────────────────
const userRepository = new UserRepository(prisma);

// ─── Services ───────────────────────────────────────────────────
const authService = new AuthService(userRepository, {
  jwtSecret: env.jwtSecret,
  jwtRefreshSecret: env.jwtRefreshSecret,
  jwtExpiry: env.jwtExpiry,
  jwtRefreshExpiry: env.jwtRefreshExpiry,
});

// ─── Auth Middleware ────────────────────────────────────────────
const authMiddleware = createAuthMiddleware(env.jwtSecret);

// ─── App ────────────────────────────────────────────────────────
const app = new Hono();

// Global middlewares
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:80",
      "http://localhost",
    ],
    credentials: true,
  }),
);
app.use("*", createErrorHandlerMiddleware(logger));

// Public routes
app.route("/api/auth", createAuthRoutes(authService));

// Protected routes (all routes below require auth)
app.use("/api/*", authMiddleware);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// ─── Start ──────────────────────────────────────────────────────
logger.info(`Starting server on port ${env.port}`);

export default {
  port: env.port,
  fetch: app.fetch,
};
```

- [ ] **Step 2: Verify the app starts**

```bash
cd backend
cp ../.env.example .env
bun run dev
```

Expected: Server starts on port 3001, logs "Starting server on port 3001".

Stop the server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
cd backend
git add src/index.ts
git commit -m "feat: add composition root wiring auth flow"
```

---

## Task 11: End-to-End Auth Verification

**Files:** None (manual testing with curl)

- [ ] **Step 1: Start the server**

```bash
cd backend
bun run dev &
```

- [ ] **Step 2: Test signup**

```bash
curl -s -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","fullName":"Test User"}' | jq .
```

Expected:

```json
{
  "data": {
    "user": {
      "id": "<uuid>",
      "email": "test@example.com",
      "fullName": "Test User",
      "avatarUrl": null,
      "isSuperadmin": false
    },
    "accessToken": "<jwt>"
  }
}
```

- [ ] **Step 3: Test duplicate signup**

```bash
curl -s -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password456"}' | jq .
```

Expected: `{ "error": "Email already registered" }` with status 400.

- [ ] **Step 4: Test login**

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"password123"}' | jq .
```

Expected: Returns `data.user` and `data.accessToken`. A `refreshToken` cookie is set (saved to cookies.txt).

Save the accessToken from the response for the next step.

- [ ] **Step 5: Test /me with access token**

```bash
curl -s http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <paste-access-token>" | jq .
```

Expected: Returns `data` with user profile.

- [ ] **Step 6: Test /me without token**

```bash
curl -s http://localhost:3001/api/auth/me | jq .
```

Expected: `{ "error": "Missing or invalid authorization header" }` with status 401.

- [ ] **Step 7: Test refresh**

```bash
curl -s -X POST http://localhost:3001/api/auth/refresh \
  -b cookies.txt | jq .
```

Expected: Returns `data.accessToken` (new access token).

- [ ] **Step 8: Test health check (protected)**

```bash
curl -s http://localhost:3001/api/health \
  -H "Authorization: Bearer <paste-access-token>" | jq .
```

Expected: `{ "status": "ok" }`

- [ ] **Step 9: Stop the server and clean up**

```bash
kill %1
rm -f cookies.txt
```

- [ ] **Step 10: Run all tests one final time**

```bash
cd backend
bun test
```

Expected: All 7 tests pass.

- [ ] **Step 11: Run typecheck and lint**

```bash
cd backend
bunx tsc --noEmit && bunx biome check .
```

Expected: Zero type errors, zero lint errors.

---

## Task 12: Frontend Project Scaffolding

**Files:**

- Create: `frontend/` via Vite scaffolding
- Modify: `frontend/package.json`
- Create: `frontend/tailwind.config.ts`
- Modify: `frontend/src/index.css`
- Modify: `frontend/index.html`

- [ ] **Step 1: Scaffold Vite + React + TypeScript**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
bun create vite frontend --template react-ts
cd frontend
bun install
```

- [ ] **Step 2: Install additional dependencies**

```bash
cd frontend
bun add react-router-dom lucide-react
bun add -d tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Update vite.config.ts**

```typescript
// frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Replace src/index.css with Tailwind + theme**

```css
/* frontend/src/index.css */
@import "tailwindcss";

/* Base theme overrides */
body {
  font-family:
    "Inter",
    system-ui,
    -apple-system,
    sans-serif;
  background-color: #f5f5f5;
  color: #111111;
  margin: 0;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #d4d4d4;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #999;
}
```

- [ ] **Step 5: Update index.html title**

Replace the `<title>` tag in `frontend/index.html`:

```html
<title>FCE Dashboard</title>
```

Also add Inter font in the `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 6: Verify dev server starts**

```bash
cd frontend
bun run dev
```

Expected: Vite dev server starts at `http://localhost:5173`.

Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add .
git commit -m "chore: scaffold frontend with Vite, React, Tailwind CSS, React Router"
```

---

## Task 13: Frontend Types + API Client

**Files:**

- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/services/api.ts`

- [ ] **Step 1: Create shared types**

```typescript
// frontend/src/types/index.ts

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  isSuperadmin: boolean;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface ApiError {
  error: string;
}

export interface ApiResponse<T> {
  data: T;
}
```

- [ ] **Step 2: Create API client**

```typescript
// frontend/src/services/api.ts

const BASE_URL = import.meta.env.VITE_API_URL || "";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const newToken = json.data.accessToken;
    setAccessToken(newToken);
    return newToken;
  } catch {
    return null;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // If 401, try refreshing token and retry once
  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    }
  }

  if (!res.ok) {
    const errorBody = await res
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(errorBody.error || "Request failed");
  }

  const json = await res.json();
  return json.data;
}
```

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/types/ src/services/
git commit -m "feat: add frontend types and API client with token refresh"
```

---

## Task 14: Auth Context + useAuth Hook

**Files:**

- Create: `frontend/src/contexts/AuthContext.tsx`
- Create: `frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Create AuthContext**

```tsx
// frontend/src/contexts/AuthContext.tsx
import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, setAccessToken } from "../services/api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Try to restore session on mount
  useEffect(() => {
    const restore = async () => {
      try {
        // Attempt token refresh (using httpOnly cookie)
        const refreshRes = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/auth/refresh`,
          { method: "POST", credentials: "include" },
        );
        if (refreshRes.ok) {
          const json = await refreshRes.json();
          setAccessToken(json.data.accessToken);
          const userData = await api<User>("/api/auth/me");
          setUser(userData);
        }
      } catch {
        // Not authenticated
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ user: User; accessToken: string }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const signup = useCallback(
    async (email: string, password: string, fullName?: string) => {
      const result = await api<{ user: User; accessToken: string }>(
        "/api/auth/signup",
        {
          method: "POST",
          body: JSON.stringify({ email, password, fullName }),
        },
      );
      setAccessToken(result.accessToken);
      setUser(result.user);
    },
    [],
  );

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 2: Create useAuth hook**

```typescript
// frontend/src/hooks/useAuth.ts
import { useContext } from "react";
import { AuthContext } from "../contexts/AuthContext";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
```

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/contexts/ src/hooks/
git commit -m "feat: add AuthContext and useAuth hook with session restore"
```

---

## Task 15: UI Primitives (Button, Input, Spinner)

**Files:**

- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Input.tsx`
- Create: `frontend/src/components/ui/Spinner.tsx`

- [ ] **Step 1: Create Button component**

```tsx
// frontend/src/components/ui/Button.tsx
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-black disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-black text-white hover:bg-gray-800",
    secondary: "bg-white text-black border border-gray-300 hover:bg-gray-50",
    danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Create Input component**

```tsx
// frontend/src/components/ui/Input.tsx
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={`w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black placeholder:text-gray-400 ${error ? "border-red-500" : ""} ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
```

- [ ] **Step 3: Create Spinner component**

```tsx
// frontend/src/components/ui/Spinner.tsx

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  const sizes = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <svg
      className={`animate-spin text-gray-400 ${sizes[size]} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/components/ui/
git commit -m "feat: add Button, Input, and Spinner UI primitives"
```

---

## Task 16: Login + Signup Pages

**Files:**

- Create: `frontend/src/pages/LoginPage.tsx`
- Create: `frontend/src/pages/SignupPage.tsx`

- [ ] **Step 1: Create LoginPage**

```tsx
// frontend/src/pages/LoginPage.tsx
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-black mb-8">
          FCE Dashboard
        </h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-black mb-4">Log in</h2>
          {error && (
            <div className="mb-4 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
            <Button type="submit" className="w-full" loading={loading}>
              Log in
            </Button>
          </form>
          <p className="mt-4 text-xs text-center text-gray-500">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="text-black font-medium hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create SignupPage**

```tsx
// frontend/src/pages/SignupPage.tsx
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup(email, password, fullName || undefined);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-black mb-8">
          FCE Dashboard
        </h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-black mb-4">
            Create account
          </h2>
          {error && (
            <div className="mb-4 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              minLength={8}
              required
            />
            <Button type="submit" className="w-full" loading={loading}>
              Create account
            </Button>
          </form>
          <p className="mt-4 text-xs text-center text-gray-500">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-black font-medium hover:underline"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/pages/
git commit -m "feat: add Login and Signup pages"
```

---

## Task 17: App Shell + Router + App.tsx

**Files:**

- Create: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Create AppShell placeholder**

```tsx
// frontend/src/components/layout/AppShell.tsx
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Spinner } from "../ui/Spinner";

export function AppShell() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar — built in Phase 4 */}
      <aside className="w-[220px] bg-[#111] flex flex-col shrink-0">
        <div className="p-4">
          <span className="text-white font-bold text-sm">FCE Dashboard</span>
        </div>
        <nav className="flex-1 px-3 py-2">
          <p className="text-gray-500 text-xs px-2">
            Navigation coming in Phase 4
          </p>
        </nav>
        <div className="p-4 border-t border-gray-800">
          <p className="text-gray-400 text-xs truncate">{user.email}</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Replace App.tsx**

```tsx
// frontend/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<AppShell />}>
            <Route
              path="/"
              element={
                <div>
                  <h1 className="text-lg font-semibold text-black">
                    Dashboard
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">
                    Welcome! Full dashboard coming in Phase 5.
                  </p>
                </div>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Replace main.tsx**

```tsx
// frontend/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Clean up scaffolding files**

Remove Vite default files that are no longer needed:

```bash
cd frontend
rm -f src/App.css src/assets/react.svg public/vite.svg
```

- [ ] **Step 5: Verify full flow**

Start both backend and frontend:

```bash
# Terminal 1
cd backend && bun run dev

# Terminal 2
cd frontend && bun run dev
```

Open `http://localhost:5173`:

1. Should redirect to `/login`
2. Sign up with email/password
3. Should redirect to `/` and see the dashboard placeholder with dark sidebar
4. Refresh the page — session should persist (via refresh token cookie)

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/
rm -f src/App.css  # ensure deleted files are staged
git add -A
git commit -m "feat: add AppShell, routing, and complete auth flow"
```

---

## Task 18: Nginx Config

**Files:**

- Create: `nginx.conf`

- [ ] **Step 1: Create nginx.conf**

```nginx
# nginx.conf
# For local development: run with `nginx -c $(pwd)/nginx.conf`
# Production: copy to /etc/nginx/conf.d/ or similar

server {
    listen 80;
    server_name localhost;

    # Frontend — serve Vite build output
    root /Users/wildananugrah/Documents/My-Projects/fce/frontend/dist;
    index index.html;

    # API — proxy to Hono backend
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }

    # SPA fallback — all non-API, non-file routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static file caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add nginx.conf
git commit -m "chore: add Nginx config for reverse proxy and static file serving"
```

---

## Task 19: Final Verification + Phase 1 Complete

- [ ] **Step 1: Run all backend tests**

```bash
cd backend
bun test
```

Expected: All 7 tests pass.

- [ ] **Step 2: Run backend typecheck and lint**

```bash
cd backend
bunx tsc --noEmit && bunx biome check .
```

Expected: Zero errors.

- [ ] **Step 3: Run frontend build**

```bash
cd frontend
bun run build
```

Expected: Build succeeds, output in `frontend/dist/`.

- [ ] **Step 4: Verify docker-compose services**

```bash
docker compose ps
```

Expected: PostgreSQL and MinIO running.

- [ ] **Step 5: Commit any remaining changes**

```bash
git add -A
git status
```

If there are uncommitted changes, commit them:

```bash
git commit -m "chore: phase 1 foundation complete"
```

---

## Phase 1 Checkpoint

At the end of Phase 1, you should be able to verify:

- [x] `docker compose up -d` starts PostgreSQL + MinIO
- [x] `cd backend && bunx prisma migrate dev` runs migrations successfully
- [x] `cd backend && bunx prisma db seed` seeds frameworks and hook types
- [x] `cd backend && bun test` — all 7 tests pass
- [x] `cd backend && bunx tsc --noEmit` — zero type errors
- [x] `cd backend && bunx biome check .` — zero lint errors
- [x] `cd backend && bun run dev` — server starts on port 3001
- [x] `curl POST /api/auth/signup` — creates user, returns access token
- [x] `curl POST /api/auth/login` — returns access token + sets refresh cookie
- [x] `curl POST /api/auth/refresh` — returns new access token
- [x] `curl GET /api/auth/me` — returns user profile (with valid token)
- [x] `curl GET /api/health` — returns `{ status: "ok" }` (with valid token)
- [x] `cd frontend && bun run dev` — Vite starts on port 5173
- [x] Login page renders and submits to backend
- [x] Signup page renders and creates account
- [x] After login, redirects to dashboard with dark sidebar shell
- [x] Page refresh preserves session (refresh token cookie)
- [x] `cd frontend && bun run build` — builds successfully
