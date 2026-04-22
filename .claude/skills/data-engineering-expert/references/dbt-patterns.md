# dbt Patterns

Read this for dbt-specific modeling, testing, incremental strategies, snapshots, and macros.

## Project layout

```
analytics/
├── dbt_project.yml
├── profiles.yml          (usually in ~/.dbt/)
├── packages.yml
├── models/
│   ├── staging/
│   │   └── stripe/
│   │       ├── _stripe__sources.yml
│   │       ├── _stripe__models.yml
│   │       ├── stg_stripe__charges.sql
│   │       └── stg_stripe__customers.sql
│   ├── intermediate/
│   │   └── int_orders_enriched.sql
│   └── marts/
│       ├── core/
│       │   ├── fct_orders.sql
│       │   ├── dim_customers.sql
│       │   └── _core__models.yml
│       └── finance/
│           └── fct_revenue_daily.sql
├── snapshots/
│   └── customer_snapshot.sql
├── tests/
│   └── assert_revenue_reconciles.sql
├── macros/
│   └── cents_to_dollars.sql
└── seeds/
    └── country_codes.csv
```

**Layer conventions:**
- **Staging** — one model per source table. Renames, type casts, light cleaning. Materialized as views (free). Prefix `stg_<source>__<table>`.
- **Intermediate** — reusable joins and calculations referenced by multiple marts. Prefix `int_`. Often ephemeral or view.
- **Marts** — business-facing tables. `fct_` for facts, `dim_` for dimensions. Materialized as tables or incremental.

---

## Materializations

| Type | When to use |
|---|---|
| `view` | Staging layer; small/free; always fresh. |
| `table` | Marts that can be fully rebuilt cheaply. Up to ~10s of GB. |
| `incremental` | Large append-heavy marts; only process new rows. |
| `ephemeral` | CTE-only; never materialized. Rare — debugging is hard. |
| `materialized_view` | Snowflake Dynamic Tables, BigQuery/Redshift MVs; declarative freshness. |
| `snapshot` | SCD Type 2 history capture. |

---

## Incremental models — the three strategies

```sql
{{ config(
    materialized='incremental',
    unique_key='order_id',
    incremental_strategy='merge',       -- 'append', 'merge', 'delete+insert', 'insert_overwrite'
    on_schema_change='append_new_columns'
) }}
```

- **`append`** — fastest. No dedup. Use for truly append-only sources (event logs).
- **`merge`** — upsert on `unique_key`. Default on Snowflake, BigQuery, Databricks. Safe.
- **`delete+insert`** — delete matching `unique_key` rows, then insert. Postgres/Redshift default.
- **`insert_overwrite`** — replace whole partitions. Best for partitioned lakehouse tables (BigQuery, Spark, Iceberg).

**Standard incremental pattern with lookback:**

```sql
{{ config(
    materialized='incremental',
    unique_key='order_id',
    incremental_strategy='merge'
) }}

SELECT *
FROM {{ ref('stg_orders') }}

{% if is_incremental() %}
  WHERE updated_at >= (
    SELECT COALESCE(MAX(updated_at), '1900-01-01') FROM {{ this }}
  ) - INTERVAL '3 days'
{% endif %}
```

**`insert_overwrite` with partitions (BigQuery):**

```sql
{{ config(
    materialized='incremental',
    incremental_strategy='insert_overwrite',
    partition_by={'field': 'order_date', 'data_type': 'date'},
    partitions=['date(current_date - 1)', 'date(current_date)']  -- or dynamic
) }}
```

Best for correctness — entire partition is rewritten, so late data and re-processing both work.

---

## Tests — the four levels

### 1. Generic schema tests

```yaml
# _core__models.yml
version: 2
models:
  - name: fct_orders
    columns:
      - name: order_id
        tests: [unique, not_null]
      - name: customer_id
        tests:
          - not_null
          - relationships:
              to: ref('dim_customers')
              field: customer_id
      - name: status
        tests:
          - accepted_values:
              values: ['pending', 'paid', 'shipped', 'refunded']
      - name: net_amount
        tests:
          - dbt_utils.expression_is_true:
              expression: ">= 0"
```

### 2. Singular tests (custom SQL)

```sql
-- tests/assert_revenue_reconciles.sql
SELECT order_date, SUM(net_amount) AS total
FROM {{ ref('fct_orders') }}
GROUP BY 1
HAVING ABS(SUM(net_amount) - (
  SELECT SUM(net_amount) FROM {{ ref('stg_orders') }} WHERE order_date = fct_orders.order_date
)) > 0.01
```

Any row returned = test failure.

### 3. Source freshness

```yaml
sources:
  - name: raw
    tables:
      - name: orders
        loaded_at_field: updated_at
        freshness:
          warn_after: {count: 6, period: hour}
          error_after: {count: 12, period: hour}
```

Run: `dbt source freshness`. Wire alerts to the on-call.

### 4. Packages that extend testing

- **`dbt_utils`** — expression tests, equal_rowcount, date spine.
- **`dbt_expectations`** — Great Expectations–style richer tests.
- **`elementary`** — anomaly detection, volume / freshness monitoring, UI.

---

## Snapshots (SCD Type 2)

```sql
-- snapshots/customer_snapshot.sql
{% snapshot customer_snapshot %}
  {{ config(
      target_schema='snapshots',
      unique_key='customer_id',
      strategy='timestamp',
      updated_at='updated_at',
      invalidate_hard_deletes=True
  ) }}
  SELECT customer_id, name, country, segment, updated_at
  FROM {{ source('raw', 'customers') }}
{% endsnapshot %}
```

Runs via `dbt snapshot`. Output has `dbt_valid_from`, `dbt_valid_to`, `dbt_scd_id`. `dbt_valid_to IS NULL` → current version.

Use `strategy='check'` (diff on columns) if you don't trust the source `updated_at`.

---

## Macros — DRY, not clever

```sql
-- macros/cents_to_dollars.sql
{% macro cents_to_dollars(column_name, precision=2) %}
  ROUND( ({{ column_name }} / 100)::numeric, {{ precision }} )
{% endmacro %}

-- usage
SELECT order_id, {{ cents_to_dollars('amount_cents') }} AS amount_usd
FROM {{ ref('stg_orders') }}
```

**Guidelines:**
- Macros are for patterns you repeat 3+ times.
- Keep them readable. dbt isn't a general-purpose programming environment.
- Don't build a macro DSL — future-you (and teammates) will struggle.

---

## Exposures and semantic layer

**Exposures** document downstream consumers (dashboards, ML models, embedded apps). They show up in dbt docs lineage.

```yaml
exposures:
  - name: revenue_dashboard
    type: dashboard
    url: https://looker.company.com/dashboards/42
    owner:
      name: Finance Team
      email: finance@company.com
    depends_on:
      - ref('fct_orders')
      - ref('dim_customers')
```

**dbt Semantic Layer** (or Cube, LookML) — define metrics once, query from any BI tool. Avoids the "12 dashboards, 12 different revenue numbers" problem.

```yaml
metrics:
  - name: revenue
    label: Revenue
    model: ref('fct_orders')
    calculation_method: sum
    expression: net_amount
    dimensions: [customer_id, order_date, region]
    filters:
      - field: status
        operator: '='
        value: "'paid'"
```

---

## CI / CD for dbt

1. **`dbt build --select state:modified+`** — run only changed models and their downstream. Use `--defer --state` to compare against prod manifest.
2. **Slim CI** — deploy manifest to a bucket on prod merge; PR CI downloads and defers against it.
3. **Environments**: dev (analyst sandbox), CI (ephemeral per-PR schema), staging, prod.
4. **Tests block merge**. Any failure in `dbt test` fails the PR check.
5. **Production runs** via Airflow / Dagster / dbt Cloud. Not by hand.

---

## Performance tips

- **Materialize staging as views**, marts as tables. Don't recompute the world on every query.
- **Cluster / partition** large incremental tables. Use `cluster_by` config on Snowflake, `partition_by` on BigQuery.
- **Limit wide `SELECT *`** — specify columns in staging models. Keeps scan costs down.
- **Use `ref()` always**, never hardcode schema.table. dbt builds the DAG from refs.
- **Profile slow models** with `dbt run --select fct_slow --vars '{compile_only: true}'` and `EXPLAIN`.

---

## Common dbt mistakes

- Writing marts before staging; `stg_` is your abstraction layer against source changes.
- One giant 1500-line model. Break up. The sweet spot is 50–200 lines.
- No tests on PKs. `unique` + `not_null` on every primary key is the minimum.
- Using `ephemeral` everywhere for "cleanliness". Debugging ephemerals is a pain.
- Hardcoding dates. Always `current_date` with `var('run_date', current_date)` for backfill overrides.
- Not separating CI schema per PR — PRs clobber each other.
- Ignoring `on_schema_change` — incremental silently ignores new columns by default.
- Using dbt for operational (low-latency) queries. dbt is for analytics; queries still run on the warehouse.
