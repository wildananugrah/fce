# Query Patterns

Patterns that show up repeatedly in Bun + Postgres apps, with the efficient version for each driver.

## N+1 — the fix, by driver

### Bun.sql / postgres.js (raw SQL)

```typescript
// ❌ N+1
const users = await sql`SELECT * FROM users WHERE team_id = ${teamId}`;
for (const u of users) {
  u.posts = await sql`SELECT * FROM posts WHERE user_id = ${u.id}`;
}

// ✅ Two round trips
const users = await sql`SELECT * FROM users WHERE team_id = ${teamId}`;
const userIds = users.map(u => u.id);
const posts = await sql`SELECT * FROM posts WHERE user_id = ANY(${userIds})`;
const postsByUser = Map.groupBy(posts, p => p.user_id);
users.forEach(u => u.posts = postsByUser.get(u.id) ?? []);

// ✅ One round trip with json_agg
const users = await sql`
  SELECT u.*,
         COALESCE((SELECT json_agg(p.*) FROM posts p WHERE p.user_id = u.id), '[]') AS posts
  FROM users u
  WHERE u.team_id = ${teamId}
`;
```

### Drizzle

```typescript
// ✅ Relational query — single SQL statement
const result = await db.query.users.findMany({
  where: eq(users.teamId, teamId),
  with: { posts: true },
});
```

Enable the Drizzle logger during dev to see the generated SQL:

```typescript
const db = drizzle(client, { schema, logger: true });
```

### Prisma

```typescript
// ⚠️ Prisma 'include' is convenient but may issue separate queries
const result = await prisma.user.findMany({
  where: { teamId },
  include: { posts: true },
});

// Enable query logging to see what's actually happening:
const prisma = new PrismaClient({ log: ['query'] });

// For complex reads where you need explicit control, use $queryRaw:
const result = await prisma.$queryRaw`
  SELECT u.*, COALESCE(json_agg(p.*) FILTER (WHERE p.id IS NOT NULL), '[]') AS posts
  FROM users u
  LEFT JOIN posts p ON p.user_id = u.id
  WHERE u.team_id = ${teamId}
  GROUP BY u.id
`;
```

## DataLoader pattern (for GraphQL / nested resolvers)

If you're building a GraphQL API or resolver graph, don't re-solve N+1 at every resolver. Use a DataLoader:

```typescript
import DataLoader from 'dataloader';

const postsByUserLoader = new DataLoader<string, Post[]>(async (userIds) => {
  const posts = await sql`SELECT * FROM posts WHERE user_id = ANY(${userIds})`;
  const grouped = Map.groupBy(posts, p => p.user_id);
  return userIds.map(id => grouped.get(id) ?? []);
});

// In each resolver:
const posts = await postsByUserLoader.load(user.id);
// DataLoader batches all .load() calls in the same tick into one SQL query
```

## Pagination

### Offset (bad for deep pages)

```sql
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 10000;
```

Postgres must scan and discard 10000 rows. Gets linearly slower.

### Keyset / cursor (constant time)

```sql
-- First page
SELECT * FROM posts ORDER BY created_at DESC, id DESC LIMIT 20;

-- Next page — use last row's (created_at, id) as cursor
SELECT * FROM posts
WHERE (created_at, id) < ($1, $2)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

The `(col, col) < ($1, $2)` syntax is a row-value comparison — it correctly handles ties on `created_at`.

Return the cursor to the client:

```typescript
const cursor = result.length > 0
  ? { created_at: result.at(-1)!.created_at, id: result.at(-1)!.id }
  : null;
return { items: result, cursor };
```

## Bulk inserts

### postgres.js / Bun.sql

```typescript
// Insert many rows in one round trip
await sql`INSERT INTO events ${sql(rows, 'user_id', 'type', 'payload')}`;

// With ON CONFLICT for upsert
await sql`
  INSERT INTO events ${sql(rows, 'id', 'user_id', 'type')}
  ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type
`;
```

### Drizzle

```typescript
await db.insert(events).values(rows);
await db.insert(events).values(rows).onConflictDoUpdate({ target: events.id, set: { type: sql`excluded.type` } });
```

### Prisma

```typescript
await prisma.event.createMany({ data: rows, skipDuplicates: true });
```

### COPY FROM (for very large batches)

For tens of thousands of rows or more, COPY bypasses the parser entirely. postgres.js supports streaming COPY:

```typescript
import { pipeline } from 'node:stream/promises';
const stream = sql`COPY events (user_id, type, payload) FROM STDIN WITH (FORMAT csv)`.writable();
await pipeline(csvStream, stream);
```

## CTEs — when to use and when to avoid

### Use a CTE when:
- Breaking apart a complex query for readability
- You need to reference the same intermediate result twice (Postgres 12+ inlines single-use CTEs automatically)
- Doing a recursive query (tree/graph traversal)

```sql
-- Readable multi-step query
WITH recent AS (
  SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '7 days'
),
by_user AS (
  SELECT user_id, COUNT(*) AS n FROM recent GROUP BY user_id
)
SELECT u.name, COALESCE(b.n, 0) AS recent_orders
FROM users u LEFT JOIN by_user b ON b.user_id = u.id;
```

### Avoid CTEs when:
- It's just for "pretty formatting" and a subquery would do — subqueries can be optimized differently
- On Postgres <12 where CTEs are always materialized (optimization fence) — rewrite as a subquery

## Window functions — one query instead of several

Common case: "latest record per group":

```sql
-- ✅ One query using DISTINCT ON
SELECT DISTINCT ON (user_id) *
FROM events
ORDER BY user_id, created_at DESC;

-- ✅ Equivalent with window function, when you need the rank
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM events
) t WHERE rn = 1;
```

`DISTINCT ON` is Postgres-specific and often the fastest form.

## LATERAL — top-N per group

"Top 3 most recent posts for each user":

```sql
SELECT u.id, u.name, p.*
FROM users u
CROSS JOIN LATERAL (
  SELECT * FROM posts WHERE user_id = u.id ORDER BY created_at DESC LIMIT 3
) p;
```

This is typically faster than window functions for the top-N pattern because Postgres can stop early per user.

## `EXISTS` vs `IN` vs `JOIN`

- `EXISTS` (correlated subquery) — stops at the first match per outer row; great for "does any ... exist"
- `IN (SELECT ...)` — Postgres usually rewrites to a semi-join; similar to EXISTS
- `JOIN` — returns all matches; can produce duplicates if the inner side has multiple rows

Use `EXISTS` when you only care about "any":

```sql
-- Has this user ever placed an order?
SELECT * FROM users u WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);
```

## Avoid `SELECT *` in hot paths

Wide rows with TOAST-ed columns (large text, JSONB) are expensive to fetch even when you don't use them. Select only what you need:

```typescript
// ❌ Hot endpoint
await sql`SELECT * FROM articles WHERE slug = ${slug}`;

// ✅ 10x smaller payload
await sql`SELECT id, title, excerpt, author_id, published_at FROM articles WHERE slug = ${slug}`;
```

## Query plans worth memorizing

| Plan node | What it means | When it's bad |
|---|---|---|
| Index Scan | Looked up via index | Rarely bad |
| Index Only Scan | Satisfied entirely from index | Great; ideal |
| Bitmap Heap Scan | Combined multiple indexes | Usually fine |
| Seq Scan | Reading whole table | Bad on tables >10K rows with filter |
| Nested Loop | For each outer row, look up inner | Bad with big outer + no inner index |
| Hash Join | Build hash from smaller side | Good for two large sets |
| Merge Join | Both sides pre-sorted | Good if data already sorted |
