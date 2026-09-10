# Gulyaly

A Turkmenistan-market marketplace platform combining two consumer verticals — **mobile
operator/digital-goods top-ups** and a **flower & gift delivery marketplace** — behind one
backend, with a public storefront, an internal ops console, and a B2B partner API for resellers.

> The codebase's internal package namespace (`@topup-hub/*`) reflects the project's original
> name and isn't worth a mechanical rename; the product itself is Gulyaly everywhere it's
> user-facing (this file, the admin UI, domains).

> **Docs map:** this file is the human-facing product/tech overview. [CLAUDE.md](CLAUDE.md) is
> the AI-assistant/engineer operating manual (commands, deployment internals, gotchas).
> [docs/architecture/PROJECT_REPORT.md](docs/architecture/PROJECT_REPORT.md) is a from-the-code
> audit of the business logic, financial-integrity fixes, and security posture.
> [docs/architecture/CURRENT_ARCHITECTURE.md](docs/architecture/CURRENT_ARCHITECTURE.md) is the
> current source of truth for runtime boundaries, state ownership, and deployment topology.
> [docs/architecture/HIGH_AVAILABILITY.md](docs/architecture/HIGH_AVAILABILITY.md) covers the
> two-VPS topology and failover in depth.

## What it does

**Top-ups.** Customers buy mobile-operator/digital-service credit (e.g. TMCELL) at a configured
rate (`Rate`, per service per currency), pay through a pluggable payment method
(`PaymentProvider`/`PaymentProviderRegistry` — currently manual confirmation, designed to accept
a real gateway later), and the order (`Order`) is queued (`TopupJob` via BullMQ) for delivery to
the recipient (phone number or account ID, depending on the service) through an
`OperatorGateway` (fail-closed until a real reseller/operator API is configured; an explicit mock
is available only outside production).

**Gallery.** A separate flowers/gifts marketplace on the same order/payment machinery but its own
models: independent **sellers** (`Seller`) list products (`GalleryProduct`) under categories
(`GalleryCategory`), customers place delivery orders (`GalleryOrder`), and sellers get notified
and manage fulfillment — including over a **Telegram bot** a seller links once via a one-time
code from their seller panel. Sellers hold a running TMT balance and request payouts
(`WithdrawalRequest`) reviewed by staff.

**Marketplace onboarding.** Prospective sellers submit a `SellerApplication`; staff approve or
reject it from the admin console before a `Seller` record (public `handle`, shop name, balance)
is created.

**Referrals.** Both customers and sellers can refer people; referral rewards (in TMT) are
configurable per referrer type (`ReferralSettings`), and each referral is tracked with the
username used at signup, denormalized so it survives a later username change.

**Content & marketing.** Home slides, "stories," social links, and static content pages are all
admin-managed (`HomeSlide`, `Story`, `SocialLink`, `ContentPage`) — no redeploy needed to change
what the storefront shows.

**Support.** In-app support threads (`SupportThread`/`SupportMessage`) between customers and
staff, visible live in the admin console.

**Partner/reseller API.** External platforms authenticate with an `X-Api-Key` (not JWT, hash
compared, raw key shown only once) against the same catalog, rates, and order pipeline used by
consumer orders — this is the wholesale B2B channel.

**Managed subdomains.** From the admin console, staff can spin up a new `*.gulyaly.pro` subdomain
proxying to any local service on the VPS — provisioning writes an nginx vhost and issues its own
TLS certificate automatically via a GitHub Actions pipeline, with no manual server work. Any
hostname that *isn't* a real vhost or a currently-managed subdomain falls through to a branded
"not found, redirecting to the storefront" page instead of a bare nginx 404.

## Tech stack

| Layer | Technology |
|---|---|
| Backend API | [NestJS](https://nestjs.com/) (Node/TypeScript), single source of truth for all clients |
| Customer storefront | [Next.js](https://nextjs.org/) (App Router) |
| Admin console | [Vite](https://vitejs.dev/) + React |
| Database | PostgreSQL 16 via [Prisma](https://www.prisma.io/) |
| Queue/cache | Redis + [BullMQ](https://docs.bullmq.io/) (async top-up job processing; not authoritative for money — Postgres is) |
| Shared contracts | [Zod](https://zod.dev/) schemas (`packages/types`) + a typed fetch client (`packages/api-client`), shared by every frontend |
| Auth | JWT access tokens (fail-fast if misconfigured, no insecure fallback) + rotated, hashed opaque refresh tokens; a separate API-key mechanism for the partner channel |
| Monorepo tooling | pnpm workspaces + [Turborepo](https://turbo.build/) |
| Containers/CI | Docker, GitHub Actions (build → GHCR, SHA-tagged → deploy with health-check + auto-rollback) |
| Reverse proxy / TLS | Host nginx + Let's Encrypt (Certbot), version-controlled vhosts, auto-synced on change |
| Monitoring | Netdata (auth-gated), UptimeRobot (external uptime alerts), a 30s watchdog timer as a safety net under Docker's own restart policy |

## Repository layout

```
apps/
  api/      NestJS backend — REST API, Prisma schema/migrations, Swagger docs at /docs
  web/      Next.js customer storefront
  admin/    Vite + React ops console (orders, catalog, sellers, gallery, CMS, support, subdomains, ...)
packages/
  types/        Zod schemas + shared TS types for every API request/response shape
  api-client/   One typed ApiClient class, consumed by web + admin (and future mobile clients)
  config/       Shared tsconfig.base.json
infra/
  nginx/     Version-controlled nginx vhosts, shipped to the server by CI
  backups/   Daily Postgres backup timer (systemd)
  ssl/       Daily cert-expansion timer for newly added vhosts
  watchdog/  Independent health-check timer that restarts the stack if Docker's own policy doesn't
docs/architecture/   HIGH_AVAILABILITY.md, PROJECT_REPORT.md — real audits, not aspirational docs
.github/workflows/   CI/CD + all server-operations automation (deploy, subdomain provisioning,
                     replication/failover, one-off ops tasks)
```

## Local development

Requires Node 22, pnpm, and Docker (for local Postgres + Redis).

```bash
pnpm install                     # install all workspace deps
docker compose up -d             # local Postgres (5432) + Redis (6379)
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev                         # starts api, web, admin together
```

- API: http://localhost:4000/api (Swagger at `/docs`)
- Web: http://localhost:3000
- Admin: http://localhost:5173
- Seeded admin login: phone `+70000000000`; set `SEED_ADMIN_PASSWORD` before seeding — there is no default

See [CLAUDE.md](CLAUDE.md) for per-app dev commands, the shared-package rebuild step, and other
day-to-day gotchas.

## Production architecture

Two VPS instances, both provisioned identically from GitHub Actions (no manual server setup):

- **Primary** — runs the full stack (api/web/admin containers, Postgres, Redis) behind host
  nginx with Let's Encrypt certs. Every push to `main` builds all three Docker images, pushes
  them to GHCR tagged by commit SHA, and deploys with automatic rollback if the new version fails
  its health check (`/health/live` vs `/health/ready` — liveness has zero dependencies on purpose,
  readiness checks Postgres and Redis).
- **Secondary** — on a different subnet, runs the **same app tier continuously** (api/web/admin),
  connected to the primary's Postgres over the network rather than a local database. Postgres
  itself stays a single primary + streaming replica (no multi-primary complexity), but the app
  tier is genuinely active/active: a crash of primary's containers alone doesn't need any
  failover procedure, since the secondary is already serving correctly. A harder failure (primary's
  database itself gone) still needs a manual, explicitly-confirmed promotion
  (`failover-to-secondary.yml`) — full reasoning in
  [`HIGH_AVAILABILITY.md`](docs/architecture/HIGH_AVAILABILITY.md), including the one manual DNS
  step (a second A record) still needed for both nodes to actually receive live traffic today.

Domains are split by subdomain (`gulyaly.pro` → web, `admin.` → admin, `api.` → api), routed by
host nginx.

## Security posture

Summarized from the current code and [`PROJECT_REPORT.md`](docs/architecture/PROJECT_REPORT.md):
CORS fails closed, JWT has no insecure fallback, Helmet security headers are enabled, provisioning
callback secrets use timing-safe comparison, and auth endpoints are rate limited. Additional
controls include
ownership checks on user-scoped resources, upload path-traversal isn't possible (server-generated
storage names), and the only raw-SQL call sites use Prisma's auto-parameterized tagged-template
form. Remaining risks and operational limitations are tracked in
[`CURRENT_ARCHITECTURE.md`](docs/architecture/CURRENT_ARCHITECTURE.md).

## Status

Actively developed. See [CLAUDE.md](CLAUDE.md) for the current state of in-progress work.
