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
