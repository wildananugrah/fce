# Bun Runtime Performance

Bun-specific patterns for squeezing more out of the runtime.

## Bun.serve configuration

```typescript
Bun.serve({
  port: 3000,
  reusePort: true,           // enable SO_REUSEPORT — critical for multi-process scaling
  development: false,        // disables expensive dev-only checks in production
  idleTimeout: 30,           // seconds before closing idle connections (default 10)
  maxRequestBodySize: 1024 * 1024 * 10,  // 10MB cap; don't leave unlimited

  async fetch(req) {
    return new Response('ok');
  },

  error(err) {
    console.error(err);
    return new Response('internal error', { status: 500 });
  },
});
```

### reusePort — multi-process scaling

With `reusePort: true`, you can run multiple Bun processes on the same port and the kernel load-balances between them. This is the simplest way to use multiple cores.

```bash
# Simple: run N processes
for i in 1 2 3 4; do bun src/server.ts & done

# Production: use a process manager (PM2, systemd, Docker with N replicas)
```

A single Bun process is single-threaded for JS. If you see one core pinned at 100% while others are idle, you need more processes.

## Streaming responses

Don't buffer large responses into memory:

```typescript
// ❌ Buffers the whole thing
app.get('/export', async (c) => {
  const rows = await sql`SELECT * FROM events`;
  return c.json(rows);  // huge array in memory
});

// ✅ Stream row by row as NDJSON
app.get('/export', (c) => {
  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const row of sql`SELECT * FROM events`.cursor(500)) {
          controller.enqueue(encoder.encode(JSON.stringify(row) + '\n'));
        }
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } }
  );
});
```

postgres.js and Bun.sql both support `.cursor(n)` for server-side cursor-based streaming.

## CPU-bound work → Workers

Anything that blocks the event loop for >5ms on the hot path is a problem. Move to a Worker:

```typescript
// main.ts
const worker = new Worker(new URL('./worker.ts', import.meta.url));

app.post('/resize', async (c) => {
  const buf = await c.req.arrayBuffer();
  const result = await new Promise<ArrayBuffer>((resolve) => {
    worker.postMessage(buf, [buf]);  // transfer, not copy
    worker.onmessage = (e) => resolve(e.data);
  });
  return new Response(result, { headers: { 'Content-Type': 'image/jpeg' } });
});
```

```typescript
// worker.ts
self.onmessage = async (e) => {
  const resized = await heavyImageResize(e.data);
  self.postMessage(resized, [resized]);
};
```

For long-lived heavy work (image processing, PDF generation, ML inference), **BullMQ is usually a better fit** — jobs queue up on Redis, run on dedicated worker processes, survive restarts, and don't take down the HTTP process on a bad input.

## Bun.file for static assets

```typescript
// ❌ reads into memory first
const data = await fs.readFile('./public/logo.png');
return new Response(data);

// ✅ Bun.file is a lazy reference; kernel sendfile on supported platforms
return new Response(Bun.file('./public/logo.png'));
```

## JSON serialization

For very large objects, `JSON.stringify` dominates response time. Options:

1. **Return fewer fields** — the cheapest win
2. **Stream NDJSON** instead of one giant array (see above)
3. **Pre-serialize on write** — store the response body in Redis as a string, skip stringify at read
4. **Use `Bun.write` / `Bun.file`** to serve pre-computed JSON blobs for hot read-only endpoints

## Hono-specific tips

Middleware order matters — cheap things first:

```typescript
const app = new Hono();

// 1. Fast filters first
app.use('*', cors());
app.use('*', timing());

// 2. Auth — reject bad requests before expensive work
app.use('/api/*', bearerAuth({ token: '...' }));

// 3. Rate limit — reject before hitting DB
app.use('/api/*', rateLimiter({ windowMs: 60_000, limit: 100 }));

// 4. Body parsing only where needed (don't parse for GETs)
app.post('/api/*', async (c, next) => { /* ... */ });

// 5. Routes
app.get('/api/users/:id', async (c) => { /* ... */ });
```

### Avoid validator recompilation on the hot path

```typescript
// ❌ Schema created on every request
app.post('/api/users', async (c) => {
  const schema = z.object({ name: z.string() });
  const body = schema.parse(await c.req.json());
});

// ✅ Defined once
const createUserSchema = z.object({ name: z.string() });
app.post('/api/users', zValidator('json', createUserSchema), async (c) => {
  const body = c.req.valid('json');
});
```

## Compression

Compression is CPU-expensive. Prefer doing it at the edge:

- **Cloudflare / Vercel / Fly**: automatically compresses responses
- **Nginx reverse proxy**: `gzip on` + `brotli on` via brotli module

If you must compress in-app (e.g., compressing to disk, or no edge):

```typescript
import { compress } from 'hono/compress';
app.use('/api/*', compress({ encoding: 'gzip' }));
```

Skip compression for responses <1KB — the overhead outweighs the savings.

## Memory

Bun processes can hold a lot of memory if you're not careful:

- **Caches** — cap in-process caches with an LRU (`lru-cache` npm package) + explicit `maxSize`
- **Response bodies** — never buffer an entire upload; stream it (see Bun's `req.body` as `ReadableStream`)
- **Heap snapshots** — `bun --heap-snapshot-on-exit src/server.ts` produces a `.heapsnapshot` you can open in Chrome DevTools

Set memory limits at the runtime level:

```bash
bun --smol src/server.ts   # enables lower-memory mode (smaller heap)
```

In containers, set `--memory` limits so one bad deploy can't take down the host.

## `--inspect` for profiling

```bash
bun --inspect-brk src/server.ts
```

Opens a CDP (Chrome DevTools Protocol) endpoint. Open `about:inspect` in Chromium and attach — you get CPU profiles, heap snapshots, and allocation timelines.

For continuous profiling in production, consider a tool like Pyroscope or Sentry profiling (with the Node-compatible SDK).

## Common Bun-specific gotchas

- **`Bun.env` vs `process.env`** — both work; `Bun.env` is marginally faster
- **Native Node modules** that use `node-gyp` and native bindings may or may not work — check Bun's compatibility page
- **`setImmediate` → `setTimeout(fn, 0)`** — there are subtle differences; most code works but profile before relying on either for scheduling
- **`fetch` is Bun-native**, much faster than Node's; use it instead of third-party HTTP clients where you can
