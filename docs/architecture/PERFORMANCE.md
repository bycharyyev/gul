# Performance

**Status:** living document, one section per stage of the 2026-10 throughput work.
**Rule:** no improvement is claimed without a before/after measurement taken the same way:
`audit-servers.yml` → `throughput.sh` (loopback load on `GET /api/catalog/services`, concurrency
1/4/16/64, distinct `X-Forwarded-For` per request so the rate limiter is not what is measured).
The load generator runs on the same box, so every figure is a floor.

## Baseline — 2026-10-02 (before stage 1)

Requests per second / p95, `GET /api/catalog/services`:

| Concurrency | Primary | Secondary |
|---|---|---|
| 1 | 53 / 36 ms | 111 / 14 ms |
| 4 | 83 / 91 ms | 197 / 33 ms |
| 16 | 104 / 250 ms | 223 / 125 ms |
| 64 | 111 / 899 ms | 263 / 383 ms |

API container memory: primary 308 MiB, secondary 277 MiB. Each API is one Node process; both use
the primary PostgreSQL (`max_connections` 100, about 20 in use).

## Stage 1 — public read cache (Redis)

`PublicCacheService` (`apps/api/src/public-cache/`) caches whole public responses in the shared
Redis, so both API nodes share one cache and one invalidation.

| Group | Endpoints | TTL |
|---|---|---|
| `catalog` | `GET /catalog/services`, `/catalog/services/:id/rates`, `/catalog/payment-methods` | 30 / 30 / 60 s |
| `gallery` | `GET /gallery/categories`, `/gallery/products` (every filter in the key), `/gallery/products/:id` | 60 / 30 / 60 s |
| `content` | `GET /home-slides`, `/stories`, their `/ad-pricing`, `/social-links`, `/content-pages/:slug` | 30–300 s |

Rules it keeps:

- **Public data only.** Nothing per-user (orders, balances, payments, chats, the personalised feed)
  goes through it.
- **Orders never read it.** Prices and rates are read from PostgreSQL and snapshotted at order
  creation; a cached price can be *shown* for at most one TTL after an edit, never charged.
- **Explicit invalidation.** Every endpoint that changes cached data carries
  `@InvalidatesPublicCache(group)` (admin, seller cabinet and seller API). After the edit succeeds
  the group's generation is bumped and its hash dropped, before the response goes out. A load that
  started before the edit cannot write the old answer back (generation-checked Lua write).
- **Redis down → database.** The cache has its own connection with no offline queue, 0 retries and
  a 200 ms command timeout; a failure falls back to the loader. (The shared `REDIS_CLIENT` is
  configured for BullMQ and would wait forever.)
- **No stampede.** Concurrent misses on one key share one load per process.
- **Metrics.** Hit/miss/error counts and time per group: per process, and per day across nodes in
  Redis (`pcache:v1:stats:<day>`, 8 days). Staff read them at `GET /api/admin/cache/stats?days=1..7`.

Time-driven changes (a story's slot starting or ending) are not invalidated by any edit; their TTL
(30 s) bounds them.

### Stage 1 result — 2026-10-02 (after)

Same test, same day, after PR #68 was deployed. Requests per second / p95:

| Concurrency | Primary before → after | Secondary before → after |
|---|---|---|
| 1 | 53 / 36 ms → 80 / 25 ms | 111 / 14 ms → 123 / 14 ms |
| 4 | 83 / 91 ms → 86 / 85 ms | 197 / 33 ms → 229 / 28 ms |
| 16 | 104 / 250 ms → 116 / 212 ms | 223 / 125 ms → 284 / 71 ms |
| 64 | 111 / 899 ms → 156 / 819 ms | 263 / 383 ms → 284 / 545 ms |

Throughput went up 10–50 %. At 64 concurrent the secondary's p95 rose while its rate stayed
flat: that is the single Node process saturating, which stage 3 addresses.

**Edge finding, not caused by the cache.** From the owner's PC the primary takes about 5 s
before its first byte (TLS and plain HTTP on port 80 alike) while the secondary answers in 0.2 s.
From a GitHub runner both answer in about 0.4 s (`edge-latency.yml`), so this is the network path
between that client and the primary's address, not the node. It still needs checking from a phone
in Turkmenistan: DNS sends roughly half of visitors to each node.

## Stage 2 — chat reads without re-downloading the conversation

**Found.** Open chats poll every 4 s (web chat, seller inbox, shop chat, admin support; mobile
every 10–15 s). Each poll fetched the newest 200 room messages, or the **entire** support thread
(no limit), and wrote "read" flags (`markChatRead` / `updateMany`) every time, new messages or not.
Background tabs kept polling.

**Changed.**

- Every message read takes `?after=<message id>` and then returns only newer messages
  (`incremental: true`): `GET /chat/rooms/:id/messages`, `/chat/threads/:id/messages`,
  `/support/thread`, `/support/seller/:sellerId/thread`, `/support/admin/threads/:id`,
  `/support/seller-inbox/threads/:id`. Without `after` the answer is exactly as before, so
  existing clients (the published mobile build) keep working.
- The cursor is resolved **inside the conversation being read** after the existing membership or
  scope check. An id from another conversation falls back to a full read of the caller's own
  conversation, so the parameter reveals nothing about chats the caller cannot open.
- A poll that brings nothing from the other side writes no read flags.
- Web chat, seller inbox, shop chat and admin support send the cursor. It is the last id *received
  from the server*, never the id of a message just sent: one from the other side stored in between
  would otherwise be skipped. `mergeMessages` (api-client) de-duplicates and orders by time.
- Background tabs no longer poll.

Mobile keeps full reads for now; it moves to `after` with the next APK.

**SSE vs WebSocket.** Not built yet, by design: incremental polling removes most of the cost
(an empty poll is now a small indexed query with no write), and realtime adds a long-lived
connection per open chat across two nodes behind round-robin DNS.

When polling stops being enough, the plan is:

- **SSE** for delivery (one-way, plain HTTP, works through the existing nginx with buffering off,
  reconnects with `Last-Event-ID` = the same message cursor).
- **Redis pub/sub** to fan a new message out to whichever node holds the subscriber's connection.
- Sending stays the existing authorised `POST`.
- Fallback to 15 s incremental polling when the stream drops.

WebSocket brings nothing that SSE lacks for this traffic and needs more nginx and auth plumbing.

## Stage 3 — process roles (ADR 0008)

Phase A, merged 2026-10-02: `APP_ROLE` (`all` | `http` | `worker`) gates every BullMQ worker,
sweeper, cron and Telegram poller. `GET /api/health/role` reports it. Production keeps `all`, so
there is no runtime change.

Phase B (2 http processes + 1 worker per node, connection limits, nginx upstream, rolling deploy)
is designed in ADR 0008 and awaits owner approval.

## Stage 4 — front-end and media

**Audited on production (secondary), 2026-10-02:**

| What | Header / behaviour | Verdict |
|---|---|---|
| `/_next/static/*` JS and CSS | `public, max-age=31536000, immutable` | already right |
| `/_next/image` | AVIF/WebP negotiated, `srcset` 16–3840 px with `sizes`, `max-age=2592000` (30 d) | already right (earlier PRs #39–#45) |
| HTML | `s-maxage=60, stale-while-revalidate`, gzip/br (home page 7.7 KB compressed) | already right |
| S3 public objects (avatars, uploads) | **no `Cache-Control`**, only an ETag | every view was a conditional request to the bucket |

**Changed.** Public uploads are now written with `Cache-Control: public, max-age=31536000,
immutable`. That is safe because every public key is a fresh uuid, so the bytes behind a URL never
change. Private documents are untouched. Objects uploaded before this change keep having no header
until they are re-uploaded; a one-off copy-in-place could backfill them if it is ever worth it. No
CDN is involved, and `S3_PUBLIC_BASE_URL` remains the hook for one later.

## Stage 5 — admin Performance page

`/performance` in the admin console (ADMIN, MANAGER), backed by `GET /api/admin/performance?period=5m|1h|24h|7d`:

- **Users.** Online in the last 5 min, active in the last 1 h and 24 h. These are distinct signed-in
  users, estimated with Redis HyperLogLog. No id can be read back from it.
- **Requests.** RPS, average, p95 and p99 (interpolated from a 10-bucket latency histogram and
  labelled as an estimate), 2xx/3xx/4xx/5xx, and 429 separately. Each period has a time series.
  Counted by `PerfMetricsMiddleware` on response `finish`, so the rate limiter's 429 and auth
  refusals, which never reach interceptors, are included. Health checks are excluded.
- **Cache.** Hit ratio from `PublicCacheService` (today, or 7 days).
- **Servers.** Every API process reports CPU (host-wide, from `/proc/stat` deltas), host RAM,
  load, its own RSS, role and uptime every 15 s (TTL 60 s). The label comes from `NODE_LABEL` in
  the compose files (`primary` / `secondary`) plus the port.
- **PostgreSQL.** Connections used/max, active queries, and replication state and replay lag. No
  `client_addr` is sent.
- **BullMQ.** Waiting, active and failed jobs per queue.
- **Stuck orders.** PAID for more than 10 min, PROCESSING for more than 30 min.

Storage: Redis hashes `perf:m:<minute>` (kept 2 h) and `perf:h:<hour>` (kept 8 d), with HLL
`perf:um:*` / `perf:uh:*`, on a dedicated fail-fast connection. Writes never delay a request, and
with Redis down the samples are simply lost.

### Stage 5 regression and fix

The measurement right after stage 5 showed a drop: at 64 concurrent, the primary went 156 → 107
req/s with p95 819 → 1430 ms, and the secondary went 284 → 232 req/s. The new metrics wrote about
14 Redis commands per request, and the stage 1 cache statistics wrote 3 per hit. PR #74 batches
both in memory and flushes once every 5 s.

## Results after stages 1–5 — 2026-10-02

Requests per second / p95, same test as the baseline. The primary was measured three times
(the load generator shares its 6 cores with PostgreSQL, so its figures vary run to run); the range
is shown.

| Concurrency | Primary baseline → now | Secondary baseline → now |
|---|---|---|
| 1 | 53 / 36 ms → 63–79 / 22–30 ms | 111 / 14 ms → 124 / 14 ms |
| 4 | 83 / 91 ms → 83–116 / 61–84 ms | 197 / 33 ms → 248 / 24 ms |
| 16 | 104 / 250 ms → 102–132 / 172–211 ms | 223 / 125 ms → 265 / 89 ms |
| 64 | 111 / 899 ms → 127–159 / 1251–1316 ms | 263 / 383 ms → 281 / 655 ms |

What it says:

- **Up to 64 concurrent requests:** the secondary is faster at every level (+12–26 % throughput,
  p95 down 29 % at 16 concurrent).
- **At 64 concurrent:** throughput is flat or up, but p95 is worse on both nodes. The box's load
  average reaches about 6 on 6 cores during the test, and the API is one event loop. That is the
  ceiling ADR 0008 phase B addresses (two HTTP processes per node).
- **API memory:** primary 308 → 280 MiB, secondary 277 → 264 MiB.
