# Referral System — Implementation Analysis

This report was requested as "Этап 1" of an external planning document
(`GULYALY_REFERRAL_PRODUCTION_PLAN.md`) before any code changes. Two of that
document's core assumptions do not hold for this repository, so both are
called out explicitly before the gap analysis.

## Stack mismatch

The plan assumes **Fastify + Drizzle ORM**. This repository (`topup-hub`,
pnpm workspace) actually uses:

- **NestJS** (`apps/api`), not Fastify.
- **Prisma** (`apps/api/prisma/schema.prisma`), not Drizzle.
- **Next.js App Router** for the customer site (`apps/web`), **Vite + React
  Router** for the admin console (`apps/admin`) — no FlutterFlow client.
- **PostgreSQL + Redis** via `docker compose` locally; Redis is used for
  BullMQ job queues, not referral state.

Every recommendation below is written against the actual stack.

## The referral system already exists and is live in production

The plan's premise is a from-scratch build. In reality a referral module was
already designed, implemented, tested, and deployed to production earlier
in this project's history. This report is therefore a **gap analysis
against the plan's stricter production requirements**, not a build plan.

## 1. Where things are

| Concern | Location |
|---|---|
| Users | `apps/api/prisma/schema.prisma` — `model User` (`id`, `phone`, `username`, `referredByUsername`, `referredById`, `referralBalanceTmt`, `locale`, ...) |
| Orders | `model Order` — `referralDiscountTmt` field; lifecycle `PENDING_PAYMENT → PAID → PROCESSING → COMPLETED \| FAILED`, `CANCELLED`/`REFUNDED` reachable per `ADMIN_STATUS_TRANSITIONS` in `apps/api/src/orders/orders.service.ts` |
| Payments | `apps/api/src/payments/` — provider-pluggable (`PaymentProvider`/`PaymentProviderRegistry`), currently only `ManualPaymentProvider` |
| Wallet/balance | No generic wallet table. `User.referralBalanceTmt` (customer referral credit) and `Seller.balanceTmt` (seller payout balance, pre-existing, reused) are plain `Decimal` columns updated via Prisma `increment`/`decrement` |
| Migrations | `apps/api/prisma/migrations/` — hand-written SQL, most recently `20260822150000_add_referrals_username` (added the referral schema) |
| Referral domain module | `apps/api/src/referrals/` — `referrals.service.ts`, `referrals.controller.ts`, `referrals.module.ts`, DTOs, `referrals.service.spec.ts` (12 tests) |
| Referral API | `ReferralsController` (`/referrals/*`) and `AdminReferralsController` (`/admin/referrals/*`), both in `referrals.controller.ts` |
| Frontend (customer) | `apps/web/src/app/account/page.tsx` — view/edit own username (= referral code) |
| Frontend (admin) | `apps/admin/src/pages/referrals.tsx` — settings, ledger, leaderboard |
| Auth | JWT access + rotated opaque refresh token, `apps/api/src/auth/` |
| Existing transaction pattern | `prisma.$transaction([...])` / `prisma.$transaction(async (tx) => ...)`, used throughout `orders.service.ts` and `referrals.service.ts` |
| Existing idempotency pattern | Race-safe **conditional `updateMany`** (`WHERE balance >= x`) instead of read-then-write, e.g. `ReferralsService.applyReferralDiscount` and money-deduction paths elsewhere in the codebase |
| Existing rate limiting | None found repo-wide (no `@nestjs/throttler` or equivalent) |
| Existing logging/audit | Nest's built-in `Logger`; no structured audit-log sink. An `AuditLog` Prisma model exists but nothing currently writes to it (noted as a known gap in `CLAUDE.md`) |

## 2. Current design (as shipped)

- **Referral code = username.** No separate `referral_code` column/table.
  `User.username` (auto-generated at registration, user-changeable via
  `PATCH /referrals/username`) doubles as the public referral handle.
  Sellers use their existing `Seller.handle` the same way. Cross-checked for
  collisions between the two namespaces (`isUsernameTaken`).
- **Attribution:** `POST /auth/register` accepts an optional
  `referredByUsername` field. `ReferralsService.recordReferral` resolves it
  (seller handle checked first, then user username), rejects self-referral,
  and — in one transaction — stamps `User.referredByUsername`/`referredById`
  on the new user and creates a `Referral` row with `status: PENDING`.
- **Qualification:** `OrdersService`'s topup-processing path calls
  `referrals.maybeRewardReferral(order.userId, orderId)` **only** when an
  order transitions to `COMPLETED` (never on `FAILED`). The reward types are
  `PENDING → REWARDED` (or the referral can be left `PENDING` forever, or
  admin-settable `VOID`).
- **Reward:** the *referrer* is credited (`User.referralBalanceTmt` or
  `Seller.balanceTmt`, by `ReferrerType`), inside a `$transaction` that also
  flips `Referral.status → REWARDED`. Amounts come from
  `ReferralSettings.customerRewardTmt` / `sellerRewardTmt` — a singleton
  admin-editable row, not hardcoded. This already satisfies the plan's
  "configuration, not hardcoded constants" requirement.
- **Referee benefit:** not a signup bonus. Instead, `applyReferralDiscount`
  auto-applies the referee's own accumulated `referralBalanceTmt` as a
  capped discount at order-creation time. This is a **deliberate design
  divergence** from the plan (which assumes a symmetric referrer+referee
  signup-style reward) — flagging it as a decision to confirm, not a bug.
- **One referrer per user:** enforced by `Referral.refereeUserId` being
  `@unique`, plus `recordReferral` only running once (at registration).
- **Program kill-switch:** `ReferralSettings.enabled` — both attribution and
  rewarding no-op when disabled.

## 3. Gaps vs. the plan's production requirements

Ordered roughly by severity/impact.

### 3.1 — Attribution is not reachable by real users (critical)

`POST /auth/register` accepts `referredByUsername`, and the account page
lets a user see/copy their own username — but **nothing in the frontend
captures an incoming referral code and threads it through registration**:

- No `/r/:code` (or any) landing page exists in `apps/web/src/app/`.
- No code searches or greps for `?ref=`, `referredByUsername`, or `/r/`
  anywhere under `apps/web/src` turn up a single hit outside the backend DTO
  itself.
- `apps/web/src/app/register/page.tsx` has no field or query-param handling
  for a referral code at all.

**Net effect: the referral loop cannot currently be closed by an actual
visitor.** The backend and admin tooling are fully built; the one piece
that makes it a functioning growth channel — getting a code from a shared
link into a new signup — is missing. This is the highest-value, lowest-risk
gap to close.

### 3.2 — Reward crediting has a TOCTOU race

```ts
// referrals.service.ts, maybeRewardReferral()
const referral = await this.prisma.referral.findUnique({ where: { refereeUserId } });
if (!referral || referral.status !== "PENDING") return;          // ← read OUTSIDE the transaction
...
await this.prisma.$transaction(async (tx) => {
  ...increment balance...
  await tx.referral.update({ data: { status: "REWARDED", ... } }); // ← write happens after
});
```

The `PENDING` check happens before the transaction opens. Two concurrent
calls (e.g. a retried job, a duplicate event) could both pass the check
before either commit lands, double-crediting the balance. Notably,
`applyReferralDiscount` **in the same file** already avoids this exact
class of bug via a conditional `updateMany` (`WHERE referralBalanceTmt >=
deduction`) — the fix is applying that established pattern here too (e.g.
a conditional update on `Referral` keyed on `status: "PENDING"`, checking
the affected-row count before crediting). In practice the only caller is
order-completion processing inside a BullMQ job, so a real double-fire may
be rare — but it isn't prevented at the data layer, which is what the plan
(correctly) asks for.

### 3.3 — No immutable reward ledger

Money movement is a direct `increment`/`decrement` on
`User.referralBalanceTmt` / `Seller.balanceTmt`. The `Referral` row itself
is a reasonable one-row-per-referee audit record (status, amount,
timestamps, qualifying order), but it is not a general-purpose,
append-only ledger: there's no way to record a *reversal* as a new row, no
`idempotency_key` column, and no `reward_ledger`-style table the plan
describes. Whether this matters depends on how much production financial
auditability is actually needed — noted as a design gap, not asserting it
must change.

### 3.4 — No refund/cancellation reversal

`ADMIN_STATUS_TRANSITIONS` allows `COMPLETED → REFUNDED`. Nothing listens
for that transition to reverse an already-paid referral reward. An admin
refunding a qualifying order today leaves the referrer's credited balance
untouched.

### 3.5 — No anti-fraud limits

No minimum qualifying order amount, no daily/global reward cap, no rate
limiting on `GET /referrals/me` or `PATCH /referrals/username`. Self-referral
is blocked; duplicate-referrer-per-user is blocked (DB unique constraint);
everything else the plan asks for under "Anti-fraud MVP" is unimplemented.

### 3.6 — No public code-validation endpoint

No `GET /referrals/validate/:code`-equivalent. Not strictly required if a
landing page always attempts registration directly, but the plan calls for
it as a pre-commit UX check that leaks nothing about the referrer.

### 3.7 — Test coverage gap

The existing 12 tests (`referrals.service.spec.ts`) cover username
generation/collision and `applyReferralDiscount` edge cases well. **Zero
tests exercise `maybeRewardReferral`** — no test for reward-on-completion,
no duplicate-call/idempotency test, no VOID/disabled-program test, no
refund-reversal test (since reversal doesn't exist yet).

## 4. What genuinely needs to change (if gaps are to be closed)

This section is intentionally *not* a build plan — see the open question
below. If asked to proceed, the minimal, additive changes would be:

1. Add a `/r/[code]` route in `apps/web` (or a query-param capture on the
   existing register/home flow) that persists the code (localStorage,
   matching this project's existing client-side-only patterns) and wires it
   into the `POST /auth/register` call's `referredByUsername` field.
2. Harden `maybeRewardReferral` with a conditional `updateMany` on
   `Referral` (status-gated), mirroring `applyReferralDiscount`.
3. Add a `REFERRAL_MIN_QUALIFYING_ORDER_TMT` setting (extend
   `ReferralSettings`) checked before rewarding.
4. Decide on and implement refund reversal (extend `Referral.status` with a
   `REVERSED` value, or add the reversal as a new `Referral`-adjacent
   record) — needs a product decision on whether clawback is even desired.
5. Add tests for items 1–4.

No new tables beyond what's already there are strictly required for 2–3;
item 4 needs a small, additive schema change either way.

## 5. Open question for the user

The plan calls for a **from-scratch, ledger-based** referral system on a
**Fastify/Drizzle** stack. Neither premise matches this repository. A
referral system already exists, is live, and works for the pieces that are
wired up (settings, rewarding referrers, admin visibility) — but the
**attribution loop is not actually closable by a real visitor today** (3.1),
which is the one gap that affects whether referrals do anything at all in
production right now.

Given that, direction is needed on scope before writing more code.
