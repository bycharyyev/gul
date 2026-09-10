# Gulyaly — project & security report

> Historical audit snapshot dated 2026-08-26. For the current runtime topology and known
> limitations, use [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md). In particular, the
> secondary application tier later became active/active and production uploads moved to S3.

Written from a direct read of the code (models, controllers, services, workflows, configs), not
from documentation claims. Dated 2026-08-26.

## 1. What the project is

Gulyaly is a Turkmenistan-market marketplace running **two independent consumer verticals** on
one shared backend, plus a B2B channel:

1. **Top-ups** — mobile-operator/digital-service credit (`Service`/`Rate`/`Order`/`Payment`/
   `TopupJob`). A customer pays, the order is queued (BullMQ), and a worker calls an
   `OperatorGateway` to deliver credit to a phone number or account ID. Delivery now fails closed
   until a real adapter is configured; the mock is explicit and forbidden in production.
2. **Gallery** — a flowers/gifts marketplace layered on top of the same order/payment machinery
   but with its own models (`GalleryCategory`/`GalleryProduct`/`GalleryOrder`). Independent
   **sellers** (`Seller`) list products, hold a running TMT balance, and request payouts
   (`WithdrawalRequest`); a seller gets Telegram notifications once they link their account via a
   one-time code.
3. **Partner API** — external reseller platforms hit the same catalog/order pipeline via
   `X-Api-Key` instead of JWT (`ApiKeyGuard`, hash-compared, never the raw key at rest).

Supporting systems: an in-app support chat, admin-managed marketing content (home slides,
"stories", social links, static pages), a referral program paying TMT rewards to whichever
customer or seller referred a new user, and a "Managed Subdomains" feature letting staff
provision a new `*.gulyaly.pro` vhost + TLS cert from the admin UI with no server access.

## 2. Technology

| Layer | Technology | Notes |
|---|---|---|
| API | NestJS (Node/TS) | Single source of truth; Swagger at `/docs` |
| Storefront | Next.js (App Router) | |
| Admin console | Vite + React | |
| Database | PostgreSQL 16 (Prisma ORM) | Migrations hand-authored where a local DB wasn't available, otherwise `prisma migrate` |
| Queue | Redis + BullMQ | Not authoritative for money — see §5 |
| Shared contracts | Zod (`packages/types`) + a typed fetch client (`packages/api-client`) | Every client (web/admin/future mobile) shares one contract |
| Auth | JWT access + rotated opaque refresh tokens; separate API-key mechanism for partners | |
| Containers/CI | Docker, GitHub Actions → GHCR (SHA-tagged) → SSH deploy with health-check + auto-rollback | |
| Reverse proxy | Host nginx + Certbot, vhosts version-controlled in `infra/nginx/` | |
| Monitoring | Netdata (auth-gated), UptimeRobot, a 30s watchdog timer (see §4) | |

## 3. Architecture reality (not aspiration)

Two VPS, both bootstrapped identically from GitHub Actions (no hand-configured server):

- **Primary** (`DEPLOY_HOST`) — serves all production traffic: api/web/admin containers,
  read-write Postgres, Redis, live nginx+TLS.
- **Secondary** (`91.184.250.89`) — warm standby, different subnet from primary. Streaming
  Postgres replica (async), app containers shipped but not running day-to-day, nginx/TLS already
  installed and idle. Full reasoning and the failover runbook: see
  [`HIGH_AVAILABILITY.md`](HIGH_AVAILABILITY.md).

**True active/active is not implemented and isn't currently achievable without new
infrastructure**: the two VPS are on different subnets (no floating-IP/VRRP failover possible —
that's an L2 mechanism), and there's no DNS-provider API access to automate a routing switch. A
routing/load-balancer layer capable of splitting live traffic across both nodes doesn't exist yet.
Failover today is a **manual, explicitly-confirmed** promotion + a hand-edited DNS record.

## 4. Reliability findings from real failure testing

A deliberate test killed the `api` container in production: **Docker's own
`restart: unless-stopped` policy did not re-engage** (`RestartCount` stayed at 0; a human had to
run `docker compose up -d`). Root cause wasn't confirmed (the deploy user can't read the full
systemd journal). Mitigation shipped and verified: an independent `gul-watchdog.timer` polls
`/health/ready` every 30s and re-runs `docker compose up -d` if it's failing
(`infra/watchdog/`). Treat this as a real, previously-invisible gap that would otherwise have
caused a silent full outage.

## 5. Financial-integrity audit

Money-adjacent code paths were read directly (not assumed correct) and these races were found
and fixed:

| Path | Bug found | Fix |
|---|---|---|
| Top-up delivery (`topup.processor.ts`) | No idempotency guard — a crash after the operator gateway accepted a charge but before the DB recorded it, followed by a BullMQ retry, could send the same top-up twice | Atomic `QUEUED → SENT` claim before calling the gateway; a retry past that point is refused, not resent. `jobId = orderId` adds queue-level dedup. Gateway exceptions now recorded as `FAILED` instead of leaving the job stuck. **Guarantee is at-most-once delivery, not exactly-once** — a genuine mid-send crash leaves the order in `PROCESSING` for manual reconciliation rather than risking a second real charge. |
| Gallery seller balance credit (`gallery.service.ts`) | Plain read-then-write on `DELIVERED` — two concurrent calls could both pass the check and double-credit | Atomic conditional update claims the status transition first |
| Withdrawal approve/reject | Same read-check-then-write pattern | Atomic claim; reject's balance refund now happens inside the same transaction |
| Payment initiation (`payments.service.ts`) | A crash between the payment provider accepting a charge and the DB recording it would lose the record entirely | `Payment` row (status `initiating`, holding an `idempotencyKey`) is written *before* calling the provider, not after — the row survives a crash for reconciliation, and the same key can be forwarded to a real gateway to make a retry safe |
| Referral rewards (`maybeRewardReferral`) | Checked — already used an atomic conditional claim correctly. No bug found. |
| `AuditLog` | Existed in the schema with **zero writes anywhere in the codebase** | Wired into payment confirmation, admin order-status changes, rate changes, seller application approve/reject, withdrawal approve/reject, gallery balance credits, referral settings changes, staff privilege changes |

**Not done**: seller balance (`Seller.balanceTmt`) is still a mutable running total, not a ledger
(append-only transaction log). The atomic-claim fixes above prevent the *known* double-write
races, but a ledger would be the more auditable long-term design if balance disputes ever need
forensic reconstruction. Flagged, not built — this is a real architecture decision, not a quick
patch.

## 6. Security audit

Findings, ranked by what actually matters for exploitability, not by tool-reported severity alone.

### Already solid (verified by reading the code, not assumed)
- **Auth**: JWT access secret fails the process at startup if unset — no insecure fallback
  (`auth/jwt-secret.ts`). Refresh tokens are opaque, hashed at rest, and rotated on use. Passwords
  hashed with argon2.
- **CORS**: fails *closed* — an empty `CORS_ORIGINS` disables cross-origin credentialed requests
  entirely rather than defaulting to allow-all.
- **Rate limiting**: a global throttle (120 req/min) plus tighter limits on
  login/register/refresh (10-20/min) — brute-force and credential-stuffing resistant.
- **IDOR**: payment/order/document endpoints check ownership (`userId` match) or staff role
  before returning data — checked `documents.service.ts`, `payments.controller.ts` directly.
- **File uploads** (`documents`, `avatar`): stored filename is a server-generated `randomUUID()`,
  never derived from the client-supplied name — path traversal via a crafted filename isn't
  possible. Mime-type allowlist on upload; downloads are forced `Content-Disposition: attachment`
  (a spoofed-mimetype HTML/SVG upload can't execute in-browser via this endpoint even if it got
  past the allowlist).
- **Raw SQL**: the only two `$queryRaw` call sites (`admin-stats`, `sellers` timeseries) use
  Prisma's tagged-template form with interpolated values — Prisma parameterizes these
  automatically; this is not string concatenation and is not SQL-injectable.
- **Partner API keys**: only a hash is persisted; the raw key is shown once at creation.
- **Subdomain-provisioning callback**: gated by a shared secret header instead of JWT (correct,
  since GitHub Actions calls it, not a logged-in user) — but see gap below.
- **Postgres exposure**: the primary's port 5432 is published, but `ufw` denies it from every
  source except the secondary VPS's specific IP.

### Fixed during the 2026-08-27 hardening pass

All five directly-actionable gaps from the previous pass are closed:

- **`helmet`** added in `main.ts` (CSP left off deliberately — this API serves JSON to separate
  web/admin frontends, not HTML it renders itself, and Swagger's `/docs` UI needs inline
  scripts/styles a strict CSP would break).
- **Provisioning-callback secret comparison** now uses `crypto.timingSafeEqual` (`safeEqual()` in
  `subdomains.controller.ts`), length-checked first since `timingSafeEqual` throws on mismatched
  buffer lengths rather than treating that as "not equal."
- **`pnpm audit --prod` findings: 23 → 2.** Pinned via `overrides:` in `pnpm-workspace.yaml`
  (pnpm 11 reads overrides there now, not from `package.json`'s `pnpm` field — the old location is
  silently ignored): `multer` (3 high DoS advisories, directly reachable via the `documents`/
  `avatar` upload endpoints), `lodash` (high code-injection advisory, transitive via
  `@nestjs/config`/`@nestjs/swagger`), `sharp` (high libvips CVEs, transitive via Next's image
  optimizer), `postcss`, `js-yaml`, `qs`, `file-type`, `deepmerge-ts`, `body-parser`. Verified
  safe: full typecheck, a clean `next build`, and the api's jest suite (51/51) all pass unchanged
  after the bumps.

### Remaining gaps (real, not padding)

| Finding | Severity | Detail |
|---|---|---|
| `@nestjs/core` advisory, patched only in NestJS 11 | Moderate | The project is pinned to NestJS 10.x throughout (`@nestjs/*@^10.4.x`). Patching means a major-version upgrade, not a dependency bump — real breaking-change surface (guards/pipes/decorators can shift between majors), not something to do unattended. Deliberately deferred; do this as its own reviewed, tested change. |
| No ledger for seller balances | Medium (design gap, not a bug) | See §5 — mutable balance + atomic claims prevents known races, but isn't forensically auditable the way an append-only ledger is. |
| No automated old-primary fencing on failback | Medium (operational, documented) | Already called out in `HIGH_AVAILABILITY.md` — the old primary can't safely rejoin without a manual re-base; nothing currently *prevents* someone from accidentally pointing traffic at it post-promotion. |
| Outgoing mail was fully disabled in production | Was a gap, now being addressed | `MAIL_HOST`/`MAIL_USER`/`MAIL_PASS` were empty on the primary — every order-confirmation/status/marketing email silently no-ops (logged as `SKIPPED`, never sent). See the mail section below. |

### Explicitly out of scope for this pass
A penetration test and a full review of the Next.js/Vite build configs for supply-chain risk
were not performed. The `@nestjs/core` major-version upgrade above is scoped out on purpose.

## 7. Recommendations, in rough priority order

1. Decide whether seller balance needs a ledger before it becomes a support/dispute problem —
   this is a product/risk decision, not just an engineering one.
2. Build old-primary fencing before the secondary is ever actually promoted for real, or
   document a manual runbook step that's impossible to skip.
3. Plan the NestJS 10→11 upgrade as its own dedicated, tested change (closes the one remaining
   `pnpm audit` finding).
4. Re-run `pnpm audit --prod` periodically — new advisories get published against pinned
   versions over time even with no code changes here.
