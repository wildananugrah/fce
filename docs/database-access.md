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

## Reset Schema

```bash
cd backend && bunx prisma db push --force-reset
```

This drops all tables and recreates them from `prisma/schema.prisma`. Use with caution.

## AI Provider Logs

```sql
-- List recent AI logs (latest 20)
SELECT id, generator, provider, platform, content_type, status, duration_ms, created_at
FROM ai_provider_logs
ORDER BY created_at DESC
LIMIT 20;

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
