# ADR 0008: Process roles — HTTP and background work in separate processes

**Status:** accepted for phase A (code, no production change); phase B (topology) awaits owner approval.
**Date:** 2026-10-02

## Context

Each node runs the API as **one Node.js process** that does everything: HTTP, BullMQ workers, the
payment/order/email sweepers, crons and Telegram long-polling. Stage 1 measurements
(`docs/architecture/PERFORMANCE.md`) show that process saturating: on the secondary, going from 16 to
64 concurrent requests adds no throughput (284 → 284 req/s) while p95 rises from 71 to 545 ms. The
boxes have 6 cores; one event loop uses one.

Starting more copies of today's process is **not safe**:

| Work in the process | Today | Copy it once more on a node and… |
|---|---|---|
| Telegram seller and admin bots: `getUpdates` long-polling | only where `TELEGRAM_*_POLLING=true` (primary) | Telegram answers the second poller on a token with **409** and its polling dies |
| BullMQ workers: top-up (concurrency 1), email ×3 lanes | every node | safe (BullMQ locks jobs) but top-up concurrency silently multiplies |
| Sweepers: stuck orders, payment reconciliation, webhook replay, email outbox/alerts/retention | every node, per-process `running` flag | each claims rows atomically (`updateMany` / unique keys), so a third copy is safe but pointless |
| Crons: push campaigns (every minute, daily purge), Sentry alerts (every 15 min) | every node | push: claims are unique; Sentry alert watermark is in memory, so every extra copy can re-report |
| Prisma pool | `connection_limit` not set → `cores*2+1` = **13 per process** | 3 processes × 2 nodes × 13 = 78 of PostgreSQL's 100, before replication, backups and psql |

## Decision

Introduce `APP_ROLE` (`apps/api/src/common/app-role.ts`):

- `all`, the default and also what any unknown value means: today's behaviour.
- `http`: serves requests only. It still enqueues jobs and sends outbound messages from handlers, but
  starts no BullMQ worker, sweeper, cron or Telegram poller. Any number may run side by side.
- `worker`: runs all background work. It listens only on a loopback port for health checks and is
  never in nginx's upstream.

`GET /api/health/role` reports `{ role, background }` so a deploy can verify each process before
routing to it.

### Phase A (this change)

The role checks in every processor, cron and bot, plus the health endpoint and tests. Production
keeps `APP_ROLE` unset, i.e. `all`: **nothing changes at runtime**.

### Phase B (topology, needs owner approval before rollout)

Per node:

| Process | Role | Port (loopback) | `connection_limit` |
|---|---|---|---|
| `api` | http | 4000 | 6 |
| `api-2` | http | 4002 | 6 |
| `api-worker` | worker | 4001 (health only) | 6 |

- Database connections: at most 18 per node, 36 for both, versus up to 26 possible today (2 × 13).
  That leaves PostgreSQL ample headroom; PgBouncer is not needed at this size and is not added.
- Telegram: `TELEGRAM_*_POLLING=true` stays on the primary only. Only its `api-worker` acts on it,
  because http processes ignore it.
- Top-up concurrency stays 1 per node, because only the worker runs the top-up worker.
- nginx: `upstream gul_api { least_conn; server 127.0.0.1:4000; server 127.0.0.1:4002; keepalive 32; }`.
  `proxy_next_upstream error timeout` keeps nginx's default of never retrying a non-idempotent
  request (POST/PATCH), so a payment or order request is never replayed on the other process.
- Rolling deploy: `api-worker` first, then `api`, wait for `/api/health/ready`, then `api-2`. One
  http process is always serving. Graceful shutdown already exists (`enableShutdownHooks`).
- Watchdog and smoke checks keep using port 4000. Add a role check per port.
- Memory: about 260 MB per process, so +520 MB per node, against 2.5 GB free.

**Rollback.** Unset `APP_ROLE`, stop `api-2` and `api-worker`, and point the upstream back to the
single server. This is the same compose file with two services removed and needs no data change.
Phase B ships as its own PR with a `deploy.yml` step that reverts automatically if any of the
three processes fails readiness.

## Consequences

- Background work becomes an independently restartable process. A slow sweep can no longer delay
  HTTP on the same event loop.
- More moving parts per node: three containers instead of one. The deploy and watchdog must know
  about them.
- The Sentry alert watermark should move to Redis before more workers are added anywhere.
  Separate finding.
