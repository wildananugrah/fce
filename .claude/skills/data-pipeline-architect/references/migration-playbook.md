# Migration Playbook

Concrete patterns for migrating data systems without downtime or data loss.

**Universal rules**:
1. Every migration needs a **rollback plan tested before cutover.**
2. Every migration needs **data reconciliation** — numbers match before, during, after.
3. No migration is done until the **old system is decommissioned**. "We'll clean it up later" = permanent shadow IT.
4. Communicate explicitly and early. Migrations break assumptions across teams.

---

## 1. Strangler fig

Build the new alongside the old. Redirect consumers one by one. Old shrinks to zero over time.

```
       BEFORE                    DURING                         AFTER
   ┌──────────┐            ┌──────────┐  ┌──────────┐      ┌──────────┐
   │          │            │   Old    │  │   New    │      │          │
   │   Old    │            │  system  │  │  system  │      │   New    │
   │  system  │            │          │  │          │      │  system  │
   │          │            │          │  │          │      │          │
   └────┬─────┘            └─────▲────┘  └─────▲────┘      └─────▲────┘
        │                        │             │                  │
        │                        │ legacy      │ new              │
        ▼                        │             │                  ▼
   All consumers              Consumer 1    Consumer 2         All consumers
                              Consumer 2    ◀─ migrated
                              Consumer 3
                                  ▲ not yet
```

**When**: the default for any non-trivial migration. Nearly always the right first choice.

**Process**:
1. Stand up the new system in parallel. Start empty.
2. Backfill the new system from the old (or from source of truth).
3. Implement one consumer on the new system. Compare results against old.
4. When matched, flip that consumer's reads to the new. Monitor.
5. Repeat per consumer.
6. When all consumers use the new system, decommission the old.

**Requirements**:
- Consumers can be redirected individually (feature flags, routing rules).
- Data can be kept in sync on both sides during the transition.

**Risks**:
- Drift between systems during the transition. Mitigate with continuous reconciliation.
- Transition drags on if you don't set a deadline. Always set a decommission date.

---

## 2. Dual-write

Write to both old and new for a period. Compare outputs. Switch reads when confident. Stop writing to old.

```
    App / Producer
         │
         ├──────────▶  Old sink  ──▶ Old consumers (reads here initially)
         │
         └──────────▶  New sink  ──▶ New consumers (dark / shadow initially)

    Phase 1: write both, read old (verify new matches)
    Phase 2: write both, read new (rollback still possible)
    Phase 3: write only new, old is archived
```

**When**: migrating the source of truth — replacing a primary database or event log.

**Process**:
1. Modify producers to write to both old and new. Atomically if possible (transactional outbox pattern); idempotently otherwise.
2. Run reconciliation job: for every record, do old and new match? Alert on drift.
3. When drift is consistently 0 for your defined window (e.g. 2 weeks), move reads to new.
4. After a safety period (another 2-4 weeks reading from new), stop writing to old.
5. Decommission old.

**Risks**:
- Dual-write is *not* atomic by default. A crash between the two writes = inconsistency. Use an outbox pattern:
  ```
  BEGIN
    INSERT INTO main_table ...
    INSERT INTO outbox (event) VALUES (...)
  COMMIT
  -- separate process: read outbox, publish to new system, mark outbox as sent
  ```
- Latency increases — each write now has two paths.

---

## 3. Shadow / dark launch

New pipeline runs in parallel producing outputs nobody consumes. You compare silently until confident.

```
  Source ──┬──▶  Old pipeline  ──▶  Production outputs (consumers read)
           │
           └──▶  New pipeline  ──▶  Shadow outputs (compared, no consumers)

                                   ┌───────────────────┐
                                   │ Reconciliation:   │
                                   │ old vs new daily  │
                                   │ row-level diff    │
                                   └───────────────────┘
```

**When**: re-platforming an existing pipeline (e.g. legacy Spark → dbt+Snowflake). Critical outputs need high confidence before cutover.

**Process**:
1. Duplicate the input stream into both pipelines.
2. New pipeline produces output into a parallel namespace (e.g. `schema_v2.fct_orders`).
3. Run daily diff: row counts, aggregated metrics, sample row-level comparison.
4. Iterate on the new pipeline until the diff is within tolerance (often 0 for well-defined transforms).
5. Cut over consumers (one-by-one or all at once depending on risk).

**Risks**:
- Double the compute cost during the shadow period. Budget for it.
- Diff "tolerance" debates — define up-front what "close enough" means.

---

## 4. Expand-contract (schema migrations)

Add new fields alongside old. Dual-write. Move readers to new. Drop old.

```
Step 1 (EXPAND): Add new_column alongside old_column.
  ALTER TABLE t ADD COLUMN new_column ...;

Step 2 (BACKFILL): Populate new_column for existing rows.
  UPDATE t SET new_column = compute(old_column);

Step 3 (DUAL-WRITE): Producers write both old and new.

Step 4 (SWITCH READS): Consumers read new_column. Monitor.

Step 5 (STOP WRITING OLD): Producers write only new.

Step 6 (CONTRACT): Drop old_column.
  ALTER TABLE t DROP COLUMN old_column;
```

**When**: any non-trivial schema change on a production table with active consumers.

**Key idea**: never do a breaking change in one deploy. The old-and-new period is how you make it rollbackable.

**Applies to**:
- Column renames (never rename in place; add + migrate + drop).
- Type changes (varchar → int → etc).
- Semantic changes (currency units, timezone, enum values).
- Splitting a column (name → first_name + last_name).
- Table splits / merges.

---

## 5. Big-bang cutover

Stop old, start new. Fast, high-risk, no going back (without a pre-provisioned rollback).

**When**: small scope, low risk, team consensus, or when dual-running is impossible (e.g. moving off a SaaS you no longer have a contract with).

**Process**:
1. Freeze writes to old.
2. Final full sync from old to new.
3. Validate counts, run smoke tests on new.
4. Flip DNS / config / feature flags to point at new.
5. Monitor intensely.
6. If broken: rollback (DNS flip back, restore old write path).

**Rollback plan must be rehearsed.** "We'll figure it out if it breaks" is not a plan — it's how outages become data loss.

---

## 6. Blue-green for data

Two full production environments. Switch traffic between them.

```
    ┌──────── Blue (live) ────────────┐      ┌──────── Green (staging) ────────┐
    │                                 │      │                                 │
    │  Ingestion → Transform → Marts  │      │  Ingestion → Transform → Marts  │
    │                                 │      │                                 │
    └──────────────┬──────────────────┘      └──────────────┬──────────────────┘
                   │                                        │
                   ▼                                        ▼
             (readers go here)                         (upgrade / test here)

    To cut over: switch reader config from Blue to Green.
    To roll back: switch back.
```

**When**: high-stakes upgrades (new dbt version, warehouse migration, major schema rework). Data platform cost-of-failure is high.

**Cost**: 2× storage during the transition. Worth it for critical systems.

---

## 7. Migrating between warehouses (e.g. Redshift → Snowflake)

Concrete playbook:

**Phase 1: Stand up the new warehouse**
- Provision Snowflake. Replicate network / SSO / RBAC structure.
- Set up ingestion path (often parallel to existing — Fivetran/Airbyte can write to both).

**Phase 2: Migrate transformations**
- Translate SQL dialect differences (date functions, window syntax, JSON handling).
- Use tools like SqlGlot or dbt's multi-adapter support to ease translation.
- Shadow run: dbt project runs in both warehouses. Compare outputs.

**Phase 3: Migrate consumers**
- Update BI tool connections one dashboard at a time.
- Update downstream systems (reverse ETL, ML pipelines).
- Track cutover progress.

**Phase 4: Decommission**
- Monitor old warehouse for any queries. Chase down stragglers.
- Set a firm decommission date. Disable access. Delete.

**Gotchas**:
- SQL dialect quirks. `DATE_DIFF`, window frame defaults, JSON path syntax, `IFNULL` vs `COALESCE`, implicit casts.
- Identity column behavior differs.
- Permissions model differs.
- Query result ordering (without `ORDER BY`) is undefined — some transformations accidentally depend on old behavior.

---

## 8. Migrating from batch to streaming

Don't. Unless you have a specific real-time requirement that justifies the 10× ops complexity.

If you genuinely need it:
1. Keep batch running.
2. Add streaming for the specific low-latency use case (fraud alerting, dashboard, alerting).
3. Reconcile streaming output with batch output daily. Batch remains source of truth for correctness.
4. Only consider eliminating batch after years of streaming in production and full team ops comfort.

**Anti-pattern**: "We want to be real-time across the whole platform." This almost always ends as a half-finished lambda architecture that costs more and produces less.

---

## 9. Rollback design

Every migration plan must specify:

1. **What triggers a rollback?** (error rate, data drift, latency, business metric)
2. **Who can call it?** (on-call engineer, product, exec?)
3. **How is it executed?** (feature flag, config flip, DNS switch, DB restore)
4. **How long does it take?** (RTO for rollback specifically)
5. **What data is lost?** (RPO implication)

**A rollback you've never tested is not a rollback.** Exercise it in staging. Include it in DR drills.

---

## 10. Migration communication

Migrations break things. Brace the org for it.

- **Announce at plan time**, not at execution time.
- **Named owner** — one person accountable for the migration, even if many execute.
- **Status updates** weekly during migration.
- **Cutover communication** — T-7 days, T-1 day, T-0, T+1 day.
- **"Done" announcement** — including the decommission date.

Data platform migrations fail more often due to communication gaps than technical ones.

---

## 11. Anti-patterns

- **"We'll do the migration during a quiet week."** There is no quiet week. Plan for normal load.
- **"It's a simple copy, shouldn't take long."** Data migrations always surface unknown dependencies. Plan for 2× your estimate.
- **"Let's do it at 2am to minimize impact."** Tired humans make expensive mistakes. Do it in business hours with full team online.
- **"We'll keep the old one running just in case, forever."** Unused systems still cost money, need patching, and confuse newcomers. Decommission.
- **"Schema change went through, should be fine."** Every schema change has a consumer you forgot about. Dual-write always.
- **"The tests passed."** Tests check behavior; migrations need data reconciliation. Row counts, aggregates, samples.
