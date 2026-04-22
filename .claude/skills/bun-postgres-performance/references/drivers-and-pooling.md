# Drivers and Connection Pooling

Configuration and pool-sizing guidance for each driver used with Bun. Pool sizing is the most commonly misconfigured thing in production systems.

## Pool sizing — the math

Start with this formula per app instance:

```
pool_size = (cores × 2) + effective_spindle_count
```

For a typical app on SSD with 4 vCPUs: start at 10 connections per instance.

Then check the global cap:

```
pool_size_per_instance × instance_count ≤ postgres.max_connections - headroom
```

Leave ~20% headroom for admin, migrations, replicas, monitoring. If Postgres `max_connections = 100` and you have 4 app instances, cap each at 20 and leave 20 for admin.

**Why not bigger?** Each Postgres connection is a heavyweight process (~10MB). Too many connections cause context-switching and lock contention that reduces total throughput.

**Why not smaller?** If pool_size < concurrent_requests, requests queue — waiting on a connection directly adds to p95 latency.

### Signs your pool is the wrong size

| Symptom | Likely cause |
|---|---|
| p95 spikes under load, DB CPU low | Pool too small — queueing |
| DB CPU high, per-query time fine | Pool too large — contention |
| Connection timeout errors | Pool too small OR connections leaking |
| `too many connections for role` | Total instances × pool size exceeds `max_connections` |

## Driver: Bun.sql (native)

Built into Bun 1.2+. Uses `postgres://` URLs.

```typescript
import { SQL } from 'bun';

const sql = new SQL({
  url: process.env.DATABASE_URL,
  max: 10,                  // pool size
  idleTimeout: 30,          // seconds before closing idle connection
  maxLifetime: 3600,        // max connection lifetime in seconds
  connectionTimeout: 10,    // seconds to wait for a connection
});

const users = await sql`SELECT * FROM users WHERE id = ${id}`;
```

Notes:
- Prepared statements are automatic per-connection
- Tagged template literal is parameterized — safe from injection
- Streams large result sets efficiently

## Driver: postgres.js (porsager/postgres)

The most popular Postgres driver in the Bun ecosystem. Same API as Bun.sql.

```typescript
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 30,
  max_lifetime: 60 * 60,
  connect_timeout: 10,
  prepare: true,            // default true; set false for pgBouncer transaction mode
  onnotice: () => {},       // silence NOTICEs in production
  debug: process.env.DEBUG_SQL
    ? (conn, query, params) => console.log(query, params)
    : undefined,
});
```

For bulk inserts / ON CONFLICT, use the helpers:

```typescript
await sql`INSERT INTO users ${sql(rows, 'email', 'name')}`;
await sql`UPDATE users SET ${sql(row, 'name', 'email')} WHERE id = ${id}`;
```

## Driver: Drizzle

Drizzle wraps a lower-level driver (postgres.js, node-postgres, or Bun.sql). Pool settings belong to the underlying driver.

```typescript
import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';

const client = new SQL({
  url: process.env.DATABASE_URL!,
  max: 10,
});
const db = drizzle(client, {
  schema,
  logger: process.env.NODE_ENV !== 'production',
});
```

With postgres.js:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!, { max: 10 });
const db = drizzle(client, { schema });
```

Performance tips:
- Use `db.query.*` (relational) for nested reads — emits a single optimized query
- Use `db.execute(sql\`...\`)` for raw SQL when the query builder is in the way
- Enable `logger: true` in dev to catch N+1 early

## Driver: Prisma

Prisma is heavier than the others but still workable with Bun.

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});
```

Pool size is controlled via the connection string:

```
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=10"
```

Prisma-specific performance notes:
- **Serverless**: always use pgBouncer or Prisma Accelerate. Add `?pgbouncer=true` to the URL to disable Prisma's prepared statements.
- **`include`** often issues multiple queries instead of one join — check the log
- **`$transaction([...])`** batches queries into one round trip — use it
- **`$queryRaw`** for hot-path queries where you want full SQL control; still parameter-safe via tagged template

```typescript
// Batched — one round trip
const [users, orders] = await prisma.$transaction([
  prisma.user.findMany({ where: { teamId } }),
  prisma.order.findMany({ where: { teamId, status: 'paid' } }),
]);
```

## pgBouncer

pgBouncer is a lightweight connection pooler that sits between your app and Postgres. It multiplexes many app connections onto a smaller set of Postgres connections.

### When you need it

- **Serverless / edge**: dozens of short-lived processes each trying to connect → yes
- **Many app instances**: if `instances × pool_size > max_connections` → yes
- **Prisma on any serverless platform**: yes
- **Long-running monolith with controlled pool**: probably no

### Pooling modes

| Mode | Connection reused | Prepared statements | LISTEN/NOTIFY | Use for |
|---|---|---|---|---|
| Session | Per client session | ✅ | ✅ | Normal apps |
| Transaction | Per transaction | ❌ (unless app disables) | ❌ | Serverless, high fan-out |
| Statement | Per statement | ❌ | ❌ | Rarely |

### Configuring drivers for transaction-mode pgBouncer

Transaction mode breaks prepared statements and `SET` commands that outlive a transaction. You must tell your driver:

**postgres.js**:
```typescript
const sql = postgres(url, { prepare: false });
```

**Prisma**: add `?pgbouncer=true` to the URL.

**Drizzle (via postgres.js)**: pass `prepare: false` to the underlying postgres.js client.

**Bun.sql**: as of Bun 1.2+, set `prepareStatements: false` when creating the pool.

### Recommended pgBouncer settings (transaction mode)

```ini
pool_mode = transaction
default_pool_size = 20          # connections per (user, db) to Postgres
max_client_conn = 1000          # how many app connections pgBouncer accepts
reserve_pool_size = 5
reserve_pool_timeout = 3
server_reset_query = DISCARD ALL
```

## Read replicas

For read-heavy workloads, you can route some reads to a replica. Considerations:

- **Replication lag**: a read right after a write on the primary may miss the write. Don't use replicas for "did my create succeed" reads.
- **Driver support**: most drivers don't have built-in read/write splitting. Common pattern is two client instances:
  ```typescript
  const writeDb = postgres(PRIMARY_URL, { max: 10 });
  const readDb = postgres(REPLICA_URL, { max: 20 });
  ```
- Route critical reads (user session, recent writes) to the primary; route heavy analytical reads to the replica.

## Quick diagnostic

Check your current pool state:

```typescript
// postgres.js
console.log({
  total: sql.options.max,
  reserved: sql.reserved?.length ?? 0,
  // See postgres.js docs for more internals
});
```

In Postgres, see who's connected and what they're doing:

```sql
SELECT pid, usename, application_name, state, wait_event_type, wait_event,
       now() - state_change AS state_duration,
       substring(query, 1, 80) AS query
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY state_change;
```
