# Cargo — Repository Audit (Phase 1)

Read-only. No implementation in this pass. Written before any Cargo code, schema, or docs beyond
this file, per the standing rule on this project: new infra/product surfaces get discussed and
scoped before they get built, not after.

## 1. What this repo actually is right now

Monorepo (pnpm + Turborepo): `apps/api` (NestJS/Prisma/Postgres, single source of truth),
`apps/web` (Next.js storefront), `apps/admin` (Vite/React ops console), `apps/mobile`
(Flutter, ships through app stores, not this deploy pipeline), `packages/types` (Zod
schemas shared by every client), `packages/api-client` (one typed HTTP client), `packages/config`.

**34 Prisma models, one Postgres database, one production deploy path.** Push to `main` →
typecheck/build gate → three Docker images → SSH deploy → `prisma migrate deploy` runs
automatically against the live database → health check with auto-rollback. **There is no staging
environment.** Every migration that lands on `main` applies to production within minutes of the
push. This matters a lot for a 15-20-table Cargo schema — there's no safety net between "migration
looked right" and "it's live."

Two VPSes, deliberately kept to two (documented MVP constraint): primary (app + Postgres) and a
secondary (active/active app tier + streaming standby + outbound mail relay). No warehouse
scanning hardware, no logistics-partner integration, no customs/compliance tooling exists anywhere
in this stack today.

## 2. The closest existing precedent: Gallery

The repo already has one second vertical bolted onto the original top-up product: a flowers/gifts
marketplace (`GalleryCategory`/`GalleryProduct`/`GalleryOrder`, `Seller`/`SellerApplication`,
`WithdrawalRequest`). This is the right template to study for "how does a new vertical get added
here" — it reuses `User` (no `GalleryUser`), reuses the referral/audit-log/notification
infrastructure, and has its own order state machine and admin pages rather than forking the
original ones. Cargo should follow this shape, not invent a new one.

**One real, current gap this precedent already exposes**: `GalleryOrder`s are excluded from
`AdminStatsService` — the main admin dashboard only reflects top-up `Order`s. A second vertical
bolted on without updating the shared aggregation layer is an easy way to make revenue invisible.
Cargo would hit the same trap unless the stats/economics layer is explicitly extended, not
assumed to pick it up automatically.

## 3. What Cargo could reuse today (confirmed by reading the code, not assumed)

| Need | Reuse this | Confirmed |
|---|---|---|
| Identity | `User` (phone-based, `role: CUSTOMER\|SELLER\|SUPPORT\|MANAGER\|ADMIN`) | yes |
| Addresses | **Nothing exists.** No `Address` model anywhere in the 34 models. | confirmed absent |
| Payment | `PaymentProvider` interface + `PaymentProviderRegistry`, currently one implementation (`ManualPaymentProvider`, admin confirms by hand) | yes — real, but there is no live card/SBP provider to plug Cargo into either |
| File storage | `Document` model + reg.ru S3 (already live for avatars/documents, public+private buckets) | yes |
| Audit trail | `AuditLogService.record(adminId, action, entityType, entityId, meta)` — write-only, fire-and-forget, already called from ~10 services | yes |
| Staff authorization | `JwtAuthGuard` + `RolesGuard` + `@Roles("ADMIN","MANAGER")` — coarse, role-based | yes, but see §4 |
| Email | `EmailService` — transactional + a separately-throttled marketing identity, real SMTP via the secondary VPS relay | yes |
| Seller-facing push-ish notification | `TelegramBotService` — one-time-code chat linking, Telegram messages only | yes, narrow (sellers only, one channel) |
| Generic customer notifications (in-app/push) | **Does not exist.** No `/notifications` route, no device-token storage, no push pipeline. This is GAP 1 in `docs/MOBILE_API_GAPS.md`, still open. | confirmed absent |

## 4. What the prompt assumes exists and doesn't

The master prompt's own instructions (§2-4, §37) say: reuse what's there, don't build
`CargoPayment`/`CargoUser`/a second auth system. Following that rule faithfully surfaces several
things Cargo would need that **are not infrastructure gaps Cargo can quietly route around** —
they're separate, real pieces of work:

- **No `Address` entity.** Every address today is denormalized fields on whatever order type holds
  it (e.g. `GalleryOrder.recipientName`/etc., not a reusable table). Cargo's sender/recipient/pickup
  addresses (§10-11) would either repeat that pattern or be the first thing in this codebase to
  introduce a real reusable `Address` model — worth deciding deliberately, not by accident.
- **No fine-grained permission strings.** The prompt's proposed `cargo.shipments.read`,
  `cargo.tariffs.manage`, etc. (§37) don't match this codebase's actual RBAC, which is coarse
  `@Roles("ADMIN","MANAGER")` per-endpoint. Building the prompt's permission model as specified
  would itself be a new RBAC subsystem, not a Cargo feature.
- **No feature-flag system.** §81 asks for `cargo.enabled` with internal/beta/limited/full rollout
  tiers. Nothing like this exists anywhere in the repo today.
- **No analytics/event-tracking pipeline.** §62-64 ask for a funnel (`cargo_opened` →
  `cargo_quote_requested` → ... → `cargo_shipment_delivered`) with conversion rates. There is no
  analytics-events system in this codebase to emit into.
- **No generic push notifications** (see §3 table) — Cargo's own notification list (§27) assumes a
  channel that doesn't exist yet for customers, only for sellers via Telegram.
- **No staging environment** — §76/86 assume a staging deploy step before production. This repo's
  actual pipeline has none; "deploy to staging, smoke test, then production" isn't available as
  written.

None of these are hard blockers — they're just real, separately-scoped pieces of engineering work
hiding inside what the prompt frames as "just reuse what exists."

## 5. Scale, read plainly

The prompt's own entity list (§44) names 17 new tables (`Shipment`, `ShipmentItem`,
`ShipmentAddress`, `ShipmentTrackingEvent`, `CargoRoute`, `CargoTariff`, `CargoWarehouse`,
`CargoPickupRequest`, `CargoDelivery`, `CargoProvider`, `CargoException`, `CargoDispute`, ...) on
top of the current 34. Layered on that: a versioned pricing engine with volumetric-weight rules,
a warehouse scan-and-accept mobile workflow, admin tariff/route/warehouse management, a
economics/margin-by-route dashboard, and full web + admin + mobile UI for all of it. The prompt's
own phase breakdown (§92, 14 phases) and its own repeated "stop if requirements are unclear"
instructions (§90-91, §105) are — read straight — an acknowledgment that this is not a single
implementation pass.

## 6. What's genuinely unknown (not for me to invent)

Per the prompt's own §90-91 rule, and confirmed by this audit — none of the following exist
anywhere in this repo, any doc, or this session's memory of the project:

- Any actual route (which country pairs, which cities)
- Any actual tariff/pricing figures or formula
- A logistics/customs partner, or whether one is contracted
- Insurance terms, customs handling, or any compliance posture for international shipping
- A warehouse — a physical one, staffing, or scanning hardware
- Expected volume, target margin, or any of the unit-economics inputs §58-60 ask for

I'm not filling these in with plausible-sounding defaults. Per the prompt's own instruction, this
belongs in `docs/CARGO/ASSUMPTIONS.md` — but that file is empty until those are real answers, not
guesses dressed up as configuration.

## 7. Recommendation

Stopping here, per the prompt's own §105 and this project's standing rule that new infrastructure
gets scoped before it's built. Not proceeding to `ARCHITECTURE.md` or any schema/code yet.
