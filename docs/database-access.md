# Database Access

## Connection Details

| Field    | Value (default) |
| -------- | --------------- |
| Host     | `localhost`     |
| Port     | `5433`          |
| Database | `fce_dashboard` |
| User     | `fce`           |
| Password | `fce_secret`    |

Connection string: `postgresql://fce:fce_secret@localhost:5433/fce_dashboard`

## Start the Database

```bash
docker compose up -d postgres
```

## Access via psql (inside container)

```bash
# If started via docker compose from the project root
docker compose exec postgres psql -U fce -d fce_dashboard

# If the container is running under a different compose project name,
# use docker exec with the actual container name
docker exec -it fce-dashboard-postgres-1 psql -U fce -d fce_dashboard
```

## Common psql Commands

```sql
-- List all tables
\dt

-- Describe a table
\d users

-- Count rows in a table
SELECT COUNT(*) FROM users;

-- List all workspaces
SELECT id, name, slug, status FROM workspaces;

-- List all brands for a workspace
SELECT id, name, slug, status FROM brands WHERE workspace_id = '<workspace-id>';

-- Check workspace members
SELECT u.email, uwr.role
FROM user_workspace_roles uwr
JOIN users u ON u.id = uwr.user_id
WHERE uwr.workspace_id = '<workspace-id>';

-- Exit psql
\q
```

## Access via psql (from host)

Requires `psql` installed locally:

```bash
psql -h localhost -p 5433 -U fce -d fce_dashboard
```

## Access via GUI Tools

Use any PostgreSQL client (pgAdmin, DBeaver, TablePlus, DataGrip) with the connection details above.

## Prisma Studio (Web UI)

```bash
cd backend && bunx prisma studio
```

Opens a browser-based UI at `http://localhost:5555` to browse and edit data.

## Reset Data

```bash
cd backend && bun run scripts/delete-all-data.ts
```

## User Management (CLI)

Scripts in `backend/scripts/` for creating / resetting / promoting users and
running the one-shot migrations that seed new columns on existing data.

All scripts load `.env` from `backend/`, so run them from that directory (the
cheatsheet wrappers below do that for you).

### Create, reset, delete

```bash
cd backend

# Create a user (hashes password with bcrypt). Refuses duplicates.
bun run scripts/create-user.ts <email> <password> [fullName] [--superadmin]

# Reset a password
bun run scripts/reset-password.ts <email> <new-password>
bun run scripts/reset-password.ts <email> --random   # prints a random 16-char password

# Promote / revoke global superadmin
bun run scripts/seed-superadmin.ts <email>
bun run scripts/seed-superadmin.ts <email> --revoke

# Add (or re-set) a user's admin role in a workspace
bun run scripts/fix-workspace-admin.ts <email> <workspace-name-or-id>
```

Deletion is handled via plain SQL because of the `ON DELETE CASCADE` chain —
see the `delete-user` cheatsheet wrapper below.

### One-shot migrations

These are safe to re-run; each checks current state and skips rows that are
already in the target shape.

```bash
# RBAC rollout: creates a "Default" project per workspace, backfills
# Brand.projectId, converts non-admin workspace members to project
# memberships (isApprover=false, menuAccess=all). Existing workspace admins
# are left as-is.
bun run scripts/migrate-rbac.ts [--dry-run]

# Email verification rollout: grandfathers every existing user as
# verified (sets emailVerifiedAt = now() on null rows) so they can still
# log in after the gate is added.
bun run scripts/migrate-email-verification.ts [--dry-run]
```

### Cheatsheet wrappers

All of the above have one-line wrappers in `docs/db-cheatsheet.sh`:

```bash
bash docs/db-cheatsheet.sh add-user <email> <password> [fullName] [--superadmin]
bash docs/db-cheatsheet.sh delete-user <email>                    # confirms before DELETE
bash docs/db-cheatsheet.sh reset-password <email> <new-password>
bash docs/db-cheatsheet.sh reset-password <email> --random
bash docs/db-cheatsheet.sh make-superadmin <email>
bash docs/db-cheatsheet.sh revoke-superadmin <email>

# RBAC inspection
bash docs/db-cheatsheet.sh projects <workspace-id>
bash docs/db-cheatsheet.sh project-members <project-id>
```

Run `bash docs/db-cheatsheet.sh` with no args to list every command.

### Useful SQL for RBAC + auth state

```sql
-- Quick view: every user with verification + superadmin state
SELECT email, full_name, is_superadmin, email_verified_at, created_at
FROM users
ORDER BY created_at DESC;

-- Workspace admins across the org
SELECT u.email, w.name AS workspace, uwr.role
FROM user_workspace_roles uwr
JOIN users u ON u.id = uwr.user_id
JOIN workspaces w ON w.id = uwr.workspace_id
WHERE uwr.role = 'admin'
ORDER BY w.name, u.email;

-- Project memberships for a user
SELECT p.name AS project, w.name AS workspace, m.is_approver, m.menu_access
FROM user_project_memberships m
JOIN projects p ON p.id = m.project_id
JOIN workspaces w ON w.id = p.workspace_id
JOIN users u ON u.id = m.user_id
WHERE u.email = 'user@example.com'
ORDER BY w.name, p.name;

-- Outstanding (unconsumed, unexpired) email-verification tokens
SELECT u.email, t.expires_at, t.created_at
FROM email_verification_tokens t
JOIN users u ON u.id = t.user_id
WHERE t.consumed_at IS NULL
  AND t.expires_at > now()
ORDER BY t.created_at DESC;
```

## Reset Schema

```bash
cd backend && bunx prisma db push --force-reset
```

This drops all tables and recreates them from `prisma/schema.prisma`. Use with caution.

## Table Descriptions

```sql
-- List all tables with row counts
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY relname;

-- Describe a table (columns, types, nullability, defaults)
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'content_topics'
ORDER BY ordinal_position;

-- List indexes for a table
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'content_topics';

-- List foreign keys for a table
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'content_topics';

-- List all tables with column counts
SELECT
  table_name,
  COUNT(*) AS column_count
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;
```

## AI Provider Logs

```sql
-- List recent AI logs (latest 20)
SELECT id, generator, provider, platform, content_type, status, duration_ms, created_at
FROM ai_provider_logs
ORDER BY created_at DESC
LIMIT 20;

-- Logs for a specific user by email (latest 20)
SELECT
  l.id,
  l.generator,
  l.provider,
  l.model,
  l.platform,
  l.content_type,
  l.input_tokens,
  l.output_tokens,
  l.estimated_cost,
  l.status,
  l.created_at,
  l.system_prompt,
  l.response_json,
  l.user_prompt
FROM ai_provider_logs l
JOIN users u ON u.id = l.user_id
WHERE u.email = 'adam@floothink.com'
ORDER BY l.created_at DESC
LIMIT 20;

-- Token usage summary per user
SELECT
  u.email,
  u.full_name,
  COUNT(l.id) AS generation_count,
  SUM(l.input_tokens) AS total_input_tokens,
  SUM(l.output_tokens) AS total_output_tokens,
  SUM(l.input_tokens + l.output_tokens) AS total_tokens,
  ROUND(SUM(l.estimated_cost)::numeric, 4) AS total_cost_usd
FROM ai_provider_logs l
JOIN users u ON u.id = l.user_id
GROUP BY u.id, u.email, u.full_name
ORDER BY total_tokens DESC NULLS LAST;

-- Token usage per user, grouped by generator type
SELECT
  u.email,
  l.generator,
  COUNT(*) AS count,
  SUM(l.input_tokens) AS input_tokens,
  SUM(l.output_tokens) AS output_tokens,
  ROUND(AVG(l.duration_ms)::numeric, 0) AS avg_duration_ms
FROM ai_provider_logs l
JOIN users u ON u.id = l.user_id
WHERE u.email = 'user@example.com'
GROUP BY u.email, l.generator
ORDER BY count DESC;

-- View full prompt for a user's most recent generation
SELECT
  l.generator,
  l.provider,
  l.model,
  LEFT(l.system_prompt, 500) AS system_preview,
  LEFT(l.user_prompt, 1000) AS user_preview,
  l.input_tokens,
  l.output_tokens,
  l.created_at
FROM ai_provider_logs l
JOIN users u ON u.id = l.user_id
WHERE u.email = 'user@example.com'
ORDER BY l.created_at DESC
LIMIT 1;

-- Find generations where product references were injected
SELECT
  u.email,
  l.generator,
  l.created_at,
  LEFT(l.user_prompt, 300) AS prompt_preview
FROM ai_provider_logs l
JOIN users u ON u.id = l.user_id
WHERE l.user_prompt LIKE '%Product reference materials:%'
  AND u.email = 'user@example.com'
ORDER BY l.created_at DESC
LIMIT 10;

-- Filter by generator
SELECT id, generator, provider, status, duration_ms, created_at
FROM ai_provider_logs
WHERE generator = 'content'
ORDER BY created_at DESC
LIMIT 20;

-- View full log detail (prompts + response)
SELECT id, generator, provider, system_prompt, user_prompt, response_json, skill_names, duration_ms, status, error_message
FROM ai_provider_logs
WHERE id = '<log-id>';

-- Logs with errors
SELECT id, generator, provider, error_message, created_at
FROM ai_provider_logs
WHERE status = 'error'
ORDER BY created_at DESC;

-- Which skills were used per generation
SELECT id, generator, skill_names, duration_ms, created_at
FROM ai_provider_logs
WHERE skill_names IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;

-- Stats: count by generator
SELECT generator, COUNT(*) as total, AVG(duration_ms) as avg_duration_ms
FROM ai_provider_logs
GROUP BY generator;

-- Stats: count by provider
SELECT provider, COUNT(*) as total, AVG(duration_ms) as avg_duration_ms
FROM ai_provider_logs
GROUP BY provider;

-- Stats: error rate
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'error') as errors,
  ROUND(COUNT(*) FILTER (WHERE status = 'error')::numeric / COUNT(*)::numeric * 100, 1) as error_pct
FROM ai_provider_logs;
```

## AI Skills

```sql
-- List all skills
SELECT id, slug, name, category, is_system FROM ai_skills ORDER BY category, name;

-- List workspace skill mappings
SELECT wsm.generator, s.name, s.category, wsm.is_active
FROM workspace_skill_mappings wsm
JOIN ai_skills s ON s.id = wsm.skill_id
WHERE wsm.workspace_id = '<workspace-id>'
ORDER BY wsm.generator, s.name;

-- Count skills by category
SELECT category, COUNT(*) FROM ai_skills GROUP BY category ORDER BY category;
```

```sql
-- Find the document
SELECT id, file_name, extraction_status, created_at
FROM brand_documents
WHERE file_name LIKE '%personal_brand%';

-- Check its chunks
SELECT chunk_index, LEFT(content_text, 100) AS preview
FROM document_chunks
WHERE document_id = '1749b214-6f7c-4cf6-bdb4-a39a8a3731dc'
ORDER BY chunk_index
LIMIT 10;

-- Count total chunks
SELECT COUNT(*) FROM document_chunks
WHERE document_id = '1749b214-6f7c-4cf6-bdb4-a39a8a3731dc';

-- In one query
SELECT
  d.file_name,
  d.extraction_status,
  COUNT(c.id) AS chunk_count
FROM brand_documents d
LEFT JOIN document_chunks c ON c.document_id = d.id
WHERE d.brand_id = 'fc05a131-2c6e-4dec-8eb3-249a946d8ad9'
GROUP BY d.id, d.file_name, d.extraction_status;

-- See the most recent generation's prompts
SELECT
  id,
  generator,
  LEFT(system_prompt, 200) AS system_preview,
  LEFT(user_prompt, 500) AS user_preview,
  created_at
FROM ai_provider_logs
ORDER BY created_at DESC
LIMIT 1;

SELECT
  generator,
  LEFT(user_prompt, 1000) AS prompt_preview
FROM ai_provider_logs
ORDER BY created_at DESC
LIMIT 1;


```
