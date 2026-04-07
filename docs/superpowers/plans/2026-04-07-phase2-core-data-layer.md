# Phase 2: Core Data Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement workspace CRUD with member/invitation management, workspace access middleware, brand CRUD with brain versioning, product CRUD with brain versioning, and taxonomy read-only endpoints.

**Architecture:** SOLID + Manual DI. Each domain gets: types → interface → repository → service → route. All wired in composition root.

**Tech Stack:** Hono, Prisma, Bun, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-07-fce-rewrite-design.md`

---

## File Structure

```
backend/src/
├── types/
│   ├── workspace.types.ts        # NEW
│   ├── brand.types.ts            # NEW
│   └── product.types.ts          # NEW
├── interfaces/
│   ├── repositories/
│   │   ├── workspace.repository.interface.ts   # NEW
│   │   ├── brand.repository.interface.ts       # NEW
│   │   ├── product.repository.interface.ts     # NEW
│   │   └── taxonomy.repository.interface.ts    # NEW
│   └── services/
│       ├── workspace.service.interface.ts      # NEW
│       ├── brand.service.interface.ts          # NEW
│       ├── product.service.interface.ts        # NEW
│       └── taxonomy.service.interface.ts       # NEW
├── repositories/
│   ├── workspace.repository.ts    # NEW
│   ├── brand.repository.ts        # NEW
│   ├── product.repository.ts      # NEW
│   └── taxonomy.repository.ts     # NEW
├── services/
│   ├── workspace.service.ts       # NEW
│   ├── brand.service.ts           # NEW
│   ├── product.service.ts         # NEW
│   └── taxonomy.service.ts        # NEW
├── routes/
│   ├── workspace.route.ts         # NEW
│   ├── brand.route.ts             # NEW
│   ├── product.route.ts           # NEW
│   └── taxonomy.route.ts          # NEW
├── middlewares/
│   └── workspace.middleware.ts    # NEW
├── index.ts                       # MODIFY — wire new dependencies
└── tests/
    └── services/
        ├── workspace.service.test.ts  # NEW
        ├── brand.service.test.ts      # NEW
        └── product.service.test.ts    # NEW
```

---

## Task 1: Workspace Types + Repository + Service + Route

**Files:**

- Create: `backend/src/types/workspace.types.ts`
- Create: `backend/src/interfaces/repositories/workspace.repository.interface.ts`
- Create: `backend/src/repositories/workspace.repository.ts`
- Create: `backend/src/interfaces/services/workspace.service.interface.ts`
- Create: `backend/src/services/workspace.service.ts`
- Create: `backend/src/routes/workspace.route.ts`
- Create: `backend/src/middlewares/workspace.middleware.ts`

### workspace.types.ts

```typescript
export interface CreateWorkspaceInput {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
  logoUrl?: string;
  avatarColor?: string;
  avatarEmoji?: string;
}

export interface InviteMemberInput {
  email: string;
  role?: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  avatarColor: string;
  avatarEmoji: string | null;
  role: string;
}
```

### workspace.repository.interface.ts

```typescript
import type {
  Workspace,
  UserWorkspaceRole,
  WorkspaceInvitation,
} from "@prisma/client";

export interface IWorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  findByUserId(
    userId: string,
  ): Promise<(Workspace & { roles: { role: string }[] })[]>;
  create(data: {
    name: string;
    slug: string;
    description?: string;
  }): Promise<Workspace>;
  update(id: string, data: Partial<Workspace>): Promise<Workspace>;

  // Members
  findRole(
    userId: string,
    workspaceId: string,
  ): Promise<UserWorkspaceRole | null>;
  findMembers(
    workspaceId: string,
  ): Promise<
    (UserWorkspaceRole & {
      user: {
        id: string;
        email: string;
        fullName: string | null;
        avatarUrl: string | null;
      };
    })[]
  >;
  addMember(
    workspaceId: string,
    userId: string,
    role: string,
  ): Promise<UserWorkspaceRole>;
  removeMember(workspaceId: string, userId: string): Promise<void>;

  // Invitations
  findInvitations(workspaceId: string): Promise<WorkspaceInvitation[]>;
  findInvitationsByEmail(
    email: string,
  ): Promise<(WorkspaceInvitation & { workspace: Workspace })[]>;
  createInvitation(data: {
    workspaceId: string;
    email: string;
    role: string;
    invitedBy: string;
  }): Promise<WorkspaceInvitation>;
  updateInvitation(
    id: string,
    data: Partial<WorkspaceInvitation>,
  ): Promise<WorkspaceInvitation>;
}
```

### workspace.repository.ts

Implement `IWorkspaceRepository` using PrismaClient. Each method is a straightforward Prisma query.

- `findByUserId`: query `userWorkspaceRole` where userId, include workspace
- `findMembers`: query `userWorkspaceRole` where workspaceId, include user (select id, email, fullName, avatarUrl)
- `findInvitationsByEmail`: query `workspaceInvitation` where email AND status "pending", include workspace

### workspace.service.interface.ts

```typescript
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  InviteMemberInput,
  WorkspaceSummary,
} from "../../types/workspace.types";

export interface IWorkspaceService {
  listByUser(userId: string): Promise<WorkspaceSummary[]>;
  getById(id: string): Promise<any>;
  create(userId: string, input: CreateWorkspaceInput): Promise<any>;
  update(id: string, input: UpdateWorkspaceInput): Promise<any>;

  listMembers(workspaceId: string): Promise<any[]>;
  invite(
    workspaceId: string,
    invitedBy: string,
    input: InviteMemberInput,
  ): Promise<any>;
  acceptInvitation(invitationId: string, userId: string): Promise<void>;
  removeMember(workspaceId: string, userId: string): Promise<void>;

  listInvitations(workspaceId: string): Promise<any[]>;
  updateInvitation(
    invitationId: string,
    data: { status: string },
  ): Promise<any>;
}
```

### workspace.service.ts

Implements IWorkspaceService:

- `create`: creates workspace, adds creator as "admin" role
- `listByUser`: gets workspaces via repo, maps to WorkspaceSummary
- `invite`: checks if already member, creates invitation
- `acceptInvitation`: finds invitation by id, verifies email matches user, updates status to "accepted", adds member with invitation's role
- `removeMember`: deletes role (cannot remove last admin)

### workspace.middleware.ts

```typescript
import { createMiddleware } from "hono/factory";
import type { IWorkspaceRepository } from "../interfaces/repositories/workspace.repository.interface";

export function createWorkspaceMiddleware(workspaceRepo: IWorkspaceRepository) {
  return createMiddleware(async (c, next) => {
    const workspaceId = c.req.param("workspaceId");
    if (!workspaceId) {
      return c.json({ error: "Workspace ID required" }, 400);
    }

    const userId = c.get("userId");
    const role = await workspaceRepo.findRole(userId, workspaceId);
    if (!role) {
      return c.json({ error: "Not a member of this workspace" }, 403);
    }

    c.set("workspaceId", workspaceId);
    c.set("workspaceRole", role.role);
    await next();
  });
}
```

### workspace.route.ts

```typescript
export function createWorkspaceRoutes(workspaceService: IWorkspaceService) {
  const app = new Hono();

  // GET / — list user's workspaces
  // POST / — create workspace
  // GET /:id — get workspace
  // PATCH /:id — update workspace (admin only)
  // GET /:id/members — list members
  // POST /:id/invitations — invite member (admin only)
  // PATCH /:id/invitations/:invId — accept/revoke invitation
  // DELETE /:id/members/:userId — remove member (admin only)

  return app;
}
```

Routes should be thin — parse request, call service, return `{ data: result }`.

- [ ] **Step 1:** Create all workspace files (types, interface, repository, service, middleware, route)
- [ ] **Step 2:** Run `bunx tsc --noEmit` to verify types
- [ ] **Step 3:** Commit: `git commit -m "feat: add workspace CRUD with member and invitation management"`

---

## Task 2: Brand Types + Repository + Service + Route

**Files:**

- Create: `backend/src/types/brand.types.ts`
- Create: `backend/src/interfaces/repositories/brand.repository.interface.ts`
- Create: `backend/src/repositories/brand.repository.ts`
- Create: `backend/src/interfaces/services/brand.service.interface.ts`
- Create: `backend/src/services/brand.service.ts`
- Create: `backend/src/routes/brand.route.ts`

### brand.types.ts

```typescript
export interface CreateBrandInput {
  name: string;
  slug: string;
  category?: string;
  websiteUrl?: string;
}

export interface UpdateBrandInput {
  name?: string;
  category?: string;
  websiteUrl?: string;
  status?: string;
}

export interface CreateBrainVersionInput {
  personality?: string;
  tone?: string;
  audiencePersonas?: any;
  values?: any;
  messagingRules?: any;
  vocabulary?: any;
}
```

### brand.repository.interface.ts

```typescript
import type { Brand, BrandBrainVersion } from "@prisma/client";

export interface IBrandRepository {
  findByWorkspace(workspaceId: string): Promise<Brand[]>;
  findById(
    id: string,
  ): Promise<(Brand & { brainVersions: BrandBrainVersion[] }) | null>;
  create(data: {
    workspaceId: string;
    name: string;
    slug: string;
    category?: string;
    websiteUrl?: string;
  }): Promise<Brand>;
  update(id: string, data: Partial<Brand>): Promise<Brand>;

  // Brain versions
  findBrainVersions(brandId: string): Promise<BrandBrainVersion[]>;
  findActiveBrainVersion(brandId: string): Promise<BrandBrainVersion | null>;
  createBrainVersion(brandId: string, data: any): Promise<BrandBrainVersion>;
  getNextVersionNumber(brandId: string): Promise<number>;
}
```

### brand.repository.ts

- `findByWorkspace`: where workspaceId, orderBy updatedAt desc
- `findById`: include brainVersions (orderBy version desc)
- `createBrainVersion`: deactivate all existing versions first, create new with isActive=true, update brand's activeBrainVersionId
- `getNextVersionNumber`: count existing versions + 1

### brand.service.ts

- `list(workspaceId)`: calls repo.findByWorkspace
- `getById(id)`: calls repo.findById, throws if not found
- `create(workspaceId, input)`: calls repo.create
- `update(id, input)`: calls repo.update
- `createBrainVersion(brandId, input)`: gets next version number, creates version via repo

### brand.route.ts

```
GET    /                    — list brands in workspace
POST   /                    — create brand
GET    /:id                 — get brand with brain versions
PATCH  /:id                 — update brand
POST   /:id/brain-versions  — create new brain version
```

All routes receive workspaceId from the workspace middleware context.

- [ ] **Step 1:** Create all brand files
- [ ] **Step 2:** Run `bunx tsc --noEmit`
- [ ] **Step 3:** Commit: `git commit -m "feat: add brand CRUD with brain versioning"`

---

## Task 3: Product Types + Repository + Service + Route

**Files:**

- Create: `backend/src/types/product.types.ts`
- Create: `backend/src/interfaces/repositories/product.repository.interface.ts`
- Create: `backend/src/repositories/product.repository.ts`
- Create: `backend/src/interfaces/services/product.service.interface.ts`
- Create: `backend/src/services/product.service.ts`
- Create: `backend/src/routes/product.route.ts`

### product.types.ts

```typescript
export interface CreateProductInput {
  brandId: string;
  name: string;
  slug: string;
  type?: string;
}

export interface UpdateProductInput {
  name?: string;
  type?: string;
  status?: string;
}

export interface CreateProductBrainVersionInput {
  usp?: string;
  rtb?: string;
  functionalBenefits?: any;
  emotionalBenefits?: any;
  targetAudience?: string;
  claims?: any;
  disclaimers?: any;
}
```

### product.repository.interface.ts

Same pattern as brand — findByWorkspace, findById (include brainVersions), create, update, brain version CRUD.

### product.service.ts

Same pattern as brand service.

### product.route.ts

```
GET    /                    — list products in workspace
POST   /                    — create product
GET    /:id                 — get product with brain versions
PATCH  /:id                 — update product
POST   /:id/brain-versions  — create new brain version
```

- [ ] **Step 1:** Create all product files
- [ ] **Step 2:** Run `bunx tsc --noEmit`
- [ ] **Step 3:** Commit: `git commit -m "feat: add product CRUD with brain versioning"`

---

## Task 4: Taxonomy Repository + Service + Route

**Files:**

- Create: `backend/src/interfaces/repositories/taxonomy.repository.interface.ts`
- Create: `backend/src/repositories/taxonomy.repository.ts`
- Create: `backend/src/interfaces/services/taxonomy.service.interface.ts`
- Create: `backend/src/services/taxonomy.service.ts`
- Create: `backend/src/routes/taxonomy.route.ts`

### taxonomy.repository.interface.ts

```typescript
import type { Framework, HookType } from "@prisma/client";

export interface ITaxonomyRepository {
  findAllFrameworks(): Promise<Framework[]>;
  findAllHookTypes(): Promise<HookType[]>;
}
```

### taxonomy.service.ts

Thin wrapper — calls repository methods.

### taxonomy.route.ts

```
GET /frameworks   — list all frameworks
GET /hook-types   — list all hook types
```

Read-only, no workspace scoping needed (taxonomy is global).

- [ ] **Step 1:** Create all taxonomy files
- [ ] **Step 2:** Run `bunx tsc --noEmit`
- [ ] **Step 3:** Commit: `git commit -m "feat: add taxonomy endpoints (frameworks, hook types)"`

---

## Task 5: Wire Everything in Composition Root

**File:** Modify `backend/src/index.ts`

Add to composition root:

1. Import and instantiate all new repositories (WorkspaceRepository, BrandRepository, ProductRepository, TaxonomyRepository)
2. Import and instantiate all new services
3. Create workspace middleware
4. Register routes:
   - `app.route("/api/workspaces", createWorkspaceRoutes(workspaceService))`
   - Workspace-scoped routes with middleware:
     - `/api/workspaces/:workspaceId/brands` → brand routes
     - `/api/workspaces/:workspaceId/products` → product routes
   - `app.route("/api/taxonomy", createTaxonomyRoutes(taxonomyService))`
5. Update knownErrors array with new error messages

Also update the Hono Variables type to include workspaceId and workspaceRole.

- [ ] **Step 1:** Update index.ts with all new wiring
- [ ] **Step 2:** Run `bunx tsc --noEmit`
- [ ] **Step 3:** Commit: `git commit -m "feat: wire workspace, brand, product, taxonomy routes in composition root"`

---

## Task 6: Unit Tests for Services

**Files:**

- Create: `backend/tests/services/workspace.service.test.ts`
- Create: `backend/tests/services/brand.service.test.ts`
- Create: `backend/tests/services/product.service.test.ts`
- Create: `backend/tests/helpers/mock-workspace.repository.ts`
- Create: `backend/tests/helpers/mock-brand.repository.ts`
- Create: `backend/tests/helpers/mock-product.repository.ts`

### Test coverage:

**WorkspaceService:**

- create workspace → returns workspace, creator added as admin
- listByUser → returns workspaces with roles
- invite → creates invitation
- invite duplicate → throws error
- acceptInvitation → adds member
- removeMember → removes role

**BrandService:**

- list brands by workspace
- create brand
- get brand by id (found/not found)
- create brain version → increments version number

**ProductService:**

- list products by workspace
- create product
- get product by id (found/not found)
- create brain version → increments version number

- [ ] **Step 1:** Create mock repositories
- [ ] **Step 2:** Create service tests
- [ ] **Step 3:** Run `bun test` — all tests pass
- [ ] **Step 4:** Commit: `git commit -m "test: add unit tests for workspace, brand, and product services"`

---

## Task 7: End-to-End Verification

Test the complete flow with curl:

1. Start server: `cd backend && bun run dev`
2. Signup and get access token
3. Create workspace
4. List workspaces
5. Create brand in workspace
6. Create brain version for brand
7. Create product for brand
8. Create brain version for product
9. List frameworks
10. List hook types
11. Run `bunx tsc --noEmit` — zero errors
12. Run `bun test` — all tests pass

- [ ] **Step 1:** Start server and test all endpoints
- [ ] **Step 2:** Fix any issues
- [ ] **Step 3:** Final commit if needed

---

## Phase 2 Checkpoint

- [x] `POST /api/workspaces` — creates workspace, adds creator as admin
- [x] `GET /api/workspaces` — lists user's workspaces with roles
- [x] `GET /api/workspaces/:id` — returns workspace details
- [x] `PATCH /api/workspaces/:id` — updates workspace (admin only)
- [x] `GET /api/workspaces/:id/members` — lists members
- [x] `POST /api/workspaces/:id/invitations` — invites member
- [x] `PATCH /api/workspaces/:id/invitations/:invId` — accept/revoke
- [x] `DELETE /api/workspaces/:id/members/:userId` — remove member
- [x] `GET /api/workspaces/:wid/brands` — lists brands
- [x] `POST /api/workspaces/:wid/brands` — creates brand
- [x] `GET /api/workspaces/:wid/brands/:id` — brand with brain versions
- [x] `PATCH /api/workspaces/:wid/brands/:id` — updates brand
- [x] `POST /api/workspaces/:wid/brands/:id/brain-versions` — new brain version
- [x] `GET /api/workspaces/:wid/products` — lists products
- [x] `POST /api/workspaces/:wid/products` — creates product
- [x] `GET /api/workspaces/:wid/products/:id` — product with brain versions
- [x] `PATCH /api/workspaces/:wid/products/:id` — updates product
- [x] `POST /api/workspaces/:wid/products/:id/brain-versions` — new brain version
- [x] `GET /api/taxonomy/frameworks` — lists frameworks
- [x] `GET /api/taxonomy/hook-types` — lists hook types
- [x] `bunx tsc --noEmit` — zero errors
- [x] `bun test` — all tests pass
