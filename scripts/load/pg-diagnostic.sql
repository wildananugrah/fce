-- ============================================================
-- pg-diagnostic.sql
-- Ready-to-run diagnostic queries for Bun + Postgres performance.
-- Run individual sections with \i pg-diagnostic.sql or copy-paste.
-- ============================================================


-- ------------------------------------------------------------
-- 1. SETUP (run once per database)
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- Requires: shared_preload_libraries = 'pg_stat_statements' in postgresql.conf
-- Then restart Postgres.


-- ------------------------------------------------------------
-- 2. TOP QUERIES BY TOTAL TIME
-- The queries consuming the most DB time overall.
-- Optimize these first.
-- ------------------------------------------------------------
SELECT
  substring(query, 1, 120) AS query_snippet,
  calls,
  round(total_exec_time::numeric, 1)                              AS total_ms,
  round(mean_exec_time::numeric, 2)                               AS mean_ms,
  round(stddev_exec_time::numeric, 2)                             AS stddev_ms,
  round(max_exec_time::numeric, 2)                                AS max_ms,
  round((100 * total_exec_time /
         NULLIF(sum(total_exec_time) OVER (), 0))::numeric, 1)    AS pct_of_total
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- Reset stats to re-baseline:
-- SELECT pg_stat_statements_reset();


-- ------------------------------------------------------------
-- 3. TABLES THAT MAY BE MISSING AN INDEX
-- High seq_scan_pct on large tables = likely missing index.
-- ------------------------------------------------------------
SELECT
  schemaname || '.' || relname AS table,
  n_live_tup                    AS rows,
  seq_scan,
  idx_scan,
  CASE WHEN seq_scan + idx_scan = 0 THEN 0
       ELSE round(100.0 * seq_scan / (seq_scan + idx_scan), 1)
  END                           AS seq_scan_pct,
  seq_tup_read                  AS total_rows_seq_scanned,
  pg_size_pretty(pg_relation_size(schemaname || '.' || relname)) AS size
FROM pg_stat_user_tables
WHERE n_live_tup > 10000
ORDER BY seq_scan_pct DESC, seq_tup_read DESC
LIMIT 20;


-- ------------------------------------------------------------
-- 4. UNUSED INDEXES
-- Indexes never scanned. Each one slows writes. Consider dropping.
-- (Excludes primary keys and unique constraints you may still need.)
-- ------------------------------------------------------------
SELECT
  schemaname || '.' || relname  AS table,
  indexrelname                  AS index,
  idx_scan                      AS times_scanned,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
JOIN pg_index USING (indexrelid)
WHERE idx_scan = 0
  AND indisunique = false          -- keep unique indexes
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;


-- ------------------------------------------------------------
-- 5. CACHE HIT RATIO
-- Should be >99% for OLTP workloads.
-- Lower = working set exceeds shared_buffers.
-- ------------------------------------------------------------
SELECT
  sum(heap_blks_read)                                  AS disk_reads,
  sum(heap_blks_hit)                                   AS cache_hits,
  round(100.0 * sum(heap_blks_hit) /
        NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS cache_hit_pct
FROM pg_statio_user_tables;


-- ------------------------------------------------------------
-- 6. CURRENTLY ACTIVE QUERIES (LONG-RUNNING / STUCK)
-- Snapshot of what's happening right now.
-- ------------------------------------------------------------
SELECT
  pid,
  usename,
  application_name,
  state,
  wait_event_type,
  wait_event,
  now() - xact_start    AS txn_duration,
  now() - query_start   AS query_duration,
  substring(query, 1, 120) AS query_snippet
FROM pg_stat_activity
WHERE datname = current_database()
  AND state != 'idle'
  AND pid != pg_backend_pid()
ORDER BY query_start;


-- ------------------------------------------------------------
-- 7. LOCK WAITS
-- Queries blocked waiting for another query's lock.
-- ------------------------------------------------------------
SELECT
  blocked.pid         AS blocked_pid,
  blocked.usename     AS blocked_user,
  blocking.pid        AS blocking_pid,
  blocking.usename    AS blocking_user,
  blocked.wait_event_type,
  blocked.wait_event,
  substring(blocked.query, 1, 80)  AS blocked_query,
  substring(blocking.query, 1, 80) AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE blocked.datname = current_database();


-- ------------------------------------------------------------
-- 8. CONNECTION COUNT BY STATE
-- Pool health check — are connections idle in transaction?
-- ------------------------------------------------------------
SELECT
  state,
  count(*)                                  AS conns,
  max(now() - state_change)                 AS longest_in_state
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY conns DESC;

-- 'idle in transaction' connections are especially bad — they hold locks.


-- ------------------------------------------------------------
-- 9. TABLE / INDEX SIZES
-- Find the biggest consumers of disk.
-- ------------------------------------------------------------
SELECT
  schemaname || '.' || relname        AS object,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname || '.' || relname))       AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)
                 - pg_relation_size(schemaname || '.' || relname))     AS indexes_toast_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC
LIMIT 20;


-- ------------------------------------------------------------
-- 10. TABLE BLOAT ESTIMATE
-- Rough check — for precise numbers install pgstattuple.
-- Autovacuum not keeping up = dead tuples accumulating.
-- ------------------------------------------------------------
SELECT
  schemaname || '.' || relname  AS table,
  n_live_tup,
  n_dead_tup,
  round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE n_live_tup > 1000
ORDER BY dead_pct DESC NULLS LAST
LIMIT 20;

-- If dead_pct > 20%, consider: VACUUM (ANALYZE) schema.table;
-- If consistently high, tune autovacuum for that table.


-- ------------------------------------------------------------
-- 11. EXPLAIN TEMPLATE
-- Paste your query in place of the placeholder.
-- ------------------------------------------------------------
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
-- SELECT ... ;

-- For writes, wrap in a rollback:
-- BEGIN;
-- EXPLAIN (ANALYZE, BUFFERS) UPDATE ... ;
-- ROLLBACK;
