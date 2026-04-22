# Postgres Indexing Deep Dive

Indexes are the highest-leverage performance fix in most Postgres workloads. This file covers which index type to use when, with concrete examples.

## B-tree (the default)

Use for: equality, range, sort, most normal lookups.

```sql
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_orders_created_at ON orders (created_at);
```

B-tree indexes support:
- `=`, `<`, `<=`, `>`, `>=`, `BETWEEN`, `IN`
- `LIKE 'foo%'` (prefix only — anchored)
- `ORDER BY` on the indexed column
- `IS NULL` / `IS NOT NULL`

They do NOT accelerate:
- `LIKE '%foo%'` (leading wildcard — use GIN + pg_trgm)
- `col != value` (rarely selective)
- `LOWER(col) = ?` without an expression index

## Composite (multi-column) B-tree

```sql
CREATE INDEX idx_orders_user_status ON orders (user_id, status);
```

**Leftmost prefix rule**: this index helps:
- `WHERE user_id = ?`
- `WHERE user_id = ? AND status = ?`

It does NOT help:
- `WHERE status = ?` alone

Column order matters. The general rule: equality columns first, then range columns, then sort columns.

```sql
-- Good for: WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC
CREATE INDEX idx_orders_user_time ON orders (user_id, created_at DESC);
```

## Partial index

A partial index only contains rows matching a predicate. Smaller, faster, cheaper to maintain.

```sql
-- If only 5% of orders are 'pending' but we query those constantly:
CREATE INDEX idx_orders_pending
  ON orders (created_at)
  WHERE status = 'pending';
```

Postgres will use this index for queries where the predicate matches:

```sql
-- Uses the partial index
SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at;
```

Great for:
- Soft-delete tables (`WHERE deleted_at IS NULL`)
- Active/inactive status flags with heavy skew
- Queue tables (`WHERE processed_at IS NULL`)

## Expression (functional) index

For queries with a function on the column:

```sql
-- Query: SELECT * FROM users WHERE lower(email) = lower($1)
CREATE INDEX idx_users_email_lower ON users (lower(email));

-- Query: SELECT * FROM events WHERE (data->>'type') = 'click'
CREATE INDEX idx_events_type ON events ((data->>'type'));
```

The expression in the `WHERE` must match the index expression **exactly**.

## Covering index (INCLUDE)

Lets an index satisfy a query without a table lookup ("index-only scan"):

```sql
CREATE INDEX idx_orders_user_status_covering
  ON orders (user_id, status)
  INCLUDE (total, created_at);

-- This query never touches the table:
SELECT total, created_at FROM orders WHERE user_id = ? AND status = 'paid';
```

Use when you have a high-frequency read that returns a narrow set of columns.

Caveat: index-only scans require the visibility map to be up to date. If you see `Heap Fetches: <big number>` in EXPLAIN, run `VACUUM` on the table.

## GIN (Generalized Inverted Index)

Use for: arrays, JSONB, full-text search, trigram matching.

### JSONB

```sql
-- Default GIN — supports @>, ?, ?&, ?|
CREATE INDEX idx_products_tags ON products USING gin (tags);
SELECT * FROM products WHERE tags @> '["sale"]';

-- jsonb_path_ops — smaller, faster, but only supports @>
CREATE INDEX idx_products_attrs ON products USING gin (attributes jsonb_path_ops);
SELECT * FROM products WHERE attributes @> '{"color": "red"}';
```

### Full-text search

```sql
CREATE INDEX idx_posts_fts ON posts
  USING gin (to_tsvector('english', title || ' ' || body));

SELECT * FROM posts
WHERE to_tsvector('english', title || ' ' || body) @@ plainto_tsquery('english', 'bun postgres');
```

### Trigram (substring / fuzzy match)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_name_trgm ON users USING gin (name gin_trgm_ops);

-- Now ILIKE '%foo%' uses the index
SELECT * FROM users WHERE name ILIKE '%wild%';
```

## BRIN (Block Range INdex)

Use for: very large tables where values correlate with physical row order (typically append-only time-series).

```sql
CREATE INDEX idx_events_created_at_brin
  ON events USING brin (created_at);
```

Tiny (often <1% of a B-tree's size) and fast to build. Less selective than B-tree, so use only when the correlation is strong.

Good candidates:
- Event logs indexed by timestamp
- Append-only audit tables
- Time-series data

## When to use `CREATE INDEX CONCURRENTLY`

In production, always:

```sql
CREATE INDEX CONCURRENTLY idx_name ON table (column);
```

- Does not block writes during the build
- Takes longer and uses more resources
- Can't be run inside a transaction
- If it fails partway, leaves an `INVALID` index — drop and recreate

## Finding unused indexes

Indexes you never use still slow down every write. Audit them:

```sql
SELECT
  schemaname, relname AS table, indexrelname AS index,
  idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;
```

Drop indexes that are never scanned (excluding primary keys and unique constraints you still want enforced).

## Finding missing index candidates

Tables with high sequential scan ratios on large tables:

```sql
SELECT
  relname AS table,
  seq_scan, seq_tup_read,
  idx_scan, idx_tup_fetch,
  n_live_tup AS rows,
  CASE WHEN seq_scan + idx_scan = 0 THEN 0
       ELSE round(100.0 * seq_scan / (seq_scan + idx_scan), 1)
  END AS seq_scan_pct
FROM pg_stat_user_tables
WHERE n_live_tup > 10000
ORDER BY seq_scan_pct DESC, seq_tup_read DESC
LIMIT 20;
```

High seq_scan_pct on a big table = likely missing an index.

## Index bloat

Heavily updated indexes bloat over time. If an index is much larger than expected:

```sql
REINDEX INDEX CONCURRENTLY idx_name;
```

In Postgres 12+, `REINDEX CONCURRENTLY` doesn't block writes.

## Quick reference: which index for which query

| Query pattern | Index |
|---|---|
| `WHERE email = ?` | B-tree on `(email)` |
| `WHERE status = ? AND user_id = ?` | Composite `(user_id, status)` or `(status, user_id)` depending on cardinality |
| `WHERE deleted_at IS NULL AND ...` | Partial index with `WHERE deleted_at IS NULL` |
| `WHERE lower(email) = ?` | Expression on `(lower(email))` |
| `WHERE name ILIKE '%foo%'` | GIN + pg_trgm |
| `WHERE tags @> '[...]'` (JSONB array) | GIN on tags |
| `WHERE created_at > ?` on huge append-only | BRIN on `created_at` |
| `ORDER BY created_at DESC LIMIT 20` | B-tree on `(created_at DESC)` |
| Join: `ON posts.user_id = users.id` | B-tree on `posts(user_id)` (FK side) |
