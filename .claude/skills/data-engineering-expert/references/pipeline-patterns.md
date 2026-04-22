# Pipeline Patterns

Read this when designing or reviewing ingestion, CDC, backfill, or streaming pipelines.

## 1. Idempotency

Running a pipeline twice must produce the same result as running it once. Without this, retries corrupt your data.

### Keyed upsert (MERGE)

```sql
-- Snowflake / BigQuery / Postgres 15+
MERGE INTO dwh.dim_customer t
USING staging.customer_batch s
  ON t.customer_id = s.customer_id
WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET
  name = s.name,
  country = s.country,
  updated_at = s.updated_at
WHEN NOT MATCHED THEN INSERT (customer_id, name, country, updated_at)
  VALUES (s.customer_id, s.name, s.country, s.updated_at);
```

**Rules:**
- `ON` must match a natural or surrogate unique key.
- `AND s.updated_at > t.updated_at` prevents stale-write overwrites when out-of-order events arrive.
- Never `DELETE WHERE date = today(); INSERT ...` as a pattern — if the job fails between DELETE and INSERT, you've lost data. Use `MERGE` or a swap pattern.

### Swap / table-replace pattern

For full-refresh loads:

```sql
-- Build into a staging table
CREATE OR REPLACE TABLE dwh.fct_orders_new AS SELECT ...;

-- Atomic swap
ALTER TABLE dwh.fct_orders RENAME TO fct_orders_old;
ALTER TABLE dwh.fct_orders_new RENAME TO fct_orders;
DROP TABLE dwh.fct_orders_old;
```

In Iceberg/Delta, `CREATE OR REPLACE TABLE` is atomic — use it.

### Idempotent keys in Kafka / streaming

Attach a deterministic event ID at source (`order_id + updated_at`). Downstream consumers dedupe on that key in a time window (Kafka Streams / Flink supports this natively).

---

## 2. Watermarks and incremental loads

Don't re-scan the source every run. Track where you left off.

```sql
-- Save the max watermark with the load
CREATE TABLE _pipeline_state (
  pipeline_name VARCHAR PRIMARY KEY,
  last_watermark TIMESTAMP,
  updated_at TIMESTAMP
);

-- Incremental extract
SELECT *
FROM source.orders
WHERE updated_at > (
  SELECT last_watermark - INTERVAL '3 days'   -- lookback for late arrivals
  FROM _pipeline_state
  WHERE pipeline_name = 'orders_ingest'
)
  AND updated_at <= CURRENT_TIMESTAMP - INTERVAL '1 minute'  -- avoid in-flight rows
ORDER BY updated_at;

-- After successful load, advance watermark
UPDATE _pipeline_state
SET last_watermark = (SELECT MAX(updated_at) FROM loaded_batch),
    updated_at = CURRENT_TIMESTAMP
WHERE pipeline_name = 'orders_ingest';
```

**Why the lookback window?** Upstream systems often backfill rows with `updated_at` earlier than their actual write time (retries, batch jobs, timezone bugs). A 3-day lookback catches those. Combined with MERGE, re-processing the same rows is harmless.

**Why the "− 1 minute" ceiling?** Prevents partial reads of rows being written at extract time.

---

## 3. CDC (Change Data Capture)

### Log-based CDC (preferred)

Reads the database's write-ahead log — captures every INSERT, UPDATE, DELETE with before/after images.

- **Debezium** → Kafka → warehouse consumer. Powerful, operationally heavy.
- **Fivetran / Airbyte / Estuary Flow / Stitch** — managed, connector per source.
- **AWS DMS** — for AWS-native Postgres/MySQL → Redshift / S3.
- **Google Datastream** — GCP equivalent.
- **Snowflake Native Apps** / **BigQuery Datastream** — warehouse-native CDC now exists for common sources.

**Postgres setup (logical replication):**
```sql
-- On source
ALTER SYSTEM SET wal_level = 'logical';
SELECT pg_create_logical_replication_slot('debezium_slot', 'pgoutput');
CREATE PUBLICATION dbz_pub FOR TABLE orders, customers, order_items;
```

### Handling DELETEs

CDC events include deletes — you must handle them.

Two common patterns in the warehouse:
1. **Soft delete**: flip an `is_deleted` column. Downstream models filter `WHERE NOT is_deleted`.
2. **Hard delete**: physically remove the row. Simpler queries, but you lose history.

Prefer soft delete for analytical systems — history is valuable.

### Trigger-based or timestamp-based CDC

Use only when log-based isn't available. Limitations:
- Misses hard deletes (no trigger fires).
- Sensitive to clock skew.
- Can miss sub-second updates.

---

## 4. Backfill

Every incremental pipeline must have a documented backfill procedure. You *will* need it.

**Good backfill design:**
1. Pipeline accepts a `start_date` and `end_date` parameter.
2. Processing is idempotent (MERGE on natural key).
3. Backfills run on a separate, isolated compute (so they don't starve daily jobs).
4. Backfills run in chunks (one day at a time, parallelizable).

```python
# Dagster example
@asset(partitions_def=DailyPartitionsDefinition(start_date="2024-01-01"))
def fct_orders(context):
    date = context.partition_key
    df = extract_orders(start=date, end=f"{date} 23:59:59")
    upsert(df, target="dwh.fct_orders", key="order_id")
```

With asset-partitioned orchestration (Dagster, Airflow with DataIntervalSensor), backfilling a date range is a single CLI command.

---

## 5. Late-arriving data

Data arrives after its business date. Your pipeline must accommodate this without full refreshes.

**Patterns:**
- **Lookback window** — process last N days every run, rely on MERGE idempotency.
- **Partition by business date, not load date** — so late data lands in the correct partition (and dbt incremental `unique_key` catches updates).
- **Reconciliation job** — nightly full-range comparison against source; alert if a day's counts drift > N%.

**Warning**: monthly / quarterly reports built on "the data as it was on close" may require versioned snapshots, not just the current state. Use dbt snapshots or period-end materializations.

---

## 6. Schema drift

Sources change. Columns appear, disappear, change type.

**Strategies:**
- **Alert but don't crash** — log unknown columns to a drift table, continue loading known columns.
- **JSON variant columns** — ingest the raw JSON into a `VARIANT` / `JSON` / `SUPER` column, flatten known fields in dbt. New fields are latent but available.
- **Schema registry** (Avro + Confluent Schema Registry for Kafka) — enforces compatibility at producer.
- **Data contracts** — producer and consumer agree on schema in Git; CI blocks incompatible changes.

dbt `on_schema_change`:
- `ignore` — silently drop new columns (dangerous).
- `fail` — hard stop (safe but noisy).
- `append_new_columns` — adds new columns to target (additive-safe).
- `sync_all_columns` — add AND drop (use only for non-breaking teams).

---

## 7. Streaming patterns

**When streaming is worth the complexity:**
- Fraud detection, real-time personalization, trading, alerting, operational dashboards where minutes matter.
- Not: hourly reports, BI dashboards, nightly reconciliation.

**Core concepts:**
- **Exactly-once semantics** — Kafka + Flink/ksqlDB provide this with idempotent producers + transactional consumers. You almost never get it from DIY code.
- **Event time vs processing time** — order by `event_time` for correctness; `processing_time` is simpler but wrong when events are out of order.
- **Watermarks in stream processing** — declare "no events older than X will arrive" so windowed aggregations can emit.
- **State stores** — Flink/Kafka Streams hold aggregation state on disk; size accordingly.

**Simpler streaming alternatives:**
- **Materialize** / **RisingWave** — SQL-based streaming DB. Incremental view maintenance. Much simpler than Flink.
- **Snowflake Dynamic Tables** — declarative freshness ("at most 1 minute stale"), warehouse handles the rest.
- **ClickHouse Materialized Views** — continuous aggregation on insert.

Prefer these over Flink unless you need sub-second latency or complex event processing.

---

## 8. Dead-letter queues

Bad rows will arrive. Don't crash the pipeline.

```sql
-- Quarantine pattern
INSERT INTO dwh.orders_quarantine
SELECT raw_json, ERROR_MESSAGE(), CURRENT_TIMESTAMP
FROM staging.orders_raw
WHERE NOT is_valid(raw_json);

INSERT INTO dwh.stg_orders
SELECT parsed_fields(raw_json)
FROM staging.orders_raw
WHERE is_valid(raw_json);
```

Alert on quarantine row counts rising. Periodically review and either fix the source or add tolerant parsing.

---

## 9. Observability per pipeline

For each pipeline, emit:
- **Start / end / duration** — so you can alert on runtime drift.
- **Rows read / written / rejected** — so you can alert on volume anomalies.
- **Watermark advanced to** — so you can tell if freshness is advancing.
- **Errors** — full context, to a log aggregator with PII redacted.

Dagster / Airflow / dbt all emit these with minimal config. Wire them to your log aggregator (Datadog, Grafana, CloudWatch).

---

## 10. Common pipeline failure modes

| Failure | Fix |
|---|---|
| Duplicate rows after retry | Upsert on natural key, not append |
| Missing rows | Lookback window + reconciliation job |
| Pipeline runs forever | Split task, set timeout, profile extract query |
| Memory OOM on transform | Stream / chunk / push transformation to warehouse (ELT) |
| Schema change crashes pipeline | JSON variant column or `append_new_columns` |
| Timezone off-by-one | Store UTC, never local; convert at presentation |
| Can't backfill | Parameterize date, make idempotent, partition by business date |
| Source rate limits | Exponential backoff, bulk endpoints, CDC instead of polling |
| Silent data loss | Row-count reconciliation; alert if variance > threshold |
| PII leaked into warehouse | Mask/tokenize at ingestion; column-level access |
