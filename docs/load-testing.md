# Load testing runbook

Measure how the FCE backend behaves under concurrent user load and find the
practical ceiling before response times degrade or errors spike.

**Tool:** [k6](https://k6.io/) — a single static binary that runs a JS-style
scenario file and reports latency / throughput / error rates.

**Scripts:**
- [`scripts/load/baseline.js`](../scripts/load/baseline.js) — the load test
- [`scripts/load/pg-diagnostic.sql`](../scripts/load/pg-diagnostic.sql) — Postgres diagnostic queries to run during or after the test

---

## 1. One-time setup

### Install k6

```bash
brew install k6
# or: docker run --rm -i grafana/k6 run - < scripts/load/baseline.js
```

### Enable `pg_stat_statements` (optional but strongly recommended)

This gives you per-query timing stats — without it, section 2 of the diagnostic
SQL is a no-op.

In `postgresql.conf` (inside the Postgres container / host):

```
shared_preload_libraries = 'pg_stat_statements'
```

Restart Postgres, then:

```bash
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
```

### Get a test user + workspace

You need a real, verified account. The `create-user.ts` script already creates
pre-verified users:

```bash
cd backend
bun run scripts/create-user.ts loadtest@example.com ChangeMe123 "Load Test"
# Then add them to a workspace as admin so they see real data:
bun run scripts/fix-workspace-admin.ts loadtest@example.com <workspace-name>
```

Grab the workspace ID:

```bash
bash docs/db-cheatsheet.sh workspaces
```

---

## 2. Running the tests

All three scenarios use the same script — only the `SCENARIO` env var changes.
The script logs in once in `setup()`, caches the access token, then every
virtual user hits a weighted mix of read endpoints (dashboard / topics /
library / brands / me) with 1–3 s think time between requests.

### Scenario: smoke

Sanity check. One user for one minute. Use this to verify auth + URLs work
before burning cycles on a bigger run.

```bash
EMAIL=loadtest@example.com \
PASSWORD=ChangeMe123 \
WORKSPACE_ID=<your-workspace-id> \
SCENARIO=smoke \
k6 run scripts/load/baseline.js
```

Pass criteria: `http_req_failed: rate<0.01`, zero errors in the summary.

### Scenario: baseline

Warm up, then hold 50 VUs for 2 minutes. This is your "normal day" reference.

```bash
EMAIL=loadtest@example.com \
PASSWORD=ChangeMe123 \
WORKSPACE_ID=<your-workspace-id> \
SCENARIO=baseline \
k6 run scripts/load/baseline.js
```

Look at the summary p95/p99 for each `ep_*_ms` metric — that's your normal
response time per endpoint. Save this number; re-run after any performance
change to verify you haven't regressed.

### Scenario: ramp

Ramps 10 → 100 → 300 → 500 VUs over ~8 minutes. Use this to find the ceiling.

```bash
EMAIL=loadtest@example.com \
PASSWORD=ChangeMe123 \
WORKSPACE_ID=<your-workspace-id> \
SCENARIO=ramp \
k6 run scripts/load/baseline.js
```

Watch the live k6 output. The **concurrent user ceiling** is the VU count at
the first of these signals:

- `http_req_duration p(95)` crosses **1 s**
- `http_req_failed rate` crosses **1 %**
- Request rate stops scaling with VU count (throughput plateau)

Each VU with the built-in think time represents roughly one active user
clicking around, so "500 VUs held steady for 2 min with p95 < 1 s" means the
app comfortably serves ~500 concurrent active users on the tested shape.

### Overriding the URL

Default `BASE_URL` is `http://localhost:3001`. Point at a remote backend:

```bash
BASE_URL=https://fce.floothink.com \
EMAIL=... PASSWORD=... WORKSPACE_ID=... \
SCENARIO=ramp \
k6 run scripts/load/baseline.js
```

---

## 3. Watching the DB during the test

Open a second terminal and poll the diagnostic queries while k6 is running:

```bash
# Connection health — run this every few seconds during a ramp test:
psql "$DATABASE_URL" -c "
SELECT state, count(*) FROM pg_stat_activity
WHERE datname = current_database() GROUP BY state;
"
```

If you see lots of `idle in transaction` or `active` connections climbing to
the pool limit, you've found a bottleneck.

### Full post-test diagnostic

After a ramp test, run the full suite to see what Postgres struggled with:

```bash
psql "$DATABASE_URL" -f scripts/load/pg-diagnostic.sql | less -S
```

The interesting sections:

| Section | What to look for |
|---|---|
| 2. Top queries by total time | Anything at the top with high `mean_ms` or `pct_of_total` — add indexes or rewrite it |
| 3. Tables missing an index | `seq_scan_pct > 50%` on a table with >10k rows |
| 4. Unused indexes | Safe to drop — they cost writes for nothing |
| 5. Cache hit ratio | Should be >99%. Lower = working set > `shared_buffers` |
| 6. Active queries | Run during the test — shows what's stuck |
| 7. Lock waits | Should normally be empty |
| 8. Connection count by state | Pool exhaustion check |
| 10. Table bloat | `dead_pct > 20%` = autovacuum behind |

Reset stats between test runs for a clean reading:

```bash
psql "$DATABASE_URL" -c "SELECT pg_stat_statements_reset();"
```

---

## 4. Interpreting results

### Read your k6 summary

```
http_req_duration..............: avg=42.1ms  p(95)=180ms  p(99)=420ms
http_req_failed................: 0.02%     3 out of 14021
ep_dashboard_ms................: avg=38.9ms p(95)=160ms
ep_topics_ms...................: avg=55.3ms p(95)=230ms
ep_library_ms..................: avg=89.1ms p(95)=340ms
ep_brands_ms...................: avg=22.0ms p(95)=88ms
ep_me_ms.......................: avg=8.4ms  p(95)=22ms
```

- **Global p(95) < 800 ms** — healthy
- **Any endpoint with much higher p95 than the rest** — that's your bottleneck. Run the diagnostic SQL to find out why.
- **`http_req_failed > 1%`** — you hit a real error. Check backend logs first, then pg_stat_activity.

### Common gotchas

- **Running k6 on the same machine as the backend** skews results — they compete for CPU. For real numbers, run k6 from a different host (another laptop, a cheap VM, GitHub Actions).
- **First run after a DB restart is cold** — caches aren't warm yet. Throw away the first 30 s of a baseline run, or let the warm-up stage do it for you.
- **AI endpoints** are deliberately not tested. They're gated by Anthropic / Gemini rate limits, not your app. If you want to test them, do it separately with 1–5 VUs and compare against provider rate limits.

---

## 5. Typical numbers for a Bun + Prisma 7 backend

On one backend process (no horizontal scaling), a 4-core / 8 GB machine, local
Postgres, no caching layer:

| Endpoint class | Realistic p95 at 50 VUs | Breakpoint |
|---|---:|---:|
| Auth / me / ping | < 50 ms | 1000+ VUs |
| Simple list (brands, products) | 100–200 ms | 500–800 VUs |
| Heavy list (library with joins) | 200–500 ms | 200–400 VUs |
| Dashboard stats (6 sequential queries) | 300–800 ms | 100–200 VUs |

These are starting points, not guarantees. Use your own baseline run as the
real reference.
