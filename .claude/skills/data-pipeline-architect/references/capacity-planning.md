# Capacity Planning

How to size a data platform without guessing, and without over-engineering.

Key principle: **size for 2 years of growth at 3× today's peak**. Anything beyond that is speculation; anything less is an imminent rewrite.

---

## 1. The estimation worksheet

Before sizing, fill in:

| Dimension | Current | 1 year | 2 years | Peak multiplier |
|---|---|---|---|---|
| Events/sec (avg) | | | | |
| Events/sec (peak) | | | | |
| Avg event size (bytes) | | | | |
| Retention (days / years) | | | | |
| Total storage (TB) | | | | |
| Concurrent users | | | | |
| Queries/sec | | | | |
| Avg query scan (GB) | | | | |

If the user can't fill this in, the first deliverable is an instrumentation task to find out — not a design.

---

## 2. Little's law (the one formula)

For any steady-state system:

```
L = λ × W

L = average number of items in the system
λ = average arrival rate (items/sec)
W = average time in system (sec)
```

Worked example: you expect 1000 orders/sec peak, and each takes 200ms to process end-to-end.
```
L = 1000 × 0.2 = 200 in-flight orders
```

You need capacity (threads, partitions, memory) to hold at least 200 concurrent orders at peak. Double it for headroom.

---

## 3. Utilization and wait time (why you don't run at 100%)

Queueing theory result (M/M/1): as utilization ρ → 1, wait time → ∞.

```
Avg wait time W = service_time / (1 - ρ)
```

At ρ = 0.5 (50% utilized), wait = 2× service time.
At ρ = 0.8 (80% utilized), wait = 5× service time.
At ρ = 0.9 (90% utilized), wait = 10× service time.
At ρ = 0.95, wait = 20× service time.

**Rule**: target steady-state utilization of 50–70%. Higher means tail latency explodes at the slightest spike.

This is why "we're only using 30% of the cluster!" is not wasted capacity — it's the buffer that keeps p99 latency sane.

---

## 4. Kafka sizing

**Single-partition throughput** (rough, commodity hardware):
- Producer: 10–50 MB/s sustained per partition (depends on record size, batching, compression).
- Consumer: 20–100 MB/s sustained per partition.

**Rules**:
- `num_partitions ≥ target_throughput_MB_s / 10`. Add headroom.
- Partitions limit consumer parallelism (1 partition = 1 consumer thread max per group).
- Don't over-partition — each partition has overhead (file handles, metadata, leader election). 2000 per broker is a soft ceiling.
- Replication factor 3 across AZs. Acks=all for durability.
- Retention = hot replay window. Beyond that, tier to S3 (Confluent tiered storage, Strimzi+S3, Pulsar native).

**Broker count**:
- 3 minimum (tolerate 1 failure).
- Add brokers when disk is > 70% full, CPU > 60%, or network > 70% sustained.
- Scale CPU for compression; disk for retention; network for throughput.

**Worked example**: 100k events/sec, 1 KB each, 7 days retention.
- Throughput: 100 MB/s sustained → need ~10-20 partitions minimum. Go 32 for headroom and future growth.
- Storage: 100 MB/s × 86400 s/day × 7 days = 60 TB raw. × 3 replicas = 180 TB. Compressed ~60 TB at 3× compression.
- 3 brokers with 20 TB each covers it at ~75% fill. Add a 4th for headroom.

---

## 5. Warehouse sizing (Snowflake / BigQuery / Redshift)

### Snowflake

- Virtual warehouses: X-Small (1 credit/hr) to 6X-Large (512 credits/hr), roughly doubling.
- **Doubles = roughly halves execution time**, up to the point the query can't parallelize further.
- Scale **up** (bigger) for one-off heavy queries.
- Scale **out** (multi-cluster) for concurrency.

**Concurrency rule**: ~8 concurrent queries per warehouse before queuing. Multi-cluster adds more.

**Right-sizing checklist**:
- If most queries finish in < 30s on XS → XS is right, don't upsize.
- If a specific nightly query takes 2h on M → try L (1h) and XL (30min); pick the one where cost × time is lowest.
- Separate warehouses per workload: ETL (sized for overnight batch), BI (sized for concurrency), ad-hoc (smaller, aggressive auto-suspend).

### BigQuery

Serverless — no clusters. You pay:
- **Storage**: ~$0.02/GB/month active, $0.01/GB after 90 days (long-term).
- **Compute**: on-demand ($6.25/TB scanned) or capacity-based (slots, reserved).

**Scan cost control is the whole game**:
- Every query's worst case = full table scan.
- Partition + cluster every large table.
- `SELECT *` on 1 TB table = $6.25. On a widely-used dashboard, that's real money.
- Use `INFORMATION_SCHEMA.JOBS` to find top-scanning queries.

**Slot estimation**:
- 100 slots ≈ XS warehouse equivalent.
- Reserved slots cheaper than on-demand when monthly scan > ~100 TB.

### Redshift

- Nodes have fixed CPU + memory + local storage.
- RA3 separates storage (S3-backed) from compute (node cache). Scale independently.
- Distribution style massively affects performance at scale. Pick DISTKEY carefully; ALL for small dims.

---

## 6. Postgres sizing (OLTP + analytical serving)

**Vertical first**: a modern c7g.12xlarge (48 vCPU, 96 GB RAM) + 10 TB NVMe + tuning = handles a LOT. Most apps never outgrow this.

**Scaling knobs, in order**:
1. **Tune the queries** — 80% of "Postgres is slow" is a missing index or bad plan.
2. **Right-size memory** — `shared_buffers` ~25% of RAM, `effective_cache_size` ~75%.
3. **Connection pooling** (PgBouncer / pgpool). Postgres doesn't love > 200 concurrent connections.
4. **Read replicas** for read-heavy workloads. Watch for replication lag.
5. **Partition** huge tables (pg_partman + native partitioning).
6. **Vertical scale** — cheapest and simplest up to the biggest instance available.
7. **Sharding** — Citus extension, or application-level. This is a big jump; avoid until you must.

**Rules of thumb (modern hardware, tuned)**:
- Single instance: 10k–50k TPS on a well-tuned beefy box.
- OLTP single-row reads: p99 < 1 ms from memory.
- Analytical queries: fine up to ~1 TB, painful past that.

**When to move off**: consistently hitting > 60% CPU at peak; single-query aggregates over > 500 GB; > 20 concurrent analysts. These are signals to add a warehouse, not kill Postgres.

---

## 7. Streaming framework sizing (Flink / Spark Streaming)

- **Flink task slots per TaskManager**: 1 slot per CPU core as a starting point.
- **Parallelism** = sum of slots available; pick per job based on throughput needs.
- **Memory per slot**: includes RocksDB state store. If state is large, allocate 2-8 GB/slot.
- **Checkpoint interval**: balance recovery RPO vs overhead. 1 min for most jobs; 10s for low-RPO.
- **Watermark lag**: budget for late arrivals; 5–30 min is common. Longer = more state.

**Biggest surprise for teams new to Flink**: state grows unboundedly if you're not careful. Window retention, TTL on state, and RocksDB tuning all matter.

---

## 8. Storage tiering and cost

Typical access pattern for analytical data:
- **Last 30 days**: 90% of queries → hot tier (warehouse, ClickHouse, ES).
- **Last 90 days**: 9% → warm (object storage with external tables / query engines).
- **Older**: 1% → cold (S3 IA, Glacier). Queryable but slow/expensive per access.

Typical cost ratios:
- Hot warehouse storage: $20-40/TB/month
- Warm object storage: $10-20/TB/month (S3 Standard)
- Infrequent access: $10/TB/month (S3 IA, Glacier Instant)
- Archive: $1-4/TB/month (Glacier Flexible / Deep Archive)

**Rule**: at > 100 TB total, tiering pays for itself. Lifecycle policies automate it.

---

## 9. Query concurrency budget

Plan for:
- **Dashboard queries** — predictable, cache-friendly. Size by concurrent users × avg queries per session.
- **ETL jobs** — scheduled, predictable, isolate in their own warehouse.
- **Ad-hoc analyst queries** — spiky, harder to bound. Cap with quotas.
- **Embedded analytics** — customer-facing. Must be fast and bounded. Often a dedicated serving DB (ClickHouse/Pinot/Druid) rather than a general warehouse.

Isolation > over-sizing. Three small warehouses for three workloads cost the same as one big one, but don't interfere.

---

## 10. Growth triggers

Define explicit triggers for when to scale up. These go in the capacity plan document.

Example:
- Postgres CPU > 60% at peak for 7 days → add read replica.
- Warehouse queue wait > 30s for 3 days → multi-cluster or scale up.
- Kafka broker disk > 70% → add broker or reduce retention.
- dbt full-run time > 1 hour → convert biggest models to incremental.
- BigQuery monthly scan > 200 TB → buy reserved slots.
- Dashboard p95 latency > 3s for a week → review partitioning/clustering.

**Without triggers, you scale reactively (outage-driven)** — which is always the expensive way.

---

## 11. Worked example: sizing a fintech analytics platform

**Inputs**:
- 10M transactions/day avg, 30M peak, ~500 B/row.
- 50 internal analysts + 200 dashboards + 10 daily ML jobs.
- 2-year retention hot, 7-year regulatory cold.
- Latency SLA: < 1h freshness, p95 dashboard < 5s.
- Current: Postgres prod, nightly export to BigQuery, analysts complaining.

**Sizing**:
- Ingestion: 30M/day / 86400 = 350 rows/sec avg; say 2000/sec peak burst. Debezium CDC easily handles this. Kafka overkill — direct CDC to BigQuery via Datastream or Fivetran fits.
- Storage (hot): 30M × 500 B × 365 × 2 = ~11 TB. Partition by date; cluster by account_id. BigQuery handles trivially.
- Storage (cold): same × 7 = ~40 TB. S3 IA or GCS Coldline, $400–800/month.
- Compute: 50 analysts at moderate usage + 200 dashboards refreshing hourly. Estimate 20 TB scanned/month → ~$125/mo on-demand, or a 500-slot reservation (~$1000/mo) if predictable.
- Concurrency: BigQuery is serverless; no sizing needed. Dashboards cache. ML jobs on their own project.

**Architecture**: #3 (banking ledger) but simplified — skip Kafka, use managed CDC. Snowflake or BigQuery. dbt for transforms. Budget: $2-4k/month infra + ~2 FTE.

**Trigger for re-architecture**: if real-time fraud becomes a requirement, add a streaming layer (#5 pattern) alongside the batch path. Don't preemptively build it.
