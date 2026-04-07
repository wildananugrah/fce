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
