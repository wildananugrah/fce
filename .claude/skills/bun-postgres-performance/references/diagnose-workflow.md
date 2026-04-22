# Diagnose Workflow

The full measure → locate → fix → re-measure loop for Bun + Postgres performance work.

## Step 1 — Establish a baseline

Before changing anything, capture these numbers. Without them, you cannot prove your fix worked.

### HTTP baseline

Pick a realistic concurrency level for the endpoint (if unknown, start at 50 VUs).

```bash
# k6 — recommended for anything more than a smoke test
bun x k6 run references/scripts/k6-baseline.js

# oha — fast single-command sanity check
bun x oha -n 10000 -c 50 --latency-correction http://localhost:3000/api/endpoint

# autocannon — Node-native, OK for basic
bun x autocannon -c 50 -d 30 http://localhost:3000/api/endpoint
```

Record: p50, p95, p99, requests/sec, error rate.

### Postgres baseline

Enable once per database:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT pg_stat_statements_reset();  -- start fresh before the load test
```

Run load test, then:

```sql
SELECT
  substring(query, 1, 100) AS query_snippet,
  calls,
  round(total_exec_time::numeric, 1) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 1) AS pct_of_total
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

The top 5 queries by `total_ms` are almost always where the wins are.

### Request breakdown

Add timing at each boundary to know where time is going:

```typescript
// Hono middleware example
app.use('*', async (c, next) => {
  const t0 = performance.now();
  await next();
  const total = performance.now() - t0;
  const dbTime = c.get('dbTime') ?? 0;
  console.log(`${c.req.method} ${c.req.path} total=${total.toFixed(1)}ms db=${dbTime.toFixed(1)}ms app=${(total - dbTime).toFixed(1)}ms`);
});
```

If DB time is >50% of total, go to Postgres. Otherwise, app layer.

## Step 2 — Locate the bottleneck

### Postgres side

Run the diagnostic queries in `scripts/pg-diagnostic.sql`. The key ones:

- **Top queries by total time** — which queries to focus on
- **Missing index candidates** — tables with high seq_scan count
- **Cache hit ratio** — should be >99% for OLTP; if lower, the working set exceeds `shared_buffers`
- **Active long-running queries** — catch blockers in real time
- **Lock waits** — catch transactions holding things up

For each suspect query, run `EXPLAIN (ANALYZE, BUFFERS)`:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ...;
```

What to look for:
- `Seq Scan` on a table with >10K rows where a filter applies → missing index
- `Rows Removed by Filter: <big number>` → index is there but not selective enough
- `Nested Loop` with a big outer side and a `Seq Scan` inner → missing join index
- Execution time >> planning time → the plan is the bottleneck, not the optimizer
- `Buffers: shared hit=X read=Y` where `read` is large → cold cache; re-run and compare

### App side

If DB isn't the bottleneck, profile the Bun process:

```bash
# CPU profile — opens a flamegraph-like view
bun --inspect-brk src/server.ts

# Or grab a heap snapshot
bun --heap-snapshot-on-exit src/server.ts
```

Also check:
- Is the event loop blocked? Add `blocked-at`-style logging on long async gaps
- Are requests queueing because the connection pool is exhausted? Log pool size/active count
- Is a single endpoint generating massive JSON payloads? Check response body size

## Step 3 — Fix, one change at a time

Apply **one** change per iteration. If you apply three fixes and p95 drops, you don't know which one worked — and one of them might be a regression hidden by the other two.

Typical first fixes by frequency:

1. Add the missing index (see `postgres-indexing.md`)
2. Fix the N+1 (see `query-patterns.md`)
3. Adjust pool size (see `drivers-and-pooling.md`)
4. Add a cache (see `caching.md`)

## Step 4 — Re-measure

Run **the exact same load test** you ran for the baseline. Compare:

| Metric | Before | After | Change |
|---|---|---|---|
| p50 latency | | | |
| p95 latency | | | |
| p99 latency | | | |
| req/sec | | | |
| error rate | | | |
| Top query total_ms | | | |

If the numbers moved in the wrong direction, revert. Yes, even if the fix "should" have worked.

## Ongoing monitoring

Once the system is in a good place, keep these in place:

- `pg_stat_statements` enabled permanently with a dashboard on top-N queries
- Slow query log: `log_min_duration_statement = 500` (logs queries slower than 500ms)
- Application metrics (Prometheus / OpenTelemetry) with histograms on endpoint latency
- Alerts on p95 > SLO, pool utilization > 80%, DB CPU > 70%

## When to use EXPLAIN vs EXPLAIN ANALYZE

- `EXPLAIN` — shows the estimated plan without running the query. Safe, instant.
- `EXPLAIN ANALYZE` — actually runs the query. Shows real timing. **Writes execute**, so wrap DML in a transaction and roll back:

```sql
BEGIN;
EXPLAIN (ANALYZE, BUFFERS) UPDATE ...;
ROLLBACK;
```

## Reading EXPLAIN ANALYZE output

Skim from the innermost (most indented) node outward. Each line shows:

```
-> Seq Scan on posts  (cost=0.00..1834.00 rows=100000 width=48)
                      (actual time=0.015..45.231 rows=99823 loops=1)
```

Key fields:
- `cost` — planner's estimate (arbitrary units)
- `rows` (planned) vs `rows` (actual) — if these differ by 10x+, stats are stale → `ANALYZE` the table
- `actual time` — the real wall clock, in ms
- `loops` — how many times this node ran (watch for nested loops)
