# SQL Performance

Read this for query optimization in Postgres, Snowflake, BigQuery, Redshift, Databricks, and ClickHouse.

## The diagnostic sequence

When a query is slow, work through in order:

1. **Read the plan.** `EXPLAIN` (estimate) then `EXPLAIN ANALYZE` (actual). If the engine's estimates wildly differ from actuals, your stats are stale or skewed.
2. **Check filter push-down.** Is the `WHERE` clause landing on partitioned / clustered columns? If not, you're scanning everything.
3. **Check join order and type.** Hash join on a huge-huge pair is expensive; make the smaller side the build side, or use broadcast for small dimensions.
4. **Check aggregation cardinality.** `COUNT(DISTINCT ...)` over billions is a memory hog.
5. **Check materialization of CTEs.** Some engines re-execute CTEs every reference.
6. **Check data skew.** One key carries 90% of rows → one worker does all the work.
7. **Only then** consider more compute / bigger warehouse.

---

## Reading EXPLAIN (Postgres)

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT c.country, SUM(o.net_amount) AS total
FROM orders o JOIN customers c ON o.customer_id = c.customer_id
WHERE o.order_date >= '2024-01-01'
GROUP BY c.country;
```

Key things to look for:
- **Seq Scan vs Index Scan vs Index Only Scan** — full scan means no usable index.
- **Rows estimated vs actual** — off by 10×+ means run `ANALYZE`.
- **Hash Join vs Nested Loop vs Merge Join** — nested loop on millions of rows is a red flag.
- **Buffers: shared hit / read** — `read` means disk I/O; `hit` is cache.
- **Sort Method: external merge Disk** — spilling to disk; increase `work_mem` or reduce rows sorted.

---

## Postgres index design

**B-tree** (default) — equality and range queries on one or more columns.

```sql
-- Equality: WHERE customer_id = ?
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- Range: WHERE order_date BETWEEN ? AND ?
CREATE INDEX idx_orders_date ON orders(order_date);

-- Equality + range (order matters, most selective first on equality side):
CREATE INDEX idx_orders_customer_date ON orders(customer_id, order_date);
-- This supports: WHERE customer_id = ? AND order_date >= ?
-- And:           WHERE customer_id = ?
-- NOT:           WHERE order_date >= ?   (leading column not used)
```

**Partial index** — covers a hot subset.

```sql
CREATE INDEX idx_orders_pending
  ON orders(customer_id)
  WHERE status = 'pending';
```

**Covering index** (INCLUDE) — the query is answered from the index alone.

```sql
CREATE INDEX idx_orders_covering
  ON orders(customer_id, order_date) INCLUDE (net_amount, status);
```

**GIN** — for `jsonb`, arrays, full-text search.

```sql
CREATE INDEX idx_orders_tags_gin ON orders USING GIN(tags);
CREATE INDEX idx_orders_meta_gin ON orders USING GIN(meta_jsonb jsonb_path_ops);
```

**BRIN** — huge tables with naturally ordered data (time-series). Tiny, fast for range scans.

```sql
CREATE INDEX idx_events_time_brin ON events USING BRIN(event_time);
```

**Don't:**
- Index every column. Each index costs on writes and storage.
- Index low-cardinality columns alone (`is_active`). Use as secondary columns in a composite index or a partial index instead.
- Leave unused indexes. `pg_stat_user_indexes.idx_scan = 0` after weeks → drop.
- Forget to `ANALYZE` after big data loads. Without stats, the planner guesses wrong.

### Postgres partitioning

For multi-billion-row tables, partition by date:

```sql
CREATE TABLE events (
  event_id BIGINT,
  event_time TIMESTAMPTZ NOT NULL,
  ...
) PARTITION BY RANGE (event_time);

CREATE TABLE events_2025_01 PARTITION OF events
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

Use `pg_partman` to automate partition creation + retention. Partition pruning activates when queries filter on the partition key.

---

## Warehouse-specific tuning

### Snowflake

- **Clustering keys** — `ALTER TABLE t CLUSTER BY (order_date, customer_id)`. Let auto-clustering do its job; monitor `SYSTEM$CLUSTERING_INFORMATION`.
- **Result cache** — identical queries within 24h hit cache for free. Don't add `CURRENT_TIMESTAMP` to queries just for logging — it defeats caching.
- **Warehouse sizing** — right-size, don't oversize. XS or S handles most dbt runs. Scale up only for massive joins. Scale out (multi-cluster) for high concurrency.
- **Query profile** — use the Snowflake UI profile; look for the step consuming most time / data.
- **Pruning** — aim for `Partitions scanned << Partitions total` in the profile. If not, your filter doesn't align with clustering.

### BigQuery

- **Partition on a `DATE` / `TIMESTAMP` column** — limits bytes scanned, which is what you pay for.
- **Cluster on up to 4 columns** — most-filtered first. BigQuery reorders data within partitions.
- **`SELECT *` is expensive.** Always enumerate columns. Full-table scans on 1 TB table = $5 each time.
- **Approximate aggregates** — `APPROX_COUNT_DISTINCT`, `APPROX_QUANTILES` over billions are orders of magnitude cheaper.
- **Materialized views** for frequent aggregations — BigQuery auto-refreshes.
- **BI Engine** for dashboards — in-memory cache, sub-second queries.
- **`maximum_bytes_billed`** per query/user — prevents accidental $500 queries.

### Redshift

- **Distribution style** — `DISTKEY` on the most-joined column; `DIST ALL` for small dimensions broadcasted everywhere; `EVEN` for no obvious key.
- **Sort keys** — interleaved is rarely worth it; compound sort key on most-filtered column(s).
- **`VACUUM` and `ANALYZE`** — or use auto-vacuum on RA3 / Serverless.
- **Workload Management (WLM)** — separate queues per workload.

### Databricks / Delta

- **Z-ORDER** — multi-dimensional clustering. `OPTIMIZE t ZORDER BY (col1, col2)`.
- **File compaction** — `OPTIMIZE` to coalesce small files (the "small files problem" kills Spark jobs).
- **Liquid clustering** — newer, automatic, replaces partition + Z-order combinations.
- **Photon** engine — turn it on for SQL workloads; significant speedup.

### ClickHouse

- **Primary key** defines the sort order on disk — not uniqueness. Pick the most-filtered columns, low to high cardinality.
- **Projections** — materialized alternative sort orders per table.
- **Materialized views** — continuous aggregation on insert.
- **Avoid JOINs on huge-huge** — denormalize or use dictionaries.

---

## Join strategies

**Broadcast (small side replicated)** — for dimension joins. Automatic in most warehouses when one side is tiny.

**Hash join** — default for most analytical joins.

**Sort-merge join** — when both sides already sorted on join key.

**Nested loop** — only OK when one side has very few rows. On large tables, disaster.

**Rules:**
- Filter **before** joining. `WHERE` pushed into subqueries can dramatically reduce join input.
- Join on the same data type. Implicit casts (`varchar = int`) often prevent index usage.
- Don't join on expressions (`ON LOWER(a.email) = b.email`) — compute a normalized column at load time.

---

## Aggregation patterns

```sql
-- Slow on billions of rows:
SELECT COUNT(DISTINCT user_id) FROM events;

-- Fast, within a few % accuracy:
SELECT APPROX_COUNT_DISTINCT(user_id) FROM events;
-- or Snowflake: HLL(user_id)
-- or ClickHouse: uniq(user_id)
```

For recurring aggregations, **materialize once, query many**:

```sql
-- Build a daily summary table
CREATE TABLE fct_daily_summary AS
SELECT order_date, country, SUM(net_amount) AS revenue, COUNT(*) AS orders
FROM fct_orders
GROUP BY 1, 2;

-- Dashboard queries hit the 10 MB summary, not the 1 TB fact table.
```

Tools: dbt incremental models, Snowflake Dynamic Tables, BigQuery MVs, ClickHouse MVs.

---

## Data skew

One key has 90% of the rows; one worker does all the work while others idle.

**Signs:**
- One stage of a distributed query runs for ages while CPU on other workers is idle.
- Very uneven partition sizes.

**Fixes:**
- **Salt the hot key** — append a random bucket (0..N) to the key; group by key+bucket, then reaggregate.
- **Separate path for hot keys** — identify the top-N skewed keys, union their result with the rest.
- **Broadcast hint** — force broadcast of a dimension even if the optimizer didn't.

---

## Common anti-patterns

| Anti-pattern | Fix |
|---|---|
| `SELECT *` in production | Enumerate columns |
| `WHERE DATE(ts) = '2025-01-01'` | `WHERE ts >= '2025-01-01' AND ts < '2025-01-02'` — preserves index / partition use |
| `WHERE col LIKE '%foo%'` | Full-text index (GIN/pg_trgm); not fixable with B-tree |
| `ORDER BY random() LIMIT 100` | Sample a keyed subset; `TABLESAMPLE`; precomputed random column |
| `OFFSET 1000000 LIMIT 100` | Keyset pagination: `WHERE id > :last_id ORDER BY id LIMIT 100` |
| `COUNT(*)` over whole table | Approximate count from stats, or maintain a counter |
| `IN (huge subquery)` | Rewrite as `EXISTS` or a JOIN; materialize the subquery |
| `DISTINCT` used as dedup band-aid | Find and fix the join that duplicates rows |
| Correlated subquery in SELECT | Rewrite as a LEFT JOIN + GROUP BY |
| Function on indexed column in WHERE | Expression index, or store computed column |
| Wide `UPDATE` without index on WHERE | Index the WHERE columns, or use CTE with ROWID batch |
| Cartesian join (missing ON) | Add the join condition; alert CI on implicit CROSS JOIN |

---

## Quick wins before optimizing

1. **`ANALYZE` / `ANALYZE TABLE`** — refresh statistics. Wrong stats = wrong plan.
2. **Drop unused indexes** — writes get faster.
3. **Add an index** where the plan shows a seq scan on a filtered column. Measure before/after.
4. **Partition** large append tables by date.
5. **Materialize** the 5 dashboards hitting the same 1 TB fact table.
6. **Cache** — warehouse result caches are free money if you keep queries deterministic.

---

## When the query is genuinely as fast as it can be

- Consider a **materialized view** or summary table.
- Consider **caching at the app layer** (Redis, CDN for analytics APIs).
- Consider a **different engine** for this workload (ClickHouse for real-time; DuckDB for single-node; Elasticsearch for full-text).
- Consider **pre-aggregation** at ingestion (write to a rollup table on insert).

Throwing bigger compute at a bad query is the most expensive fix and the one that fails first at scale.
