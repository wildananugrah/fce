# Reference Architectures

Eight concrete architectures for common scenarios. Each includes: the problem it solves, the diagram, the key decisions, SLAs, and the failure modes to watch.

Use these as *starting points*, not prescriptions. Adjust based on the NFRs from section 2 of SKILL.md.

---

## 1. Small-team analytics (starting point)

**Scope**: 1 app, < 100 GB data, < 10 analysts, budget-conscious.

```
┌──────────────┐    nightly     ┌─────────────┐      ┌──────────┐
│  App         │   Fivetran /   │  Snowflake  │ dbt  │  Looker  │
│  Postgres    │──Airbyte──────▶│  (XS WH)    │─────▶│  Studio  │
│  Stripe      │                │             │      │          │
│  HubSpot     │                └─────────────┘      └──────────┘
└──────────────┘

SLA: freshness 24h (next-day), 99% uptime
Owner: 1 data engineer
Stack cost: ~$500-2000/mo
```

**Key decisions**:
- Managed ingestion (Fivetran or Airbyte Cloud) instead of custom connectors.
- dbt for all transformations — no Spark, no Airflow.
- Single warehouse (Snowflake XS or BigQuery) — shared for everything.
- Looker Studio or Metabase for BI (free/cheap tier).

**Skip**: Kafka, streaming, data mesh, multi-region. All premature.

**Watch for**: this architecture works up to ~1 TB and ~50 analysts. At that point, split ETL and BI warehouses, add dedicated orchestration.

---

## 2. Mid-sized company analytics platform

**Scope**: 1–10 apps, 1–10 TB data, 50+ stakeholders, 2–5 data engineers.

```
┌─────────────┐
│  Postgres   │──┐
└─────────────┘  │
┌─────────────┐  │           ┌──────────────┐
│  MySQL      │──┼─ CDC ────▶│              │
└─────────────┘  │           │   Raw zone   │
┌─────────────┐  │           │   (S3/GCS)   │
│  SaaS APIs  │──┼─Airbyte──▶│   Bronze     │
│  (Stripe,   │  │           │              │
│   Salesforce│  │           └──────┬───────┘
│   etc.)     │  │                  │
└─────────────┘  │                  │ hourly COPY
                 │                  ▼
┌─────────────┐  │           ┌──────────────┐     ┌──────────────┐
│  Events     │──┘           │  Snowflake   │ dbt │  Snowflake   │
│  (Segment)  │              │  Bronze / Silver ──│  Gold marts  │
└─────────────┘              │  (ETL WH)    │     │  (BI WH)     │
                             └──────────────┘     └──────┬───────┘
                                    ▲                    │
                                    │                    ▼
                             ┌──────┴───────┐     ┌──────────────┐
                             │  Dagster     │     │  Looker /    │
                             │  (orchest.)  │     │  Tableau     │
                             └──────────────┘     └──────────────┘

Observability: Elementary + DataHub catalog + PagerDuty alerts
SLA: freshness 1h for CDC sources, 6h for SaaS, 99.9% dashboard uptime
Owner: data platform team of 3-5
```

**Key decisions**:
- CDC for internal DBs (Debezium/Fivetran), API-based for SaaS.
- **Separate ETL and BI warehouses** — prevents analyst queries from starving pipeline SLAs.
- S3/GCS bronze is the immutable source of truth; warehouse is rebuildable.
- Dagster over Airflow for better dev experience and asset-oriented thinking (or Airflow if the team prefers).
- Elementary for free-tier observability; upgrade to Monte Carlo/Bigeye when budget allows.

**Watch for**: bronze in S3 grows fast. Set lifecycle policies. Partition by date. Budget alarms on warehouse compute.

---

## 3. Banking / fintech transaction ledger

**Scope**: transactions must never be lost, full audit trail, regulatory reporting, PII everywhere.

```
┌──────────────┐   sync repl.  ┌──────────────┐
│  Core banking│──────────────▶│  Postgres    │
│  Postgres    │               │  read replica│
│  (HA Patroni)│               └──────┬───────┘
└──────────────┘                      │
       │                              │ logical replication
       │ WAL                          ▼
       │                       ┌──────────────┐
       └──────────────────────▶│  Debezium    │
                               │  (Kafka      │
                               │   Connect)   │
                               └──────┬───────┘
                                      │
                                      ▼
                               ┌──────────────┐
                               │  Kafka       │◀── event log, replayable
                               │  (3 brokers, │    retention: 30 days
                               │   multi-AZ)  │    + tiered to S3 (7yr)
                               └──────┬───────┘
                                      │
                ┌─────────────────────┼────────────────────┐
                ▼                     ▼                    ▼
         ┌────────────┐        ┌────────────┐       ┌────────────┐
         │  Sink to   │        │  Fraud     │       │  Reg.      │
         │  Snowflake │        │  detection │       │  reporting │
         │  (Silver/  │        │  (Flink)   │       │  (Spark)   │
         │   Gold)    │        └────────────┘       └────────────┘
         └──────┬─────┘
                │ dbt
                ▼
         ┌────────────┐
         │  BI +      │
         │  auditor   │
         │  views     │
         └────────────┘

SLA: RPO < 1 min for transactions, RTO < 15 min, 99.99% availability
PII: masked at Silver layer; Bronze access restricted to 2 people
Retention: 7 years (regulatory - OJK/BI)
DR: warm standby in second region, quarterly failover drill
Owner: platform team + dedicated compliance liaison
```

**Key decisions**:
- Kafka as source of truth for replay. Tiered to S3 for 7-year retention cheaply.
- Log-based CDC (Debezium) — never miss a DELETE, which trigger-based would.
- Separate fraud and reporting consumers — isolation bulkhead.
- Masking at Bronze → Silver boundary. Bronze is effectively "raw vault" with strict access.
- Multi-AZ Kafka + multi-region warehouse replication. Daily backup to separate AWS account (ransomware protection).
- Row-level security in the warehouse: tellers see only their branch, auditors see all with audit log.
- Immutable audit log (WORM / Object Lock) for all privileged queries.

**Watch for**: schema changes in core banking are the #1 cause of breakage. Enforce data contracts with CI. Any schema change goes through the platform team.

---

## 4. Event-driven / event-sourced platform

**Scope**: microservices emit events, multiple consumers build independent read models.

```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ Orders  │  │ Users   │  │ Payments│  │ Shipping│
│ service │  │ service │  │ service │  │ service │
└────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
     │            │            │            │
     └────────────┴─────┬──────┴────────────┘
                        │ publish domain events
                        ▼
              ┌──────────────────┐
              │      Kafka       │  ← immutable event log
              │  (schema         │    source of truth
              │   registry)      │
              └────────┬─────────┘
                       │
       ┌───────────────┼───────────────┬─────────────────┐
       ▼               ▼               ▼                 ▼
┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌───────────────┐
│  Analytics  │ │  Search     │ │  Notification│ │  Real-time    │
│  read model │ │  index      │ │  worker      │ │  dashboard    │
│  (Snowflake)│ │  (ES/OS)    │ │  (consumer)  │ │  (Materialize)│
└─────────────┘ └─────────────┘ └──────────────┘ └───────────────┘

Each consumer: own offset, own schema evolution, own failure domain
New consumer = new subscription, replay from earliest
```

**Key decisions**:
- Events are the **product** of services, not a side effect. Schema registry enforces compatibility.
- Consumers are independent — one slow/down consumer doesn't block others.
- Read models are disposable — rebuild by replay, no migrations needed.
- Event design matters: prefer *fact* events ("OrderPlaced") over command-like ones ("UpdateOrder"). Events should describe what happened, be self-contained, include IDs/versions.

**Watch for**:
- Event schema evolution discipline. Break this and chaos follows.
- Replay times can be long. Tier to object storage for cold replay.
- "Distributed transaction" temptation. Use saga pattern with compensating events instead.

---

## 5. Streaming-first real-time analytics

**Scope**: sub-second freshness for operational dashboards, fraud, alerting.

```
┌──────────┐   events    ┌──────────┐   processed   ┌──────────────┐
│ Producers│────────────▶│  Kafka   │──────────────▶│  Flink /     │
│          │             │          │               │  Materialize │
└──────────┘             └──────────┘               └──────┬───────┘
                                                           │
                                       aggregated / joined │
                                                           ▼
                                                  ┌─────────────────┐
                                                  │  ClickHouse /   │
                                                  │  Pinot / Druid  │
                                                  │  (OLAP serving) │
                                                  └────────┬────────┘
                                                           │
                                    ┌──────────────────────┼─────────────────┐
                                    ▼                      ▼                 ▼
                            ┌──────────────┐      ┌──────────────┐   ┌──────────────┐
                            │  Dashboards  │      │  Alerts /    │   │  Embedded    │
                            │  (Grafana)   │      │  PagerDuty   │   │  analytics   │
                            └──────────────┘      └──────────────┘   └──────────────┘

SLA: p99 end-to-end latency < 5 sec
Availability: 99.9% (streaming components are harder to run than batch)
```

**Key decisions**:
- Pick a real-time OLAP: ClickHouse (most flexible), Druid (proven at scale), Pinot (LinkedIn-scale).
- Materialize or RisingWave as a Flink alternative when SQL-native streaming is enough.
- Retention in Kafka ~7 days hot, tier rest to S3 for replay.
- Separate ingestion from query clusters — they scale differently.

**Watch for**:
- Streaming runs forever; upgrades are hard. Design for in-place schema evolution.
- Late-arriving data + windowed aggregations = correctness surprises. Use event-time semantics + watermarks; accept some lateness; have a batch reconciliation job for truth.
- Costs are continuous, not per-query. Resource tuning matters.

---

## 6. Lakehouse (Iceberg / Delta on object storage)

**Scope**: mixed analytics + ML, multi-TB scale, need open formats / multi-engine access.

```
Sources ─────▶ Landing zone (S3 raw JSON/Parquet)
                      │
                      │ Spark / Trino / ingestion
                      ▼
              ┌─────────────────────────────────┐
              │   Iceberg / Delta tables        │
              │   on S3 (or GCS/ADLS)           │
              │                                 │
              │   ┌─────────┐ ┌──────┐ ┌──────┐ │
              │   │ Bronze  │ │Silver│ │ Gold │ │
              │   └─────────┘ └──────┘ └──────┘ │
              └──────┬──────────────────────────┘
                     │
          ┌──────────┼──────────┬──────────┬──────────┐
          ▼          ▼          ▼          ▼          ▼
      ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌────────┐
      │Trino │   │Spark │   │DuckDB│   │Flink │   │ ML /   │
      │(BI)  │   │(ETL) │   │(ad-  │   │(stream│  │ feature│
      │      │   │      │   │ hoc) │   │ ing) │   │ store) │
      └──────┘   └──────┘   └──────┘   └──────┘   └────────┘

Catalog: Polaris / Unity / Glue
Governance: Unity Catalog / Lake Formation / Open Policy Agent
SLA: batch 1h, ad-hoc < 10s
```

**Key decisions**:
- Open table format (Iceberg or Delta) over raw Parquet — gives ACID, time travel, schema evolution, partition evolution.
- Multi-engine: query planners (Trino, Spark, DuckDB, Flink) all read the same tables.
- Catalog choice is critical — Polaris (Iceberg) or Unity (Databricks) are the mature choices in 2026.
- Governance at the catalog layer (RBAC, column masking) rather than per-engine.

**Watch for**:
- Small-file problem — compact regularly (`OPTIMIZE`).
- Metadata size — Iceberg manifests can grow; vacuum snapshots.
- Cross-region egress when engine and storage are in different regions.

---

## 7. Multi-region / geo-distributed data

**Scope**: global user base, data residency requirements, regional failover.

```
    ┌─ Region A (EU) ─────────────────┐       ┌─ Region B (APAC) ───────────┐
    │                                 │       │                             │
    │  ┌───────┐   ┌─────────┐        │       │  ┌───────┐   ┌─────────┐    │
    │  │ App   │──▶│ Postgres│        │       │  │ App   │──▶│ Postgres│    │
    │  │ (EU)  │   │ (EU)    │        │       │  │ (APAC)│   │ (APAC)  │    │
    │  └───────┘   └────┬────┘        │       │  └───────┘   └────┬────┘    │
    │                   │ CDC         │       │                   │ CDC     │
    │                   ▼             │       │                   ▼         │
    │            ┌──────────────┐     │       │            ┌──────────────┐ │
    │            │  Regional WH │     │       │            │  Regional WH │ │
    │            │  (EU data    │     │       │            │  (APAC data  │ │
    │            │   only)      │     │       │            │   only)      │ │
    │            └──────┬───────┘     │       │            └──────┬───────┘ │
    └───────────────────┼─────────────┘       └───────────────────┼─────────┘
                        │                                         │
                        │   only aggregated /                     │
                        │   anonymized cross-border               │
                        ▼                                         ▼
                    ┌───────────────────────────────────────────────┐
                    │  Global aggregate WH (US)                     │
                    │  (no PII, only anonymized metrics)            │
                    └───────────────────────────────────────────────┘

Residency: PII stays in-region; only aggregates cross borders
DR: each region backs up to another region within its data-residency zone
```

**Key decisions**:
- **Data stays in-region.** EU PII does not leave EU. Indonesian banking data does not leave Indonesia (OJK / BI rules).
- Only anonymized / aggregated data crosses borders for global analytics.
- Each region is a full failure domain — can operate independently.
- Global schema is harmonized, but storage is separate.

**Watch for**:
- Cross-region egress bills. Significant at scale.
- Legal requirements: UU PDP (Indonesia), GDPR (EU), LGPD (Brazil), CCPA (California). Each has its own rules about what "leaving" means.
- Time zone and DST bugs compound at global scale. All timestamps in UTC internally.

---

## 8. IoT / high-throughput ingestion

**Scope**: millions of devices emitting telemetry, seconds-to-minutes latency.

```
  Devices      Gateway        Buffer           Processing       Storage
    │             │             │                  │               │
    │ MQTT/HTTP   │             │                  │               │
    ▼             ▼             ▼                  ▼               ▼
┌─────────┐   ┌─────────┐   ┌──────────┐    ┌─────────────┐   ┌────────────┐
│ Millions│──▶│ MQTT    │──▶│  Kafka   │───▶│  Flink /    │──▶│ Timescale/ │
│ devices │   │ broker  │   │          │    │  Spark      │   │ ClickHouse │
│         │   │ (HiveMQ,│   │(many     │    │  (aggregate │   │ (time-     │
│         │   │  AWS    │   │ partitions)   │   windows)   │   │  series)   │
│         │   │  IoT)   │   │          │    │             │   └────────────┘
└─────────┘   └─────────┘   └──────────┘    └─────────────┘         │
                                 │                                  │ cold
                                 │ tier                             ▼
                                 ▼                            ┌─────────────┐
                          ┌─────────────┐                     │  S3 / GCS   │
                          │  S3 raw     │                     │  Parquet    │
                          │  (7yr)      │                     │  archive    │
                          └─────────────┘                     └─────────────┘

Throughput: 1M events/sec peak
Latency: < 30s dashboard, real-time alerts via Flink
```

**Key decisions**:
- Gateway layer (MQTT broker or IoT platform) bears the concurrency spike; Kafka handles the durability.
- Heavy partitioning in Kafka (keyed by device_id) for horizontal scale.
- Downsample early — 1Hz per-device in ClickHouse, minute averages for dashboards, raw in S3 for ML training only.
- Cold tier aggressively. Last 30 days queryable; older in cheap object storage.

**Watch for**:
- Clock skew on devices. Timestamps are untrustworthy — use server-received time too.
- Spiky loads when devices reconnect after a network blip. Size for reconnect storms, not steady state.
- Schema per device firmware version. Use flexible schemas (Protobuf) with registry.

---

## Picking an architecture

Map from NFRs to pattern:

| If the dominant constraint is... | Start with |
|---|---|
| "We have 3 people and need dashboards" | #1 small-team analytics |
| "We're a real company with 50+ users, many sources" | #2 mid-sized platform |
| "We're regulated and can't lose data" | #3 banking/fintech ledger |
| "We have lots of services and many consumers" | #4 event-driven |
| "We need sub-second analytics" | #5 streaming-first |
| "We need ML + analytics + open formats" | #6 lakehouse |
| "We're global with residency rules" | #7 multi-region |
| "We have millions of devices" | #8 IoT |

Most real companies are a blend: #2 for analytics, #3 for their ledger, #4 for new services, #5 for operational monitoring. That's normal. An architect's job is to decide which parts live under which pattern — not to force one pattern on the whole company.
