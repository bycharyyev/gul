# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TopupHub — a mobile-operator/digital-goods top-up marketplace (modernized clone of a Turkmenistan top-up service). Three deployables share one backend contract: a customer-facing storefront, an internal admin console, and a partner/reseller API for B2B integrations. Built to extend to native mobile apps later without backend changes.

## Commands

Run from the repo root unless noted. Package manager is **pnpm** (workspace), orchestrated by **Turborepo**.

```bash
pnpm install                     # install all workspace deps (run after pulling changes to any package.json)
pnpm dev                         # turbo run dev — starts api, web, admin together (dev depends on ^build, so packages build first)
pnpm build                       # build everything
pnpm typecheck                   # tsc --noEmit across all apps/packages
pnpm lint                        # eslint across all apps

pnpm db:generate                 # prisma generate (apps/api)
pnpm db:migrate                  # prisma migrate dev (apps/api) — creates + applies a migration from schema.prisma changes
pnpm db:seed                     # seed catalog + admin user (apps/api/prisma/seed.ts)
```

Per-app dev servers (useful when only touching one app — avoids Turborepo firing up all three):
```bash
pnpm --filter @topup-hub/api dev      # Nest, http://localhost:4000/api, Swagger at /docs
pnpm --filter @topup-hub/web dev      # Next.js, http://localhost:3000 (or 3001 if 3000 is taken)
pnpm --filter @topup-hub/admin dev    # Vite, http://localhost:5173
```

Single test in a given package: run the package's own test runner directly from that package's directory (e.g. `cd apps/api && npx jest path/to/file.spec.ts`) — there is no repo-wide single-test script.

**Local infra:** `docker compose up -d` starts Postgres (5432) + Redis (6379). Copy each app's `.env.example` to `.env`/`.env.local` before first run.

**Seeded admin login:** phone `+70000000000`. The password is whatever `SEED_ADMIN_PASSWORD` was set to — the seed refuses to run without it, so there is no default to look up here or anywhere else.

## Architecture

### Monorepo layout

- `apps/api` — NestJS backend, the single source of truth. Everything else is a client of it.
- `apps/web` — Next.js (App Router) customer storefront: catalog browsing, top-up wizard, auth, order history.
- `apps/admin` — Vite + React ops console: catalog CRUD, order management, staff/roles, API keys, live dashboard, API docs browser.
- `packages/types` — Zod schemas + shared TS types (DTOs, enums) for every API request/response shape.
- `packages/api-client` — one typed `ApiClient` class wrapping `fetch`, consumed by web and admin (and, later, a React Native app). Do not call the API directly from app code — add a method here instead so all clients stay in sync.
- `packages/config` — shared `tsconfig.base.json`.

### Critical build-order gotcha

`packages/types` and `packages/api-client` are compiled (`tsc`, `module: NodeNext`, ESM with explicit `.js` extensions in relative imports) — they are **not** consumed as raw TS source. If you edit either package, rebuild it before the change is visible to `apps/*`:
```bash
cd packages/types && npx tsc -p tsconfig.json
cd packages/api-client && npx tsc -p tsconfig.json
```
`turbo run dev` handles this automatically via `dependsOn: ["^build"]` in `turbo.json`. If you run an app's dev server directly (`pnpm --filter ... dev`) after editing a shared package, rebuild it manually first or you'll get stale-type or module-resolution errors. (This ESM/NodeNext setup — not plain CJS — is deliberate: it's what makes the same `dist` work correctly from Nest/Node, Next/webpack, and Vite/esbuild without per-bundler workarounds. Plain CommonJS dist broke Vite's named-export detection for the linked workspace package.)

### Backend module map (`apps/api/src`)

Each folder is a self-contained Nest module: `auth`, `catalog`, `orders`, `payments`, `users`, `api-keys`, `partner`, `admin-stats`, `queue`, `prisma`. Cross-cutting guards/decorators live in `auth/guards` and `auth/decorators` (`JwtAuthGuard`, `RolesGuard` + `@Roles(...)`, `@CurrentUser()`).

**Domain model** (`prisma/schema.prisma`): `User` (role: CUSTOMER/SUPPORT/MANAGER/ADMIN — staff and customers are the same table), `Service` (catalog item, e.g. TMCELL), `Rate` (per-service, per-currency conversion), `PaymentMethod`, `Order` (attributed to either a `User` **or** an `ApiKey`, never both), `Payment`, `TopupJob`, `ApiKey`, `AuditLog` (model exists, not yet written to). A second vertical lives alongside the top-up core: `GalleryCategory`/`GalleryProduct`/`GalleryOrder` (a flowers/gifts marketplace), `Seller`/`SellerApplication`/`WithdrawalRequest` (multi-vendor onboarding + payouts — a `Seller` links a Telegram chat via a one-time code to get order notifications), and `Referral`/`ReferralSettings` (customer- and seller-sourced referrals, configurable TMT rewards). Plus CMS-ish content the admin manages without a redeploy (`Story`, `HomeSlide`, `SocialLink`, `ContentPage`), support chat (`SupportThread`/`SupportMessage`), conversations (`ChatRoom`/`ChatMember`/`ChatMessage` — see "Chat" below), `Storefront` (a seller's own sections of their shop), and `ManagedSubdomain` (see below).

**Auth**: JWT access token (short-lived) + opaque refresh token (hashed, stored in `RefreshToken`, rotated on use). `packages/api-client` auto-retries a 401 once via `/auth/refresh` before giving up and calling `onSessionExpired`. Partner requests use a completely separate mechanism — see below.

**Order lifecycle**: `PENDING_PAYMENT → PAID → PROCESSING → COMPLETED | FAILED`, with `CANCELLED`/`REFUNDED` reachable from most states. Allowed admin-triggered transitions are whitelisted in `orders/order-state-machine.ts` (`ADMIN_ORDER_TRANSITIONS`, checked via `common/state-machine.ts`) — don't bypass this map. Payment confirmation (`PaymentsService.confirmPayment`) enqueues a BullMQ job (`queue/queue.module.ts`, queue name `topup-queue`); `orders/topup.processor.ts` is the worker that calls an `OperatorGateway` (selected at startup by `orders/operator-gateway.provider.ts`, see "Top-up fulfilment" below) and flips the order to `COMPLETED`/`FAILED`/neither. Swap the gateway implementation to integrate a real operator/reseller API — nothing else in the order flow needs to change. A third outcome exists: `UNKNOWN` deliberately leaves the order in PROCESSING rather than guess, because the operator may have received the request before the connection died.

**Payments** are provider-pluggable: `PaymentProvider` interface + `PaymentProviderRegistry`, currently only `ManualPaymentProvider` (admin manually confirms). **No acquirer has been chosen** — a YooKassa adapter was written and then removed on 2026-09-07 rather than carry a vendor commitment nobody had made. What stayed is the whole provider-neutral pipeline around the boundary: a durable per-order `PaymentInitiationGuard` (an unresolved attempt can't be charged twice), the `Payment` row written *before* the provider call with `UNKNOWN` on an ambiguous network outcome, a verified webhook inbox (`PaymentEvent`, deduplicated on the provider's own event id), a reconciliation sweep, and off-site redirect return (`/payment/return`). Adding an acquirer is one file in `providers/`, one line in the registry, one `PaymentMethod` row — [ADR-0005](docs/adr/0005-real-provider-adapters.md) has the checklist.

**A refund obligation is never inferred from losing a race.** Both API hosts run the reconciliation and webhook-replay loops against the *same* primary database, so one payment being settled twice concurrently is routine, not evidence of a double charge. `confirmPayment` decides `requiresRefund` from the existence of a second SUCCEEDED payment on the order. The first version decided it from `claimed.count === 0`, which asked operators to refund correctly-paid orders.

**Top-up fulfilment fails closed.** `TOPUP_GATEWAY` (`""` | `mock` | `http`) picks the adapter; unset means a paid order is never sent anywhere and sits in PROCESSING until the `orders-stuck-sent` alert fires at 30 minutes. `mock` marks orders COMPLETED without contacting anyone, so in production it additionally requires `TOPUP_ALLOW_MOCK_IN_PRODUCTION=true` — currently set on both hosts because there are no real customers yet, and **meant to be deleted at launch**. `.github/workflows/set-topup-gateway.yml` writes both. Every start logs which adapter is live; read that line rather than assuming.

**Partner API** (`partner/`): external platforms authenticate via `X-Api-Key` header (`ApiKeyGuard`, hash-compared against `ApiKey.keyHash`) instead of JWT, hitting `/partner/catalog/*` and `/partner/orders`. This is the wholesale/B2B resale channel — same catalog, rates, and order pipeline as consumer orders, just a different attribution (`Order.apiKeyId` instead of `Order.userId`). Keys are managed from the admin app (`apps/admin/src/pages/api-keys.tsx`); the raw key is shown exactly once at creation, only a hash is ever persisted.

**Seller API** (`seller-api/`): the same `X-Api-Key` mechanism, but the key carries a `sellerId` and every route reads the shop off the key rather than off a path parameter — so there is no request shape that reaches another shop's data. `ShopKeyGuard` refuses a key with no shop, because a partner key reaching a null `sellerId` would make the queries below it mean "everything with no shop", i.e. the house stock. Scopes are a separate list from the partner ones (`products:*`, `shop-orders:*`, `chat:*`) because the same word means different things on the two surfaces: a partner's `orders:read` is top-up orders it placed, a shop's is somebody buying a bouquet. Sellers mint their own keys from `/seller/api-keys`, capped and restricted to shop scopes; the documentation lives at `/seller/api-docs` and is written by hand, not generated. The chat methods it calls are shop-scoped on purpose (`shopThreads`, `shopChannels`, …) rather than the cabinet's user-keyed ones, which would have exposed the owner's own private conversations to a key issued for automation.

**API versioning**: `main.ts` enables URI versioning with `VERSION_NEUTRAL` as the default, so every first-party route keeps its exact path — web and admin ship in the same deploy, and a version segment on them would be a number nobody reads. Only the two key-authenticated surfaces opt in: `/api/v1/seller-api/*` (versioned from its first day, no unversioned path) and `/api/v1/partner/*` (which also still answers on `/api/partner/*`, with `Deprecation`/`Sunset`/`Link` headers set by middleware — middleware, not an interceptor, because guards run first and a rejected request must still see them). What may change inside a version and what needs a new one is written down in [`docs/API_GOVERNANCE.md`](docs/API_GOVERNANCE.md) Part D.

**Never `include`/`select: true` a `User` or `ApiKey` relation wholesale in a response** — both carry secrets (`passwordHash`, `keyHash`). Always use an explicit `select` picking only safe fields (see `DETAIL_INCLUDE` in `orders.service.ts` or `SAFE_SELECT` in `users.service.ts` / `api-keys.service.ts` for the pattern). This has already bitten us once — the fix is in those files' `select` clauses; keep new includes consistent with them.

**Admin stats/dashboard**: `admin-stats.service.ts` aggregates order counts, BullMQ queue depth, and a daily time series via raw SQL (`$queryRaw`, `date_trunc`) — summed on `amountTmt` (the manat amount), not `amountCharged`, since orders are paid in different currencies that can't be summed directly.

**Social feed** (`social-feed/`): the full-screen commerce feed. Three rules hold it together, and each one is written down because breaking it has already cost something.

*Chronology decides membership, ranking decides only order.* `nextCursor` is a point in publication time, so anything allowed to drop a post from a page drops it for good — the per-author cap used to do exactly that while the cursor moved past what it skipped, and a feed where one seller writes everything served two posts and declared itself over. `list` fetches the page plus one row (the extra one is what proves a next page exists) and hands the whole thing to `rankPage`.

*Ordering lives in `ranking.ts`* — pure functions over plain rows, no Prisma and no clock, which is the only reason the weights are testable. Five capped signals (author affinity from the viewer's own history, product affinity, engagement smoothed per view, format, a 36-hour recency half-life), hand-tuned, no learned weights. Every number and what to do with it once there is traffic to measure: [`docs/FEED_RANKING.md`](docs/FEED_RANKING.md).

*An author sees their own posts through `GET /social-feed/mine`, not through the feed.* Pending and rejected posts appear nowhere else, so without it someone who published and saw nothing could not tell a moderation queue from a refusal. That route sends `canEdit`/`canDelete` decided by the same rules `updateMine`/`removeMine` enforce, so a client's buttons cannot drift from what the server will allow.

Feed items carry the author's shop handle only when that shop is open, and the mobile app caches video *files* on the device while every number on a post — likes, saves, views — keeps coming from the API on each load (`apps/mobile/lib/core/media/video_cache.dart`; it prefetches the next two posts, never the one playing, and every failure path ends in "stream it instead").

**Chat** (`chat/`): one inbox merging two stores — group rooms in `ChatRoom`, and the existing per-seller and support conversations in `SupportThread`, which the admin console and seller inbox already read. The merge happens in `ChatService.inbox` so neither existing surface had to be rewritten and the app sees one list. Room kinds: a **group** is assembled (invite by link, `ChatRoom.inviteCode`, replaceable so a leaked link can be revoked without deleting the conversation); a **channel** is one writer and many subscribers, owned by a shop; and a channel carrying `officialCategory` (`NEWS`/`PROMOTIONS`/`SECURITY`) is a platform announcement channel where nobody may post through the ordinary route, its creator included. Official identity comes from that server-assigned column and never from a title, so a user cannot name their group "Official security" and wear the badge — a database CHECK ties the column to a shop-less channel. Message windows load newest-first and are reversed for display: `take: 200` with ascending order returned the *oldest* two hundred, so a long conversation never showed anything recent.

### Frontend conventions

Both `apps/web` and `apps/admin` follow the same pattern: a `lib/api.ts` instantiates `ApiClient` from `@topup-hub/api-client` with an app-specific `TokenStore` (localStorage-backed) and an `onSessionExpired` callback that redirects to `/login`. UI primitives (`Button`, `Card`, `Input`, `Select`, `StatusBadge`) live under each app's own `components/ui/` — duplicated rather than shared as a package, since the two apps' design needs diverged slightly (deliberate, not an oversight).

Design system: brand gradient (`from-brand-*` violet to `accent-*` teal) defined via Tailwind config + a few CSS utility classes (`.bg-hero-gradient`, `.text-gradient`, `.bg-gradient-brand`, `.bg-gradient-brand-soft`) in each app's global CSS. Keep gradients as static CSS (no JS animation, no `backdrop-filter` blur stacks) — that was an explicit performance constraint, not just a style choice.

### Local dev networking gotchas

- `apps/api/.env` `CORS_ORIGINS` must list whatever origins the frontends actually run on. Ports drift in practice (something else on the machine may already hold 3000 or 5173) — if a frontend dev server logs a different port than expected, add that exact origin (including `127.0.0.1` vs `localhost` — browsers treat them as different origins) to `CORS_ORIGINS` and restart the API.
- On Windows, a fresh `pnpm install` will prompt to approve build scripts for native deps (`prisma`, `argon2`, `esbuild`, `sharp`, etc.) — approve them in `pnpm-workspace.yaml`'s `allowBuilds` map; this is a one-time step.

## Production deployment

> **Migrated (2026-08-24/25).** Production now runs entirely on `DEPLOY_HOST` (SmartApe, 6
> vCPU / 3.8 GiB, Ubuntu 26.04) — DNS (`*.gulyaly.pro` wildcard, low TTL) points here. The old
> reg.ru box (`OLD_VPS_HOST`) is no longer part of the serving path; its future role is
> undecided (a dedicated new VPS took over the warm-standby/mail role instead — see below). No
> IP or hostname is hardcoded anywhere in workflows/compose files — everything reads
> `secrets.DEPLOY_HOST`/`DEPLOY_USER` (and `SECONDARY_HOST`/`SECONDARY_USER`, `OLD_VPS_HOST`/`OLD_VPS_USER`)
> so this can migrate again without touching committed files.

Push to `main` → `.github/workflows/deploy.yml` does everything: typecheck/build gate, then `build-images` builds the 3 Docker images (`apps/{api,web,admin}/Dockerfile`, built from the repo root since they need `packages/*`) **in parallel matrix legs**, each with its own GHA layer-cache scope, and pushes them to **GHCR tagged by commit SHA** (plus `:latest`); then `deploy` SSHes to the VPS, writes that SHA into `IMAGE_TAG` in `/opt/gul/.env`, and runs `docker compose pull && up -d` + `prisma migrate deploy`. The `push` trigger is scoped with `paths:` to things that actually affect the deployed app (`apps/**`, `packages/**`, `docker-compose.prod.yml`, lockfiles, `turbo.json`, or `deploy.yml` itself) — an unrelated one-off ops workflow or an `infra/nginx` tweak no longer kicks off a full rebuild+redeploy.

- **Immutable SHA tags exist for rollback**: the deploy step records the outgoing `IMAGE_TAG` first and, if the new one fails its health check, automatically reverts `IMAGE_TAG` to the previous value and redeploys rather than leaving prod broken.
- *This replaced an earlier `docker save | scp | docker load` scheme.* That handed a ~470MB `images` artifact between two jobs on every run and was single-handedly blowing through the account's 0.5GB Actions **storage** quota days into each billing cycle. GHCR is a separate quota, reuses unchanged layers, and — the real win — makes previous builds addressable for rollback. Don't reintroduce artifact-passing for images.

- **Server**: `deploy` user (docker group, no sudo), key-based via `DEPLOY_SSH_KEY`. App lives in `/opt/gul`. Root/manual access is whatever the hosting panel's console provides — there's no separate root key workflow for this box (unlike the old reg.ru one).
- **`/opt/gul/.env`**: real production secrets (DB password, JWT secrets, `TELEGRAM_BOT_TOKEN`, `CORS_ORIGINS`, mail creds, `GH_ACTIONS_TOKEN`/`GH_REPO`/`PROVISION_CALLBACK_SECRET` for the subdomains feature). Lives only on the server, never committed — `docker-compose.prod.yml` (committed) references it via `env_file`.
- **Domains**: `gulyaly.pro`/`www.` → web, `admin.gulyaly.pro` → admin, `api.gulyaly.pro` → api. Routing is host-level Nginx (not containerized) + Certbot-issued Let's Encrypt certs; containers only bind `127.0.0.1:<port>`. Nginx vhosts live in [`infra/nginx/`](infra/nginx/) — edit them in the repo, not on the server; pushing a change under `infra/nginx/**` (or a manual dispatch) auto-runs `.github/workflows/sync-nginx.yml`, which ships every `*.conf` there to `/etc/nginx/sites-available/`, symlinks it into `sites-enabled`, and reloads (via the docker-chroot privilege trick below, since `deploy` has no sudo). `gulyaly-subdomain-fallback.conf` is the `default_server` catch-all for any `*.gulyaly.pro` hostname that isn't one of the three real vhosts or a currently-managed subdomain — branded page, auto-redirects to the main storefront after 5s. Certs use webroot (`/var/www/certbot`) for renewal rather than certbot's nginx plugin, so certbot never rewrites these static files.
- **The `deploy` user has no sudo, but IS in the `docker` group** — already root-equivalent on the host (well-known docker caveat: `docker run --privileged` + `chroot` lets any docker-group member act as real host root). Every workflow that needs to touch `/etc`, systemd, or ufw uses this pattern: build a plain shell script via `echo` lines into a temp file first (not a heredoc — heredocs inside a GH Actions `run: |` block and inline nested quoting have both caused real bugs this way), then `docker run --rm --pid=host --privileged -v /:/host alpine chroot /host /bin/sh <script>`. Firewall (`ufw`) operations additionally need `--network=host` on that same `docker run` — `--pid=host` alone puts you in the host's process namespace but not its network namespace, so `ufw`/iptables would otherwise affect only the throwaway container's own isolated network stack.
- **SSL renewal is fully automatic, no manual `certbot` runs needed**: `certbot.timer` (from the apt package) renews existing certs twice daily; `gul-cert-sync.timer` (source in [`infra/ssl/`](infra/ssl/README.md), installed by `install-cert-sync.yml`) runs daily and re-expands the cert to cover every `server_name` currently in `/etc/nginx/sites-enabled/*.conf`, **on both hosts** — sync-nginx.yml ships the same vhosts to primary and secondary, so both need the same domain set kept covered. This README claimed the timer was live from 2026-08-21; it never actually had an install workflow and `drift.sh` found it absent on both machines on 2026-09-03, which is how a stray test vhost went on serving an invalid certificate until someone happened to check. `.github/workflows/certbot-once.yml` is the original manual bootstrap workflow this superseded for renewal/expansion — still there for a from-scratch cert on a brand-new domain.
- **Managed subdomains** (admin console → Subdomains tab): staff add `{name, targetPort}`; the API (`apps/api/src/subdomains/`) writes a `PENDING` `ManagedSubdomain` row and dispatches `.github/workflows/provision-subdomain.yml` via the GitHub REST API (needs `GH_ACTIONS_TOKEN`, a fine-grained PAT scoped to this repo with Actions read/write, in `/opt/gul/.env`). That workflow writes the nginx vhost + issues an HTTP-01 cert (same docker-chroot trick) and reports the result back to `POST /admin/subdomains/callback`, authenticated by a shared secret (`X-Provision-Secret` header vs. `PROVISION_CALLBACK_SECRET`) rather than a JWT, since GitHub Actions is calling it, not a logged-in user.
- **Payment idempotency**: `PaymentsService.initiate` writes the `Payment` row (status `initiating`, holding a fresh `idempotencyKey`) *before* calling `provider.initiate()`, then updates it after. If the process dies between "provider accepted the charge" and "we recorded that," the row already exists for reconciliation instead of the charge vanishing from our side. Any real (non-`manual`) `PaymentProvider` should accept and forward that same idempotency key to its gateway so a safe retry can't double-charge.
- **Graceful shutdown**: `main.ts` calls `app.enableShutdownHooks()` — without it, `SIGTERM` (sent by `docker compose up -d` recreating the container on every deploy) killed the process immediately, cutting off in-flight requests instead of letting them finish.
- **`NEXT_PUBLIC_API_URL` / `VITE_API_URL`** are build-time values baked into the web/admin bundles — set as Docker build-args in the workflow (`API_PUBLIC_URL` env at the top of `deploy.yml`), not at container runtime. Changing the API's public URL means editing the workflow, not the server `.env`.
- **Logs**: `ssh deploy@OLD_VPS_HOST`, then `cd /opt/gul && docker compose logs -f <service>`.
- **Manual migration/seed**: `docker compose run --rm api npx prisma migrate deploy` (the deploy pipeline already does this on every push).
- **Database backups**: hourly `pg_dump` via `gul-db-backup.timer`, uploaded to the
  **private** reg.ru S3 bucket (`s3://$S3_PRIVATE_BUCKET/db-backups/`) and then deleted from the
  server's disk; 30-day retention, expired by the date in the object name — source of truth in
  [`infra/backups/`](infra/backups/README.md). Nothing is kept locally on purpose: dumps sitting
  beside the database they exist to replace do not survive losing the box, and this is the one
  machine where filling the disk has already taken the site down. The only file ever left in
  `/opt/gul/backups` is one whose upload failed, and the unit exits non-zero when that happens.
  **The systemd units live on the server, not in an image** — a VPS migration silently takes the
  backups with it, which is exactly what happened between the August migration and 2026-09-02,
  when no backup had run at all. Reinstall with `.github/workflows/install-db-backup-s3.yml`.
- **An import that TypeScript resolves is not a dependency you have.** `common/body-parsing.ts`
  imported `express`, which `apps/api/package.json` never declared: pnpm exposed it transitively
  in development, `@types/express` satisfied the compiler, typecheck was clean and 442 tests were
  green (unit tests never load `main.ts`). The production image then died on its first line with
  `Cannot find module 'express'` — *after* `prisma migrate deploy` had already converted the
  schema, so the pipeline rolled the image back onto a database the old code could not read.
  `scripts/check-architecture.mjs` now fails on any bare import in `apps/api/src` that the API's
  own manifest does not declare. Pin such a package to exactly what Nest uses (`express` is
  `4.22.1`, matching `@nestjs/platform-express`) — a second major in the tree gives Nest and our
  own middleware two different instances.
- **An image rollback restores code, never schema.** prisma has no `migrate down`, and
  `/api/health` is `SELECT 1` plus a Redis ping, so it happily passes on old code running against
  a converted schema and the run prints "rolled back successfully" over a broken release. The
  deploy job now diffs the migrations between **the tag actually running on the server** and the
  release, and refuses the automatic rollback when any of them carries
  `migration-policy: allow-destructive`. Comparing against the previous *push* is not enough:
  `migrate deploy` applies every *pending* migration, so a release whose own diff touches no
  migration can still apply one an earlier failed deploy left behind — which is exactly how the
  first version of this guard reported `false` while the destructive migration ran.
- **`SSH_KNOWN_HOSTS`** (repo secret) pins both hosts' keys; the workflows no longer `ssh-keyscan`
  on every run. It was introduced without being created, which hard-blocked the deploy at "Set up
  SSH" — if a host is ever rebuilt, its key changes and this secret must be updated or every
  deploy fails there.
- *Deliberate trade-off*: the build stage installs the whole pnpm workspace rather than using `turbo prune` — bigger images, but no risk of a missing transitive workspace dependency on a first production setup.

### Secondary VPS: active/active app tier + streaming replica

A second, dedicated VPS (`SECONDARY_HOST`/`SECONDARY_USER` secrets; bootstrapped the same way as
primary — `deploy` user, docker, SSH key, **password auth deliberately left enabled** on this one
per an explicit ask, unlike the old reg.ru box) runs:

- **api/web/admin continuously** (`enable-active-active.yml`), pointed at the **primary's**
  Postgres over the network rather than its own local standby — genuinely active/active for the
  app tier: a crash of primary's containers alone needs no failover procedure at all, since the
  secondary is already correctly serving. Full reasoning:
  [`HIGH_AVAILABILITY.md`](docs/architecture/HIGH_AVAILABILITY.md).
- **A streaming Postgres replica**: a bare `pg-standby` container (not part of any compose
  project), bootstrapped once via `pg_basebackup -R` against the primary and continuously
  streaming since — stays read-only/unused day-to-day (the secondary's own app containers talk to
  primary's DB, not this one) until an actual `failover-to-secondary.yml` promotion. The primary's
  `docker-compose.prod.yml` publishes `5432`, and `6379` alongside it since the shared queue.
  **`ufw` does not protect either of them, and believing it did left the database open to the
  internet from August until 2026-09-03.** Docker publishes a port by writing its own iptables
  rules, and packets to a published port meet docker's chains in the FORWARD path before ufw's
  filter rules are consulted — so a `ufw allow from <secondary>` on such a port appears in
  `ufw status`, reads as a restriction, and stops nothing. What actually restricts them is
  `gul-docker-firewall.service`/`.timer` (source in [`infra/firewall/`](infra/firewall/), installed
  by `install-docker-firewall.yml`), which writes DROP rules into `DOCKER-USER` — the chain docker
  consults first and does not rewrite — and re-asserts them every ten minutes, since a daemon
  restart can drop them silently. **ufw still governs ports served by host processes** (nginx,
  sshd, netdata's 19999), which is why 19999 was correctly closed while 5432 was not; that
  contrast is the quickest way to tell the two cases apart. Verify from outside, never from either
  server: `check-exposed-ports.yml` runs on a GitHub runner, because the secondary is allowed
  through and a laptop on a VPN reports every port open. Role/credentials: a `replicator` role
  (`REPLICATOR_PASSWORD` secret) for streaming, plus the normal app DB user allowed from the
  secondary's IP for active/active traffic — both scoped in `pg_hba.conf`.
- **nginx, already installed and holding current certs** — copied from primary
  (`prepare-secondary-failover.yml`), actually serving the active/active app traffic today (not
  idle) whenever DNS sends anything here — see the DNS gap below.
- **`/opt/gul-secondary/`**: `docker-compose.secondary.yml` (app containers only — no postgres, and
  since 2026-09-03 no redis either: both nodes share the primary's queue, because a queue per node
  meant an order accepted here was invisible to the other node's worker and to the admin console's
  backlog) + a `.env` copied
  from primary's but with `DATABASE_URL`'s host rewritten to primary's real IP (not the local
  `postgres` alias, which is reserved for post-failover use).

**What's still needed for real traffic to reach it**: DNS today only ever hands out primary's IP
(the `*.gulyaly.pro` wildcard) — add a second A record for `gulyaly.pro` pointing at the
secondary's IP for client-side failover to actually kick in. This is a manual, one-time DNS-panel
step (no API access available to automate it), same category as the mail-relay DNS gap below.

**To fail over** (primary's *database* is gone, not just its app tier — a crashed app tier alone
needs nothing, see above): run `.github/workflows/failover-to-secondary.yml` with
`confirm: FAILOVER` — it calls `pg_promote()` on the standby (irreversible: it stops following the
primary), repoints the *already-running* app containers' `DATABASE_URL` from primary's (dead) IP
to the now-writable local database, and health-checks the API. **DNS is not touched automatically**
(rejected earlier as a split-brain risk with only two nodes) — if the second A record above isn't
in place yet, the last step is manually pointing `gulyaly.pro` at the secondary; TTL is already
low. Rerun `prepare-secondary-failover.yml` beforehand if it's been a while, so certs/`.env` are
current (it also keeps `.env`'s `DATABASE_URL` pointed at primary, consistent with active/active,
rather than resetting it back to the local standby). Known gap: the uploads volume isn't synced to
the secondary, so failover serves current database state but stale/missing uploaded files until
that's addressed. **Failback** (old primary rejoining after a promotion) isn't automated — its WAL
has diverged, so it needs a manual re-base before it can safely take writes again; treat it as
untrusted for writes until that happens.

### Mail relay: outgoing SMTP on the secondary

`setup-mail-relay.yml` installs Postfix on the secondary as an authenticated submission relay
(port 587, SASL, STARTTLS) and points the primary's `MAIL_HOST` at it. Port 587 is firewalled to
the primary's IP only; port 25 is explicitly denied (this relay only sends the app's own outgoing
mail, it doesn't need to receive any). `MAIL_HOST` is still the secondary's raw IP with a pinned
self-signed cert (`MAIL_TLS_CA_BASE64`/`MAIL_TLS_SERVERNAME` in `email.service.ts`) rather than a
real Let's Encrypt cert + hostname — now that `mail.gulyaly.pro` resolves correctly (see below),
this could be swapped for a real cert via `certbot-once.yml`, just not done yet.

**DNS is now scriptable — see "DNS management" below.** `gulyaly.pro`'s A/wildcard records, the
`mail` A record, SPF (merged into Timeweb's existing record), and the DKIM public key were all
published via `manage-dns.yml` on 2026-08-27. DKIM signing itself (OpenDKIM + Postfix milter on
the secondary, domain `gulyaly.pro`, selector `mail`) is live and verifiable by recipients — but
only since 2026-09-05. It was **claimed** live from 2026-08-27 and was not: `setup-dkim.yml`
wrote a wildcard `SigningTable` without the `refile:` prefix that makes a wildcard a pattern, so
every message left unsigned while opendkim logged nothing at default verbosity. Caught only by
reading a delivered message's headers (`dkim=` absent from `Authentication-Results` entirely).
DMARC passed the whole time on SPF alone, which is why nothing looked wrong. If you touch DKIM,
verify by reading real headers — `systemctl is-active opendkim` proves nothing. DMARC already existed (`_dmarc.gulyaly.pro`, `p=none`) from Timeweb's
own defaults — left as-is, that's the correct safe starting posture.

**Marketing mail is split onto its own sending identity** (`newsletter.gulyaly.pro`), so spam
complaints on a broadcast can't hurt deliverability for transactional mail (order confirmations,
codes). `EmailService` (`apps/api/src/email/email.service.ts`) holds two independent
`nodemailer.Transporter`s sharing the same relay/TLS config but different SASL logins
(`MAIL_USER`/`MAIL_PASS` vs `MAIL_USER_MARKETING`/`MAIL_PASS_MARKETING`); `sendMarketingBroadcast`
uses the marketing one and `MAIL_FROM_MARKETING`. DKIM uses a separate selector (`news2026` on
`newsletter.gulyaly.pro`, vs `mail` on `gulyaly.pro`) and its own SPF record — see
[DNS_CHANGELOG.md](docs/architecture/DNS_CHANGELOG.md) for how those records were added (and one real gotcha:
registering the subdomain auto-attached a duplicate default SPF record that broke delivery until
removed). Postfix enforces the split: `smtpd_sender_login_maps` +
`smtpd_sender_restrictions = reject_sender_login_mismatch` (enabled 2026-08-28,
`enable-sender-login-mismatch.yml`) reject any message whose envelope sender isn't owned by the
SASL account that authenticated — confirmed live (`553 5.7.1 ... Sender address rejected: not
owned by user ...`). The `newsletter` SASL account's password is rotated via
`rotate-newsletter-password.yml` / the rotation step built into
`enable-sender-login-mismatch.yml` — generated on the runner and written straight to
`MAIL_PASS_MARKETING` (GitHub secret + prod `.env`), never surfaced in chat or logs.

### DNS management: Timeweb Cloud API

`gulyaly.pro` was registered at reg.ru but its NS records now point at Timeweb Cloud
(`ns1/ns2.timeweb.ru`, `ns3/ns4.timeweb.org`) — Timeweb is the actual authoritative DNS, reg.ru is
just the registrar. This is scriptable: `manage-dns.yml` calls `https://api.timeweb.cloud` with a
Bearer token (`TIMEWEB_API_TOKEN` secret, from https://timeweb.cloud/my/api-keys) — **no IP
allowlisting required**, unlike reg.ru's own API (which is why every DNS change before
2026-08-27 needed a manual DNS-panel step; that limitation is gone for anything on Timeweb NS).

Real gotchas hit building this (all fixed in `manage-dns.yml`, worth knowing before writing more
API calls by hand):
- **Don't send a `subdomain` key in the record-creation body.** The target hostname belongs in
  the URL path instead: `POST /api/v2/domains/{fqdn}/dns-records` where `{fqdn}` is the *specific*
  record name (`mail.gulyaly.pro`, `*.gulyaly.pro`, etc.), not always the base domain. Sending
  `subdomain` in the body errors `400 property subdomain should not exist`.
- **A subdomain must be registered as its own resource before a record can be attached to it** —
  `POST /api/v1/domains/{fqdn}/subdomains/{label}` (no body), *then* the dns-records POST above.
  Skipping this errors `404 domain_not_found` on the record create. The apex domain itself needs
  no such registration.
- **Wildcard subdomain is literally `*`**: `.../subdomains/*` then `.../domains/*.gulyaly.pro/dns-records`.
- **Registering a subdomain auto-attaches Timeweb's own default SPF/MX/DMARC-style records to
  it** — harmless clutter for names that don't send mail as themselves (our mail is sent as
  `noreply@gulyaly.pro`, the apex, so only the apex's SPF record matters), but don't be surprised
  to see it in a `GET .../dns-records` listing.
- **Never add a second SPF `TXT` record** — multiple SPF records for one name is invalid per
  spec and breaks the check entirely. `gulyaly.pro` already had Timeweb's own SPF
  (`include:_spf.timeweb.ru`, for Timeweb's own MX-based mail hosting on this domain — real MX
  records exist, so don't touch them either) — `PATCH` the existing record to append
  ` a:mail.gulyaly.pro` rather than creating a new one.
- A `run: |` block containing an unindented multi-line string (e.g. a bare `python3 -c "..."`
  heredoc starting at column 0) breaks the YAML block scalar and silently invalidates the *whole*
  workflow file — GitHub then reports the confusing `422 Workflow does not have 'workflow_dispatch'
  trigger` on dispatch instead of a YAML error. If that error shows up on a workflow that clearly
  has `on: workflow_dispatch:`, check for exactly this — a bare `:` inside an unquoted `name:`
  string (e.g. `- name: Fix DMARC: delete and recreate`) triggers the identical symptom too (YAML
  reads the second `:` as starting a new mapping key). Validate locally before re-pushing:
  `python -c "import yaml; yaml.safe_load(open('.github/workflows/x.yml'))"` (note: `python`, not
  `python3`, is what's on PATH in this environment) — cheaper than a round-trip through GitHub's
  confusing error.
- **`PATCH .../dns-records/{id}` cannot relocate a record — the `subdomain` field is not
  updatable via PATCH, whether or not you include it in the body.** Discovered 2026-08-29:
  PATCHing a record's `value` with no `subdomain` in the body silently reset it to `null` (moved
  a `_dmarc.gulyaly.pro` record to the bare apex); a second attempt with `"subdomain": "_dmarc"`
  explicitly in the body did *not* move it back — still `null`. The SPF-merge PATCH earlier in
  this file works fine only because that record's subdomain was already `null` (apex) to begin
  with, so nothing moved. **To relocate a record (or to update the value of any record that isn't
  at the apex), DELETE it and recreate it fresh at the correct fqdn** — PATCH is only safe for
  updating the *value* of a record that's already at the exact name you want it to stay at.
