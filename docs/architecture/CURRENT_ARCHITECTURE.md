# Current architecture

**Status:** Current source of truth  
**Last verified:** 2026-09-06  
**Scope:** Runtime components, trust boundaries, state ownership and deployment topology

Gulyaly is a modular monolith with four clients. Business state is authoritative in PostgreSQL;
Redis transports asynchronous work, and S3-compatible object storage holds production uploads.
This document describes the current code and deployment. Historical audits belong in
`PROJECT_REPORT.md` and must not override this document when they disagree.

## System context

```text
Next.js web ─┐
Vite admin ──┼── HTTPS/JSON ──> NestJS API ──> PostgreSQL
Flutter ─────┤                       │   ├────> S3-compatible storage
Partner API ─┘                       │   └────> GitHub Actions provisioning API
                                      └────────> Redis/BullMQ workers
                                                   ├─ top-up delivery
                                                   └─ critical/transactional/marketing email
```

The partner boundary uses `X-Api-Key`; customer, seller and staff clients use JWT access tokens
plus rotating opaque refresh tokens. All channels reuse the same application services and data.

## Runtime components

| Component | Responsibility | State owner |
|---|---|---|
| `apps/api` | REST API, workers, Telegram bot, Swagger | PostgreSQL |
| `apps/web` | Customer and seller storefront | API |
| `apps/admin` | Staff operations console | API |
| `apps/mobile` | Flutter customer client | API |
| PostgreSQL 16 | Business and financial source of truth | Primary DB |
| Redis 7/BullMQ | Work delivery, quotas and short-lived counters | Reconstructable state |
| S3 | Public media and private documents | Object store |
| Host nginx | TLS termination and hostname routing | Versioned config in `infra/nginx` |

`apps/api` is a modular monolith. Its Nest modules are deployment-internal boundaries, not
network services. New business behavior belongs in a domain service; controllers must remain
transport adapters and must not access Prisma directly. The architecture check has two explicit
platform read/probe exceptions: health readiness and the API-usage read model.

## Domain boundaries

| Domain | Nest modules | Owns |
|---|---|---|
| Identity | `auth`, `users`, `api-keys` | users, credentials, roles and sessions |
| Top-up commerce | `catalog`, `orders`, `payments`, `partner` | services, rates, top-up orders and payments |
| Marketplace | `gallery`, `sellers`, `withdrawals` | products, sellers, fulfilment and seller balances |
| Cargo | `cargo` | routes, tariffs, shipments and tracking timeline |
| Communications | `email`, `support`, `telegram-bot` | notifications and conversations |
| Content | `stories`, `home-slides`, `content-pages`, `social-links` | storefront content |
| Platform | `storage`, `uploads`, `metrics`, `health`, `audit-log`, `subdomains`, `queue` | cross-cutting infrastructure |

Shared TypeScript contracts are split by domain (`cargo`, `marketplace`, `email`, `content`,
`referrals`, `platform`) and re-exported from `@topup-hub/types` for backward compatibility.
The shared client exposes namespaced `api.auth.*` and `api.cargo.*` resources while retaining
legacy flat methods during migration. New client domains should follow the namespaced pattern.

Cross-domain calls go through exported Nest services. Shared database transactions are an
intentional advantage of the monolith; splitting a module into a service requires an ADR and a
measured scaling, security or ownership reason.

## State and consistency rules

1. PostgreSQL is authoritative for orders, payments, balances, email obligations and job state.
2. Redis loss must not erase a financial fact. Jobs must be reproducible from PostgreSQL.
3. Price, fee, tariff and exchange-rate values are snapshotted when an obligation is created.
4. State transitions are explicit allowlists in state-machine modules.
5. An external side effect uses a stable idempotency key whenever the provider supports it.
6. An ambiguous operator result is never blindly retried; at-most-once delivery is preferred
   until reconciliation is implemented.
7. Production uploads require S3. Missing S3 configuration fails the upload instead of writing
   host-local files that another active API node cannot read.

## Deployment topology

Both VPS instances run web, admin and API. The secondary application tier connects to the
primary PostgreSQL and Redis during normal operation. A streaming PostgreSQL replica runs on the
secondary but remains read-only until an explicitly confirmed promotion.

This means application compute is active/active, while state is not:

- PostgreSQL: one writer plus asynchronous standby;
- Redis: one primary instance shared by both API nodes;
- uploads: shared S3;
- database failover: manual promotion and application reconfiguration;
- failback: manual re-base and fencing of the old primary.

See `HIGH_AVAILABILITY.md` for the operational procedure and `RELIABILITY_TARGETS.md` for the
service targets that must be approved by the business owner.

## Request observability

Every API response includes `X-Request-Id`. A safe incoming value is preserved; otherwise the API
creates a UUID. Completion and unhandled-error logs carry the same `requestId`. Logs use matched
route templates rather than raw URLs, preventing phone numbers and resource ids from becoming
high-cardinality log fields. Error responses and the shared `ApiError` expose the same id so a
support report can be correlated without copying sensitive request data.

## Known limitations

- `MockOperatorGateway` is not a production top-up integration.
- `ManualPaymentProvider` is the only registered payment provider. No acquirer has been selected
  yet, so no vendor adapter ships; the provider-neutral pipeline around the boundary (initiation
  guard, webhook inbox, reconciliation, redirect return) is complete and waiting. See
  docs/adr/0005-real-provider-adapters.md for how to plug one in.
- The web checkout calls payment initiation with a stable idempotency key and follows only HTTPS
  hosted-checkout redirects; a failed initiation can be retried without creating another order.
- seller ledger reconciliation runs in the existing cross-host alert pass; mismatches require an
  append-only compensating entry and are never silently repaired.
- payments have canonical states, durable HTTP idempotency, ambiguous-outcome protection, staff
  reconciliation and a provider-neutral signed-webhook inbox. Each adapter must authenticate the
  exact raw body, normalize the event, and supply verified amount/currency for every success before
  PostgreSQL accepts it; mismatches are quarantined instead of settled. A background worker replays
  verified events left unfinished by a crash. A concrete signed adapter awaits the gateway choice.
- HTTP handling, workers and Telegram bot share one API process/image.
- Top-up fulfillment resolves an `OperatorGateway` through DI. With no real adapter configured it
  fails closed, and mock fulfillment is rejected in production. Ambiguous provider outcomes remain
  `SENT`/`PROCESSING` for reconciliation instead of becoming retryable failures.
- Flutter contracts are maintained manually rather than generated from OpenAPI.
- full state-layer failover and failback are not automatic.

## Change policy

Update this file in the same pull request when a runtime component, state owner, trust boundary,
deployment role or failure mode changes. Record irreversible or costly decisions under
`docs/adr/`.
