# Competitor Analyzer — Monitoring & Runbook

## SSE Event Catalog

Each is emitted by the backend via `NotificationService.notify(userId, { type, data })` and consumed by the frontend via `useSSE`. Event types must be listed in `frontend/src/hooks/useSSE.ts` `EVENT_TYPES` allowlist — EventSource silently drops named events the client hasn't subscribed to.

| Event type | Payload | When emitted |
|-----------|---------|--------------|
| `creator_enrichment_completed` | `{ creatorId, status }` | After profile scrape finishes (enriched OR failed) |
| `competitor_pipeline_stage_changed` | `{ runId, status, stage }` | On every stage transition in the pipeline |
| `competitor_pipeline_video_analyzed` | `{ runId, videoId, status }` | After each video's Gemini analysis completes or fails |
| `competitor_pipeline_completed` | `{ runId, videoCount, scriptCount }` | After Stage 5 finishes |
| `competitor_pipeline_failed` | `{ runId, errorMessage }` | On any fatal failure |

## LogQL Query Cookbook

Use in Grafana Explore against the `app="fce-backend"` Loki stream.

**Pipeline runs started per hour:**
```logql
sum(count_over_time({app="fce-backend"} |= "cp_started" [1h]))
```

**Success rate over last 24h:**
```logql
sum(count_over_time({app="fce-backend"} |= "cp_completed" [24h]))
/
sum(count_over_time({app="fce-backend"} |~ "cp_completed|cp_failed" [24h]))
```

**All logs for a specific run:**
```logql
{app="fce-backend"} |= "<runId>"
```

**Pipeline failures by stage:**
```logql
sum by (stage) (
  count_over_time(
    {app="fce-backend"} |= "cp_failed"
    | regexp `"stage":"(?P<stage>[^"]+)"`
    [1m]
  )
)
```

**Video analysis latency p95 (last 5m):**
```logql
quantile_over_time(0.95,
  {app="fce-backend"} |= "cp_video"
  | regexp `"durationMs":(?P<ms>[0-9]+)`
  | unwrap ms
  [5m]
)
```

**Video failure reasons (grouped table):**
```logql
{app="fce-backend"} |= "cp_video_fail"
| regexp `"reason":"(?P<reason>[^"]+)"`
| line_format "{{.reason}}"
```

## SQL Query Cookbook

Identical queries appear as an appendix in `docs/database-access.md` — reproduced here for convenience.

### 1. Failed runs in last 24h
```sql
SELECT id, project_id, stage, error_message, started_at, completed_at
FROM competitor_pipeline_runs
WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### 2. Stuck runs (started > 45 min ago, not terminal)
```sql
SELECT id, project_id, status, stage, started_at
FROM competitor_pipeline_runs
WHERE status NOT IN ('completed','failed')
  AND started_at < NOW() - INTERVAL '45 minutes';
```

### 3. Per-run video analysis outcome breakdown
```sql
SELECT r.id AS run_id,
       COUNT(*) FILTER (WHERE v.analysis_status = 'completed') AS ok,
       COUNT(*) FILTER (WHERE v.analysis_status = 'failed')    AS failed,
       COUNT(*) FILTER (WHERE v.analysis_status = 'pending')   AS pending
FROM competitor_pipeline_runs r
LEFT JOIN pipeline_content v ON v.run_id = r.id
WHERE r.id = '<run-id>'
GROUP BY r.id;
```

### 4. Cost per run
```sql
SELECT SUM(estimated_cost) AS usd,
       SUM(input_tokens) AS in_tok,
       SUM(output_tokens) AS out_tok
FROM ai_provider_logs
WHERE generator IN ('competitor_video_analysis','competitor_script_generation')
  AND user_prompt LIKE '%<run-id>%';
```

### 5. Creator enrichment queue health
```sql
SELECT enrichment_status, COUNT(*)
FROM creators
WHERE archived_at IS NULL
GROUP BY enrichment_status;
```

### 6. Top-performing analyzed competitor videos per project
```sql
SELECT v.view_count, v.like_count, v.caption, c.username, c.platform, v.created_at
FROM pipeline_content v
JOIN creators c ON c.id = v.creator_id
WHERE c.project_id = '<project-id>' AND v.analysis_status = 'completed'
ORDER BY v.view_count DESC NULLS LAST
LIMIT 20;
```

Or run the wrapper script that pretty-prints 1–3 + 5:
```bash
cd backend && bun run scripts/competitor-pipeline-status.ts
```

## Runbook

### "Pipeline is stuck"

1. Check Grafana panel "Pipeline failures by stage" for recent failures.
2. SQL query 2 above to find runs started > 45 min without completion.
3. If `stage = scraping_creator_X_of_Y`: check Apify dashboard at apify.com → Runs for that creator.
4. If `stage = analyzing_video_X_of_Y`: check Gemini billing quota + Files API status.
5. If nothing obvious: search Loki for the `runId` to find the last emitted event.

### "Run keeps failing on video analysis"

1. LogQL query "Video failure reasons" to group errors.
2. Common reasons + fixes:
   - "Video exceeds 50 MB cap" → TikTok returned a long-form video. Skip that creator or raise `VIDEO_SIZE_CAP_BYTES` in `competitor-pipeline.job.ts`.
   - "Gemini file processing FAILED" → transient; retry the run.
   - "video download timed out" → Apify returned a dead CDN URL. Re-scrape the creator (or raise `VIDEO_DOWNLOAD_TIMEOUT_MS`).

### "Enrichment stays pending"

1. SQL query 5 — pending count > 0 for more than a few minutes indicates a worker issue.
2. Check the `creator-enrichment` pg-boss queue has an active worker: `SELECT * FROM pgboss.job WHERE name = 'creator-enrichment' AND state IN ('created','active') ORDER BY created_on DESC LIMIT 10;`
3. If workers aren't picking jobs up, restart the backend (pg-boss workers register on boot in `src/index.ts`).

## Smoke-Test Checklist

Before shipping any change touching this feature, manually verify:

1. Add creator → "enriching…" chip appears → real avatar + follower count arrive within ~60 seconds.
2. Create config, link creators, save.
3. Launch pipeline → live progress updates every few seconds.
4. Open completed video card → analysis text (Hook + Why-it-went-viral) renders.
5. Switch to Outputs tab → scripts appear.
6. Grant/revoke `competitor-analyzer` to a MEMBER via Workspace Settings → Projects → member editor → sidebar hides/shows.
7. Remove workspace Apify key → launch run → run fails with clear "Apify API key not configured" message → restore key → retry works.
