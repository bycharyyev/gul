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
