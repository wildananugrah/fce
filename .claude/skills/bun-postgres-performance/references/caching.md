# Caching

Cache reads that are hit often and change rarely. Three tiers, cheapest first.

## The three tiers

| Tier | Latency | Shared? | Capacity | Good for |
|---|---|---|---|---|
| In-process LRU | microseconds | No (per-instance) | MBs | Config, feature flags, small hot sets |
| Redis | ~1ms | Yes | GBs | Sessions, rate limits, denormalized read models |
| Postgres materialized view | ~query time | Yes | Table-sized | Heavy aggregations refreshed on schedule |

Use all three in combination where appropriate. Read from LRU → Redis → Postgres, write through in reverse.

## Tier 1 — In-process LRU

```typescript
import { LRUCache } from 'lru-cache';

const featureFlags = new LRUCache<string, boolean>({
  max: 1000,
  ttl: 60_000,  // 1 minute
});

async function isFeatureEnabled(userId: string, flag: string): Promise<boolean> {
  const key = `${userId}:${flag}`;
  const cached = featureFlags.get(key);
  if (cached !== undefined) return cached;

  const value = await loadFromDb(userId, flag);
  featureFlags.set(key, value);
  return value;
}
```

Caveats:
- Not shared across instances — different app replicas may have different cached values
- Lost on restart
- Don't use for things that MUST be consistent across instances (use Redis)

## Tier 2 — Redis

### Client choice on Bun

Bun works with several Redis clients:

- **ioredis** — the most feature-complete; works on Bun; what most apps use
- **redis (node-redis)** — official, works on Bun
- **Bun's built-in** — as of recent Bun versions, there's `Bun.RedisClient`; fast and Bun-native

For BullMQ specifically, use `ioredis` — BullMQ requires it.

```typescript
// ioredis
import { Redis } from 'ioredis';
const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,  // required for BullMQ
  enableReadyCheck: false,
});
```

### Cache-aside pattern

```typescript
async function getUser(id: string): Promise<User> {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await sql`SELECT * FROM users WHERE id = ${id}`.then(r => r[0]);
  await redis.set(`user:${id}`, JSON.stringify(user), 'EX', 300);  // 5 min TTL
  return user;
}
```

### Write-through / write-back

On update, either:
- **Write-through**: update DB, then update/delete cache entry. Simple, slightly slower writes.
- **Write-back**: update cache, enqueue a job to persist to DB. Fast writes but risk of data loss.

Most apps should use write-through with `DEL` on the cache key:

```typescript
async function updateUser(id: string, data: Partial<User>) {
  await sql`UPDATE users SET ${sql(data)} WHERE id = ${id}`;
  await redis.del(`user:${id}`);  // invalidate; next read will repopulate
}
```

## Stampede protection (cache miss avalanche)

When a popular cache entry expires, 100 simultaneous requests can all try to regenerate it. Three fixes:

### 1. Per-key lock (SET NX)

```typescript
async function getWithLock(key: string, regenerate: () => Promise<string>, ttl = 300) {
  const cached = await redis.get(key);
  if (cached) return cached;

  const lockKey = `lock:${key}`;
  const gotLock = await redis.set(lockKey, '1', 'NX', 'EX', 10);

  if (gotLock) {
    try {
      const value = await regenerate();
      await redis.set(key, value, 'EX', ttl);
      return value;
    } finally {
      await redis.del(lockKey);
    }
  } else {
    // Someone else is regenerating; wait briefly and retry
    await Bun.sleep(50);
    return getWithLock(key, regenerate, ttl);
  }
}
```

### 2. Stale-while-revalidate

Serve stale data while one request refreshes in the background. Fits very well with BullMQ:

```typescript
async function getWithSWR(key: string) {
  const entry = await redis.get(key);
  if (!entry) return regenerateAndCache(key);

  const { value, expiresAt } = JSON.parse(entry);
  if (Date.now() > expiresAt - 60_000) {
    // Close to expiry — kick off background refresh, don't wait
    await refreshQueue.add('refresh', { key }, { jobId: `refresh:${key}` });
  }
  return value;
}
```

Note the `jobId: 'refresh:...'` — BullMQ deduplicates by job ID, so concurrent near-expiry reads only trigger one refresh.

### 3. Jitter the TTL

If you have 10K cache entries that all expire at the same time, you get a thundering herd. Add random jitter:

```typescript
const ttl = 300 + Math.floor(Math.random() * 60);  // 300-360s
await redis.set(key, value, 'EX', ttl);
```

## Invalidation strategies

Cache invalidation is hard. Pick a strategy and stick with it:

### TTL-only (simplest)

Every entry expires after a fixed time. Users may see stale data for up to TTL seconds. Good for:
- Lists of "popular items"
- Non-critical read models
- Anything where slight staleness is fine

### Explicit invalidation on write

Every write path clears the relevant cache keys. Hard to get right because:
- You have to remember every place that writes
- You have to know every cache key that might be affected
- Race conditions between writes and reads can re-populate stale data

Keep the set of cache keys small and predictable — or use a key prefix scheme:

```typescript
// On user update, invalidate all derived caches
await redis.del(`user:${id}`);
await redis.del(`user:${id}:posts`);
await redis.del(`user:${id}:profile`);
```

For large fan-out (e.g., invalidating every entry derived from a user), consider **Redis pub/sub** to broadcast invalidations to all replicas, or use short TTL + accept brief staleness.

### Version-tagged keys

Include a version in the cache key. Bump the version to invalidate everything:

```typescript
const version = await redis.get('user:schema:v') ?? '1';
const cacheKey = `user:${id}:v${version}`;
// To invalidate ALL user caches:
await redis.incr('user:schema:v');
```

No DEL storm — old keys just age out via LRU/TTL.

## Tier 3 — Postgres materialized views

For expensive aggregations that don't need to be real-time:

```sql
CREATE MATERIALIZED VIEW revenue_by_month AS
SELECT date_trunc('month', created_at) AS month,
       SUM(total) AS revenue
FROM orders
WHERE status = 'paid'
GROUP BY 1;

-- Refresh (can be done via cron / BullMQ):
REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_by_month;
```

`CONCURRENTLY` requires a unique index on the view and doesn't block reads during refresh.

## BullMQ for async work + cache refresh

BullMQ is a natural fit for:
- Background cache refresh (stale-while-revalidate)
- Expensive read model regeneration
- Anything that shouldn't block the request

```typescript
import { Queue, Worker } from 'bullmq';

const cacheRefreshQueue = new Queue('cache-refresh', { connection: redis });

new Worker('cache-refresh', async (job) => {
  const { key } = job.data;
  const value = await expensiveComputation();
  await redis.set(key, JSON.stringify(value), 'EX', 600);
}, { connection: redis, concurrency: 5 });
```

## Don't cache

Some things aren't worth caching:
- **Mutations / writes** — obviously
- **User-specific data that's rarely re-read** — cache hit rate will be ~0
- **Anything where stale data causes bugs** (auth decisions, billing, security checks) — unless you have a rigorous invalidation story
- **Data that's cheap to compute or already fast** — adds complexity without meaningful savings

Measure hit rate: if it's below ~60%, the cache is probably not worth the invalidation complexity.
