# Cargo — Architecture (v1)

Scoped from `AUDIT.md` plus these confirmed answers: the partner owns the warehouse (no Gulyaly
scan/accept/weigh workflow), pickup at the sender's address is required from day one, and v1 ships
exactly one route (Moscow → Ashgabat). This document is the v1 scope — not the prompt's full
105-section system. What's deliberately deferred is listed at the bottom, not silently dropped.

**Superseded 2026-09-04**: the tariff was originally scoped as a flat per-kg rate priced directly
in TMT. The real figures turned out to be a **weight-bracket** rate (140 RUB/kg under 50kg, 130
from 50kg, 120 from 100kg — the whole shipment prices at whichever bracket its total weight falls
into, not a progressive blend) priced in **RUB**, converted to TMT through independent USD
cross-rates (`CargoExchangeRate`: `rubPerUsd`, `tmtPerUsd`) rather than one derived RUB→TMT number
that would silently drift wrong whenever only one of the two currencies moved against USD. The
schema/pricing sections below reflect this corrected design; production held zero Cargo rows at
the time of the rework, so no data migration was needed.

## 1. A real finding that changes the payment design

The prompt assumes Cargo should plug into "the existing payment architecture"
(`PaymentProviderRegistry`/`Payment`). Reading the actual schema: **`Payment.orderId` is a hard
foreign key to the top-up `Order` table, not polymorphic.** `GalleryOrder` — the one existing
precedent for a second vertical — does not use `PaymentProviderRegistry` or create `Payment` rows
at all. It has a flat `status: GalleryOrderStatus`, and `updateOrderStatus()` is a plain
admin/seller-driven setter (`gallery.service.ts`) with no payment-provider involvement anywhere.

So "reuse the existing payment architecture" and "follow the existing precedent for a second
vertical" point in two different directions, because Gallery itself never actually wired into
`PaymentProviderRegistry` either. **Decision for v1: follow the real precedent (Gallery's), not
the theoretical one.** `Shipment.status` includes `PENDING_PAYMENT`/`PAID`; an admin confirms
payment directly (manual bank transfer/SBP, same reality as `ManualPaymentProvider` today, just
without going through that specific code path) via an authenticated, audited action — same shape
as `PaymentsService.confirmPayment` and `GalleryService.updateOrderStatus`, not a new payment
system. Making `Payment` genuinely polymorphic (nullable `orderId` + optional `shipmentId`) is a
real, separate migration touching the money-tracking core of the app — worth doing once, for both
Gallery and Cargo together, not as a Cargo-only side effect. Noted in Non-Goals.

## 2. Entities (v1)

Denormalized addresses on `Shipment`, matching how `GalleryOrder` already holds
`recipientName`/`recipientPhone`/`deliveryCity`/`deliveryAddress` directly rather than through a
shared `Address` table — there's no existing `Address` model to reuse, and inventing a generic one
for a single-route v1 is premature per the "don't invent an entity because it looks convenient"
rule in the prompt itself (§44).

```prisma
enum ShipmentStatus {
  DRAFT
  QUOTE_CREATED
  PENDING_PAYMENT
  PAID
  PICKUP_REQUESTED
  PICKUP_CONFIRMED
  PICKED_UP
  IN_TRANSIT
  ARRIVED_DESTINATION
  READY_FOR_PICKUP     // recipient collects from partner's destination point
  OUT_FOR_DELIVERY     // only reachable if door delivery was chosen
  DELIVERED
  CANCELLED
  ON_HOLD
  EXCEPTION
}

enum PickupStatus {
  REQUESTED
  CONFIRMED
  PICKED_UP
  CANCELLED
  FAILED
}

model CargoRoute {
  id                String   @id @default(cuid())
  originCountry     String
  originCity        String
  destinationCountry String
  destinationCity   String
  isEnabled         Boolean  @default(true)
  createdAt         DateTime @default(now())

  tariffs   CargoTariff[]
  shipments Shipment[]

  @@unique([originCity, destinationCity])
}

// Weight-break pricing in RUB: the whole shipment prices at whichever bracket its total declared
// weight falls into (140/130/120 RUB/kg at 0/50/100kg -- confirmed real figures, not a progressive
// per-kg blend). `Shipment`'s snapshot fields freeze what the customer actually paid, so a later
// bracket edit never rewrites history.
model CargoTariff {
  id            String     @id @default(cuid())
  routeId       String
  route         CargoRoute @relation(fields: [routeId], references: [id])
  minWeightKg   Decimal    @db.Decimal(6, 2)
  pricePerKgRub Decimal    @db.Decimal(10, 2)
  pickupFeeRub  Decimal    @default(0) @db.Decimal(10, 2)
  isActive      Boolean    @default(true)
  createdAt     DateTime   @default(now())
  createdById   String
  createdBy     User       @relation(fields: [createdById], references: [id])

  @@index([routeId, isActive])
}

// Singleton row (id "singleton", same pattern as ReferralSettings). RUB and TMT both float
// against USD independently, so this stores both cross-rates rather than one derived RUB->TMT
// number that would silently go stale the moment only one of the two currencies moved.
model CargoExchangeRate {
  id          String   @id @default("singleton")
  rubPerUsd   Decimal  @db.Decimal(10, 4)
  tmtPerUsd   Decimal  @db.Decimal(10, 4)
  updatedAt   DateTime @updatedAt
  updatedById String?
  updatedBy   User?    @relation(fields: [updatedById], references: [id])
}

model Shipment {
  id                 String         @id @default(cuid())
  publicTrackingNumber String       @unique // e.g. ASH-2026-000123, sequence-based like referral codes
  userId             String
  user               User           @relation(fields: [userId], references: [id])
  routeId            String
  route              CargoRoute     @relation(fields: [routeId], references: [id])
  tariffId           String
  tariff             CargoTariff    @relation(fields: [tariffId], references: [id])

  senderName    String
  senderPhone   String
  pickupAddress String

  recipientName    String
  recipientPhone   String
  deliveryAddress  String?          // null when recipient collects from the partner's point
  deliveryMode     ShipmentDeliveryMode @default(WAREHOUSE_PICKUP)

  cargoDescription String
  declaredWeightKg Decimal @db.Decimal(6, 2)
  declaredValueTmt Decimal? @db.Decimal(12, 2)
  fragile          Boolean @default(false)
  notes            String?

  pricePerKgRubSnapshot Decimal @db.Decimal(10, 2)
  pickupFeeRubSnapshot  Decimal @db.Decimal(10, 2)
  totalPriceRub         Decimal @db.Decimal(10, 2)
  rubPerUsdSnapshot     Decimal @db.Decimal(10, 4)
  tmtPerUsdSnapshot     Decimal @db.Decimal(10, 4)
  totalPriceTmt         Decimal @db.Decimal(12, 2)

  status      ShipmentStatus @default(DRAFT)
  paidAt      DateTime?
  cancelledAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  pickup         CargoPickupRequest?
  trackingEvents ShipmentTrackingEvent[]

  @@index([userId])
  @@index([status])
  @@index([routeId])
}

enum ShipmentDeliveryMode {
  WAREHOUSE_PICKUP // recipient collects at destination
  DOOR_DELIVERY    // out for delivery to deliveryAddress
}

model CargoPickupRequest {
  id          String       @id @default(cuid())
  shipmentId  String       @unique
  shipment    Shipment     @relation(fields: [shipmentId], references: [id])
  address     String
  requestedDate DateTime
  timeWindow  String       // free text for v1: "10:00-14:00" -- no slot-booking system exists to validate against
  phone       String
  status      PickupStatus @default(REQUESTED)
  notes       String?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

// Event-sourced timeline the customer sees. Entered by an admin/ops action for v1 -- there is no
// partner API integration, so a status update from the partner (by phone/Telegram, today's real
// channel per the audit) becomes one authenticated admin action that appends an event, same shape
// as AuditLogService's existing callers.
model ShipmentTrackingEvent {
  id         String   @id @default(cuid())
  shipmentId String
  shipment   Shipment @relation(fields: [shipmentId], references: [id])
  status     ShipmentStatus
  note       String?
  createdAt  DateTime @default(now())
  createdById String
  createdBy   User    @relation(fields: [createdById], references: [id])

  @@index([shipmentId, createdAt])
}
```

**8 new things** (3 enums, 6 models, incl. the `CargoExchangeRate` singleton added in the pricing
rework) — not the prompt's 17-table list. `CargoWarehouse`, `CargoProvider`, `CargoException`,
`CargoDispute`, `ShipmentItem`, `ShipmentAddress`, `ShipmentPriceQuote` are all real prompt
concepts that don't earn their place yet at one route, one partner — see Non-Goals.

## 3. Status transitions (whitelist, same pattern as `orders.service.ts`)

```
DRAFT              -> QUOTE_CREATED, CANCELLED
QUOTE_CREATED       -> PENDING_PAYMENT, CANCELLED
PENDING_PAYMENT     -> PAID, CANCELLED
PAID                -> PICKUP_REQUESTED, CANCELLED
PICKUP_REQUESTED    -> PICKUP_CONFIRMED, ON_HOLD, CANCELLED
PICKUP_CONFIRMED    -> PICKED_UP, ON_HOLD
PICKED_UP           -> IN_TRANSIT, EXCEPTION
IN_TRANSIT           -> ARRIVED_DESTINATION, EXCEPTION
ARRIVED_DESTINATION -> READY_FOR_PICKUP, OUT_FOR_DELIVERY
READY_FOR_PICKUP     -> DELIVERED
OUT_FOR_DELIVERY     -> DELIVERED, EXCEPTION
ON_HOLD              -> (whatever state it was on hold from)
EXCEPTION            -> (resolved manually by admin, no auto-transition)
```

Every transition is an admin action → `AuditLogService.record()` + a new `ShipmentTrackingEvent`
in the same transaction, exactly like `orders.service.ts`'s `ADMIN_STATUS_TRANSITIONS` map.

## 4. Pricing (v1, corrected 2026-09-04)

```
bracket   = the route's active CargoTariff row with the highest minWeightKg <= declaredWeightKg
totalRub  = declaredWeightKg * bracket.pricePerKgRub + bracket.pickupFeeRub
totalUsd  = totalRub / exchangeRate.rubPerUsd
totalTmt  = totalUsd * exchangeRate.tmtPerUsd
```

No volumetric weight. The whole shipment prices at whichever bracket its weight falls into, not a
progressive per-kg blend across brackets (confirmed real figures: 140 RUB/kg under 50kg, 130 from
50kg, 120 from 100kg on the Moscow→Ashgabat route). RUB and TMT both float against USD
independently, so the conversion goes through two stored cross-rates (`CargoExchangeRate`) rather
than one derived RUB→TMT number that would silently go stale the moment only one of the two
currencies moved. `GET /cargo/quote` computes this server-side (never trust a client-computed
price, per the prompt's own §16 and this repo's existing `orders/quote`-shaped precedent);
confirming the shipment snapshots the bracket's RUB price and both cross-rates onto the `Shipment`
row (`pricePerKgRubSnapshot`, `pickupFeeRubSnapshot`, `totalPriceRub`, `rubPerUsdSnapshot`,
`tmtPerUsdSnapshot`, `totalPriceTmt`) so a later bracket edit or exchange-rate update never
touches an existing order. Admin manages both the bracket set (full-replace, atomic) and the
exchange rate from the Cargo admin page — see the Cargo tab's Exchange rate card.

## 5. Pickup (v1)

Needed from day one, but there's no courier-dispatch integration with the partner — nothing in the
audit or this conversation indicates one exists. v1 models this honestly: a customer submits a
`CargoPickupRequest`; ops coordinates the actual pickup with the partner by phone/Telegram (today's
real channel, per the audit); an admin updates the request's status, which appends a tracking
event the customer sees. This is not a courier-assignment system — it's a request-and-status-update
record. Automating dispatch is a Non-Goal until the partner offers an API.

## 6. Reused as-is (no new subsystem)

- **Auth/RBAC**: `JwtAuthGuard` + `RolesGuard` + `@Roles("ADMIN","MANAGER")` on admin routes,
  `@CurrentUser()` + ownership checks on customer routes (`Shipment.userId === callerId`, closing
  the IDOR class the prompt worries about in §51 the same way `orders.service.ts` already does).
- **Audit log**: every admin mutation calls `AuditLogService.record()` — no new audit mechanism.
- **Notifications**: shipment status changes email the customer via the existing `EmailService`
  template system (`AUTH_EMAIL_VERIFICATION`-style templates), the same way `ORDER_COMPLETED`/
  `ORDER_FAILED` already do. No in-app/push notification exists in this codebase (GAP 1, still
  open) — Cargo does not block on building that; email is the real channel today.
- **Referral code sequence pattern**: `publicTrackingNumber` uses the same
  `$queryRawUnsafe("SELECT nextval(...)")` approach `ReferralsService.generateUsername()` already
  uses for collision-free, lock-free ID issuance, formatted as `ASH-2026-######`.
- **Storage**: `Document` model + existing S3 buckets for any package/proof-of-delivery photos.

## 7. Surface for v1

- **API** (`apps/api/src/cargo/`): `GET /cargo/routes`, `POST /cargo/quote`,
  `POST /cargo/shipments`, `GET /cargo/shipments/me`, `GET /cargo/shipments/:id` (ownership-checked),
  `GET /cargo/track/:trackingNumber` (public, returns only the customer-safe timeline),
  `POST /cargo/shipments/:id/pickup`. Admin: list/detail/status-transition/tracking-event endpoints
  under `/admin/cargo/*`, `@Roles("ADMIN","MANAGER")`, matching `orders`/`gallery` admin route shape.
- **Admin**: one new page, `Cargo` — list (search by tracking number/customer, filter by status/
  route) + detail (timeline, status actions, pickup status) + a small Routes/Tariffs settings panel
  (this repo's existing settings-panel pattern, e.g. `referrals.tsx`'s settings card — not a
  separate CRUD module, since v1 has one route) + an Exchange Rate card (RUB/USD, TMT/USD,
  full-replace bracket editor for the route's tariff).
- **Web**: `/cargo` (home), `/cargo/create` (wizard: route is preselected since there's one →
  sender → recipient → cargo → pickup → quote → payment), `/cargo/shipments` (mine),
  `/cargo/track/:trackingNumber` (public).
- **Mobile**: `Cargo` reachable from Home (not added to the 5-slot bottom nav — matches the design
  review earlier in this session that flagged Cargo as a new vertical, not a restyle), same wizard
  steps as web, `My Shipments` + tracking under Profile-adjacent navigation.

## 8. Non-Goals for v1 (real prompt content, deliberately deferred — not dropped silently)

- **Warehouse operations module** (§23: scan/weigh/photograph/accept, discrepancy handling). The
  warehouse is the partner's; Gulyaly's system has no scanning workflow to build.
- **Multi-route admin CRUD, volumetric weight, CargoProvider abstraction for multiple carriers.**
  One route, one partner (weight-bracket pricing on that one route is already real, see §4 — the
  deferred part is *more routes*, not more brackets). The schema doesn't block adding more routes
  later — `CargoRoute`/`CargoTariff` are already separate tables — but building the general system
  now for a system of one route is the "big-bang, invent for hypothetical needs" pattern this
  project's own conventions already avoid elsewhere.
- **Disputes module, exception-handling UI beyond the `EXCEPTION`/`ON_HOLD` statuses.** Real need,
  real v2 candidate; v1's `notes` field + admin status control is the honest floor.
- **Feature flags, rollout tiers.** No feature-flag system exists in this codebase at all; adding
  one is a real, separate piece of infrastructure, not a Cargo-specific need.
- **Analytics/funnel events** (`cargo_opened`, conversion-rate dashboards). No event-tracking
  pipeline exists to emit into.
- **Polymorphic `Payment`/`PaymentProviderRegistry` integration.** See §1 — real, worth doing once
  for Gallery and Cargo together, not as an unplanned Cargo side effect.
- **Push/in-app notifications, SMS.** GAP 1 in `MOBILE_API_GAPS.md`, still open, not Cargo-specific.
- **Staging environment / phased rollout deploy.** This repo's actual pipeline has no staging leg;
  Cargo ships through the same push-to-`main` path as everything else, gated by careful testing
  before the push, same as every change made earlier this session.

## 9. What's still a real open question before schema work starts

- Pickup time windows: free text for v1 (no slot system to validate against) — confirm that's
  acceptable, or a fixed set of windows is wanted instead.
- Cancellation/refund rule once `PAID`: this doc allows `PAID -> CANCELLED` in the transition
  table but doesn't yet define whether/how a refund happens — same manual-confirm shape as payment
  itself, or something stricter. Needs a decision before the admin action ships, not after.
