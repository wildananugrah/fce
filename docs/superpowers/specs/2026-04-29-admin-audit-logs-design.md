# Admin Audit Logs — Design

**Date:** 2026-04-29
**Status:** Spec
**Owner:** Backend / Admin Panel

## Problem

The Admin Panel → Audit Logs tab always shows "No audit logs found." The schema (`AuditLog`), API (`GET /api/admin/audit-logs`), service (`AdminService.listAuditLogs`), and frontend table all exist, but **nothing in the codebase ever writes to `audit_logs`**. The Sprint 4 plan only built the read path; the write hooks were never instrumented. The DB confirms zero rows.

This is a missing feature, not a regression. We need to add audit-log writes for the handful of admin / sensitive actions a superadmin would actually want a paper trail for.

## Goals

- Populate `audit_logs` with high-signal admin events so the panel becomes useful.
- Stay tight: only audit actions where the consumer (a superadmin reviewing past activity) cares.
- Reuse existing patterns — no new infra.

## Non-Goals

- Login success / failure logging (different concern; failures have no `userId`).
- High-volume entity CRUD (brands / products / topics / content) — users see their own activity in-app.
- AI generation requests — already captured in `ai_provider_logs`.
- Sweeper hard-deletes from `ArchiveSweepJob` — no acting user; out of scope.
- Filter / search UI in the Admin Panel — current rendering is fine for v1.

## Schema Change

Make `AuditLog.workspaceId` nullable so superadmin-global actions (user CRUD, taxonomy edits, superadmin grants) can be audited.

```diff
 model AuditLog {
   id          String   @id @default(uuid())
-  workspaceId String   @map("workspace_id")
+  workspaceId String?  @map("workspace_id")
   userId      String   @map("user_id")
   ...
-  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
+  workspace Workspace? @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
 }
```

`userId` stays NOT NULL — every action we audit has a known acting user. Apply via `bunx prisma db push`. No data migration needed (table is empty).

The reverse relation on `Workspace.auditLogs` continues to work; cascade-on-workspace-delete still applies to rows that have a workspace.

## Architecture

### New service

`backend/src/services/audit.service.ts`:

```ts
export interface AuditLogInput {
  workspaceId: string | null;        // null for superadmin-global actions
  userId: string;                    // the acting user (always present)
  action: string;                    // dotted, e.g. "user.create"
  entityType: string;                // e.g. "user", "workspace_member"
  entityId: string | null;
  metadata?: Record<string, unknown>;
}

export interface IAuditService {
  log(input: AuditLogInput): Promise<void>;
}

export class AuditService implements IAuditService {
  constructor(private prisma: PrismaClient, private logger: ILogger) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: input.metadata ?? null,
        },
      });
    } catch (err) {
      this.logger.error("audit.log failed", {
        action: input.action,
        entityType: input.entityType,
        err,
      });
    }
  }
}
```

Mirrors the shape of [ai-activity-logger.ts](../../../backend/src/utils/ai-activity-logger.ts) — soft-fail, errors go to Winston, never block the user's request.

Wired in the composition root ([backend/src/index.ts](../../../backend/src/index.ts)) and constructor-injected into the services that emit events.

### Write semantics

Inside the service method, **after** the change persists, **awaited**, soft-fail:

```ts
await this.repo.setRole(userId, workspaceId, role);
await this.audit.log({
  workspaceId,
  userId: actingUserId,
  action: "workspace.member_role_change",
  entityType: "workspace_member",
  entityId: userId,
  metadata: { targetEmail, fromRole, toRole },
});
```

Rationale: the service has the before/after state needed for diffs; the route stays a thin HTTP shell; soft-fail means a malformed metadata blob never blocks a real operation.

### Acting user propagation

Routes already extract `userId` from the JWT and put it on the Hono context (`c.get("userId")`). Every audited service method takes `actingUserId: string` as a parameter (added where missing) — no service-locator, no AsyncLocalStorage. Constructor injection only.

## Action Catalog

### Group A — Superadmin global (`workspaceId: null`)

| Action | `entityType` | `entityId` | `metadata` |
|---|---|---|---|
| `user.create` | `user` | new user id | `{ email, fullName, isSuperadmin }` |
| `user.delete` | `user` | deleted id (preserved as string) | `{ email, fullName }` |
| `user.password_reset` | `user` | target id | `{ targetEmail }` |
| `user.superadmin_grant` | `user` | target id | `{ targetEmail }` |
| `user.superadmin_revoke` | `user` | target id | `{ targetEmail }` |
| `user.update` | `user` | target id | `{ targetEmail, changes: { email?: {from,to}, status?: {from,to} } }` |
| `taxonomy.create` | `framework` \| `hook_type` \| `tone_preset` \| `visual_style` | item id | `{ name, description? }` |
| `taxonomy.update` | same | item id | `{ name, changes: { name?: {from,to}, description?: {from,to} } }` |
| `taxonomy.delete` | same | item id | `{ name }` |

`user.update` is emitted **only** when `email` or `status` actually changes. Pure `fullName` edits are not audited (too noisy, not security-relevant). `isSuperadmin` flips emit `superadmin_grant` / `superadmin_revoke` instead of being folded into `user.update`.

### Group B — Workspace-scoped (`workspaceId` set)

| Action | `entityType` | `entityId` | `metadata` |
|---|---|---|---|
| `workspace.member_role_change` | `workspace_member` | target user id | `{ targetEmail, fromRole, toRole }` |
| `workspace.member_remove` | `workspace_member` | target user id | `{ targetEmail, priorRole }` |
| `workspace.invitation_create` | `invitation` | invitation id | `{ invitedEmail, role, expiresAt }` |
| `workspace.invitation_revoke` | `invitation` | invitation id | `{ invitedEmail }` |
| `workspace.invitation_accept` | `workspace_member` | accepting user id | `{ invitationId, role }` — emitted on accept; the acting user is the invitee |
| `workspace.ai_settings_update` | `workspace_ai_settings` | workspace id | `{ changedFields: [string] }` |
| `project.create` | `project` | project id | `{ name, slug }` |
| `project.archive` | `project` | project id | `{ name }` |
| `project.restore` | `project` | project id | `{ name }` |
| `project.member_add` | `project_member` | target user id | `{ projectId, projectName, targetEmail, isApprover, menuAccess }` |
| `project.member_remove` | `project_member` | target user id | `{ projectId, projectName, targetEmail }` |
| `project.member_update` | `project_member` | target user id | `{ projectId, projectName, targetEmail, changes: { isApprover?: {from,to}, menuAccess?: {from,to} } }` |
| `trash.permanent_delete` | `brand` \| `product` \| `topic` \| `content` | entity id | `{ name, brandId?, productId?, topicId? }` |

Trash hard-deletes triggered by `ArchiveSweepJob` are **not** audited (no acting user).

## Conventions

1. **Action naming** — dotted, lowercase, `<entityType>.<verb>`. Treat the strings as a public contract; future filtering UI will rely on them.
2. **Acting user** — `userId` on the row is always the user who performed the action. Targets go in `metadata`.
3. **Target identification** — every action with a target user carries `targetEmail` so the row is readable after the target is deleted.
4. **Diff shape** — uniform across all updates: `changes: { fieldName: { from, to } }`. Only fields that actually changed appear.
5. **Lifecycle pairs are split** — `grant`/`revoke`, `archive`/`restore` are distinct actions, not one action with a flag. Easier to filter and count.
6. **Sensitive values masked** — `workspace.ai_settings_update` records field **names only** in `changedFields`. API keys, secrets, tokens never enter metadata. This is a hard rule, enforced at the call site.

## Implementation Surface

Files touched:

- `backend/prisma/schema.prisma` — make `workspaceId` nullable on `AuditLog`.
- `backend/src/services/audit.service.ts` — new (this design).
- `backend/src/interfaces/services/audit.service.interface.ts` — new.
- `backend/src/index.ts` — instantiate `AuditService`, inject into the services and routes below.
- `backend/src/services/admin.service.ts` — emit Group A `user.*` actions.
- `backend/src/services/taxonomy.service.ts` — emit `taxonomy.*` actions (also confirm whether the admin taxonomy routes call this service or `AdminService.createTaxonomyItem`; collapse to one path during implementation).
- `backend/src/services/workspace.service.ts` — emit `workspace.member_role_change`, `workspace.member_remove`, `workspace.invitation_create`, `workspace.invitation_revoke`, `workspace.invitation_accept`, and `workspace.ai_settings_update`. All the relevant methods (`invite`, `acceptInvitation`, `removeMember`, `updateInvitation`, etc.) already exist here.
- `backend/src/routes/project.route.ts` — emit `project.*` actions. **Exception to the service-level rule**: project lifecycle + membership currently lives in the route handlers, not a `ProjectService`. Extracting one is out of scope for this work. Audit calls go in the route handlers, with a TODO to move them into a service if/when one is extracted.
- `backend/src/routes/trash.route.ts` — emit `trash.permanent_delete`. **Same exception**: the manual hard-delete dispatches into per-entity service methods (`brandService.permanentDelete`, etc.), but those methods are also called from non-trash code paths. Emitting at the trash route ensures we audit only the human-driven Trash UI action, not internal cascades.
- Routes — pass `actingUserId` from `c.get("userId")` into the service methods that emit audit events. Most already do; the rest are a small additive change.

Files **not** touched:

- `backend/src/routes/admin.route.ts` — already passes `userId` via context middleware; the audit-write happens inside `AdminService`.
- `backend/src/services/trash.service.ts` — only owns the `list` query; hard-delete dispatch lives in the route.
- `backend/src/services/brand.service.ts`, `product.service.ts`, `topic.service.ts`, `library.service.ts` — `permanentDelete` methods are called from multiple paths; auditing them would over-capture. Audit at the trash route instead.
- `frontend/src/pages/AdminPage.tsx` — current table renders fine. Verify it handles `workspaceId: null` gracefully during implementation; add a fallback only if it doesn't.
- `ArchiveSweepJob` — out of scope.

## Testing

- **Unit tests per service**: each emit point gets a test that asserts `auditService.log` was called with the expected `{ action, entityType, entityId, metadata }`. Use the existing in-memory mock-repository pattern; mock `IAuditService` with a spy.
- **Soft-fail test**: simulate `prisma.auditLog.create` throwing — assert the user-facing operation still succeeds and a Winston error was logged.
- **Diff correctness test**: for `user.update` and `*.member_update`, assert metadata `changes` only includes fields that actually changed.
- **Mask test**: for `workspace.ai_settings_update`, assert `changedFields` contains field names and that no metadata key holds an API key value.
- No DB-level integration test — service-level unit tests are the level of rigor used elsewhere in the repo.

## Open Questions

None. All four design questions resolved during brainstorming:

- **Schema**: `workspaceId` nullable.
- **Trash**: audit manual `permanent_delete` only; sweeper out of scope.
- **Metadata**: targeted diff + API key masking.
- **Write semantics**: after-success, awaited, soft-fail; called from service layer.

## Rollout

1. Schema change + `bunx prisma db push`.
2. New service + composition-root wiring.
3. Instrument call sites (one PR or split by group — implementer's call).
4. Verify in dev: perform each audited action, confirm row appears in `/admin` Audit Logs tab.
5. Ship.

No feature flag — the table is currently empty and any audit row is strictly additive. Existing reads continue to work unchanged.
