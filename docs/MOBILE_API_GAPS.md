# Mobile API gaps

Backend capability the mobile brief asks for that does not exist today. Nothing here is worked
around with fake client-side logic — each is either a backend change or a scope cut.

Ordered by what blocks the most mobile work.

---

## GAP 1 — No notifications API

**Current backend.** Nothing. No `/notifications` route, no `Notification` model, no device-token
registration, no push infrastructure. Sellers get Telegram messages; customers get email. Neither
is reachable from a mobile client.

**Required.** The brief (§27) asks for a notification list, unread count, mark-read and mark-all-read.

**Proposed**

```
GET   /notifications?unreadOnly=&cursor=     -> { items: [...], nextCursor, unreadCount }
POST  /notifications/:id/read                -> { id, readAt }
POST  /notifications/read-all                -> { updated: 12 }
```

```json
{ "id": "cuid", "kind": "ORDER_COMPLETED", "title": "…", "body": "…",
  "orderId": "cuid|null", "readAt": null, "createdAt": "2026-09-01T…" }
```

**Security.** JWT; every query scoped to `userId` from the token, never from the body.

**Reason.** Order status is the one thing a customer wants pushed. Without this the app can only
poll `/orders/me`, which is worse for battery and worse for the user.

**Note.** Push (FCM/APNs) is a separate, larger piece: device-token storage, per-platform
credentials, a send path. In-app notifications are the smaller first step and are worth doing
first.

---

## GAP 2 — No pagination anywhere

**Current backend.** `/orders/me`, `/gallery/orders/me`, `/gallery/products`, `/stories`,
`/home-slides` all return complete arrays with no `page`, `limit` or `cursor`.

**Required.** The brief (§25) asks for real pagination with next-page and end-of-list states.

**Proposed.** Cursor pagination on the list endpoints, since order lists are append-heavy and
offsets skip rows when new items arrive mid-scroll:

```
GET /orders/me?cursor=<id>&limit=20
-> { "items": [...], "nextCursor": "cuid|null" }
```

**Security.** Unchanged — the existing `userId` scoping still applies.

**Reason.** Invisible today at 1 order and 5 products. It becomes a correctness and payload
problem long before it becomes a performance one, and changing a list response shape after the app
ships means a breaking change for installed clients.

**Mobile interim.** Build the list layer cursor-shaped from day one and adapt the current plain
array in the repository, so adopting real pagination is a repository change and not a UI rewrite.

---

## GAP 3 — No gallery product detail endpoint

**Current backend.** `GET /gallery/products` returns the full list. There is no
`GET /gallery/products/:id`.

**Required.** A product screen, and a deep link that opens one product.

**Proposed**

```
GET /gallery/products/:id -> the same product object, 404 when missing or disabled
```

**Security.** Public, like the list.

**Reason.** Fetching the whole catalogue to render one product is wrong on mobile data, and a deep
link into a product has nothing to call. Cheap to add — the query already exists inside the list
handler.

**Mobile today (Phase 4).** `GalleryRepository.loadProduct` fetches the unfiltered list and picks
the row out of it. Wasteful and honest; swapping it for the endpoint above is a one-line change.

---

## GAP 4 — No cart

**Current backend.** `POST /gallery/orders` takes exactly one `productId` and creates one order.

**Required.** The brief (§16) describes a cart step.

**Two honest options.**

*Client-side cart, server unchanged.* The app holds a local list and posts N orders. Simple, but N
orders means N deliveries, N statuses and N payments for what the user thinks is one purchase.
Recommended only if multi-item purchases are rare.

*Server-side multi-item order.* `GalleryOrder` gains line items:

```
POST /gallery/orders { items: [{ productId, quantity }], recipientName, … }
```

That is a schema change touching seller balance crediting and the order state machine.

**Recommendation.** Ship single-product checkout first and treat the cart as a product decision.
Do not fake a cart that silently creates several orders — the customer will not understand the
resulting order list.

**Mobile today (Phase 4).** Single-product checkout, as recommended. No cart anywhere in the UI.

---

## GAP 5 — No customer wallet balance

**Current backend.** `User.referralBalanceTmt` exists and is auto-applied as a checkout discount.
`Seller.balanceTmt` exists for sellers. There is no general customer wallet, no top-up-your-balance
flow and no balance transaction history.

**Required.** The brief (§10, §19) mentions a balance on Home and in Profile.

**Recommendation.** Show the referral balance and label it as such. Do not build a "wallet" screen
implying funds that can be deposited or withdrawn — that mechanism does not exist and inventing
the UI for it would misrepresent the product.

---

## GAP 6 — No deep-link targets

**Current backend.** No universal-link config is served (`/.well-known/assetlinks.json`,
`/apple-app-site-association`), and there are no public per-entity URLs for orders or products.

**Required.** The brief (§32) asks for deep links where the product supports them.

**Proposed.** Serve both well-known files from the web app, and add public routes for the entities
worth linking to. Referral links already work conceptually — `username` is the code — but there is
no landing route that captures it.

**Reason.** Referral sharing is the one case with obvious value, and it is the one the brief's own
business context implies. Without a captured landing route the referrer's code has to be typed by
hand.

---

## GAP 7 — Support chat is poll-only

**Current backend.** `GET /support/thread` returns the thread; there is no websocket, SSE or
`?since=` parameter.

**Required.** Reasonable chat behaviour.

**Proposed.** Minimum: `GET /support/thread?sinceMessageId=` so the app fetches only new messages.
Better: SSE on the existing thread route.

**Reason.** Without it the app re-downloads the whole conversation on every poll.

---

## GAP 8 — Password recovery is unreachable for a phone-only customer

**Current backend.** `POST /auth/password-reset/request` and `/confirm` both key on **email**
(`@IsEmail()` on `RequestPasswordResetDto.email`). Registration keys on **phone** — `RegisterDto`
has no email field at all, and neither does `UpdateMeDto`.

An email can be attached, but only from inside an authenticated session:
`POST /account/email/request` → `POST /account/email/confirm` (`EmailVerificationController`,
`JwtAuthGuard`). So recovery works **only** for a customer who thought to add and verify an email
*before* losing access to their account.

**Consequence for mobile.** A "Забыли пароль?" link on the login screen would, for the majority of
customers, send them through a flow whose response is deliberately always `{ sent: true }` (it does
not reveal whether an account exists) and then never deliver anything. That is worse than no link.

**Decision.** Phase 1 ships **no** recovery link. Phase 5 adds the profile screen's
"add and verify email" step — and the login-screen link becomes honest once a meaningful share of
accounts carry a verified address.

**Proposed backend work, in priority order**

1. Prompt for an email at registration (optional field on `RegisterDto`, verified afterwards).
   Cheapest change; fixes recovery for every *new* account.
2. SMS-based reset keyed on phone. The right answer for this market, but it needs an SMS provider,
   a cost model and rate limiting — a project, not a patch.

**Reason.** Every customer here registers by phone. A recovery mechanism that only works for
people who did optional setup work in advance is, in practice, no recovery mechanism — those
customers contact support, and support has no self-service way to help them either.

---

## GAP 9 — A customer is never told how to pay

**Current backend.** `PaymentMethod` is `{ id, code, name, provider, feePercent, isEnabled,
sortOrder }` — there is **no instructions, details, account-number or note field**. The only
registered provider is `ManualPaymentProvider`, whose `initiate` returns
`{ providerRef: "manual_<uuid>", redirectUrl: null }`. Confirmation happens out-of-band when a
staff member calls `POST /payments/orders/:id/confirm`.

So the complete customer experience today is: place an order, see `PENDING_PAYMENT`, and wait —
with no card number, no bank account, no phone number, and no instruction of any kind about where
to send the money. The shipped web storefront has the same hole: its success copy is *"Order #X is
awaiting payment. You can track its status in your account."* and nothing more.

**Consequence for mobile.** The app says plainly that payment is confirmed manually rather than
inventing instructions it has no source for. That is honest, and it is still a dead end for the
customer.

**Proposed.** Cheapest useful fix: an `instructions` (Markdown or plain text) field on
`PaymentMethod`, returned by `GET /catalog/payment-methods` and rendered by both clients. Editable
in the admin console, so changing a card number does not need a deploy.

**Reason.** This is not a mobile problem, it is the single biggest hole in the current purchase
funnel. Every order placed today depends on the customer already knowing, out of band, how to pay
— which means in practice they contact support, or they do not pay at all.

---

## GAP 10 — No price quote before committing

**Current backend.** `POST /orders` is the only thing that computes a price. There is no
`POST /orders/quote` or equivalent that returns `{ rateApplied, feeAmount, amountCharged,
referralDiscountTmt }` for a proposed order without creating one.

**Required.** Someone must know what they will pay *before* they place the order.

**Mobile interim.** The app mirrors `OrdersService.create`'s formula locally — including its
rounding — and shows the result with a `≈`, labelled as an estimate, never as a total. It is exact
whenever no referral balance applies; when one does, the server deducts it at creation time and
the customer pays **less** than the estimate.

**Proposed**

```
POST /orders/quote { serviceId, paymentMethodId, amountTmt, currency }
-> { rateApplied, feeAmount, amountCharged, referralDiscountTmt, currency }
```

Same guards as `create`, no writes, no referral-balance mutation.

**Reason.** Duplicating a pricing formula in every client is how two implementations end up
disagreeing about money. One endpoint removes the duplication and lets the app show an exact
figure instead of an approximation.

---

## GAP 11 — The referral reward amount is not readable by the person earning it

**Current backend.** `ReferralSettings` holds `enabled`, `customerRewardTmt` and
`sellerRewardTmt`, and the only route that returns it is
`GET /admin/referrals/settings` — `@Roles("ADMIN", "MANAGER")`. `GET /referrals/me` returns the
username, the balance and three counters, and **no reward figure and no `enabled` flag**.

**Consequence for mobile.** The referral screen can explain the mechanism but cannot answer the
first question anyone asks — *how much do I get?* It says "the shop sets the amount", which is
true and unpersuasive. Worse, if an admin turns the programme **off**, the app has no way to know:
it keeps inviting people to share a code that will never pay out.

**Proposed.** Add the two public-safe fields to the existing customer route rather than a new one:

```
GET /referrals/me
-> { username, referralBalanceTmt, canChangeUsername, stats,
     programme: { enabled: true, customerRewardTmt: 5 } }
```

`sellerRewardTmt` stays admin-only; a customer has no business seeing it.

**Reason.** A referral programme whose reward is invisible converts far worse than one that says
a number, and a programme that is silently disabled while the app still promotes it is a broken
promise the support inbox pays for.

---

## GAP 12 — Support chat re-downloads the whole thread on every poll

This is GAP 7 measured against a real client. The Phase 5 screen polls `GET /support/thread` every
15 seconds while it is on screen and in the foreground, because there is no `?sinceMessageId=`,
no SSE and no push.

Two consequences worth naming, both fixed by the same `?sinceMessageId=` parameter:

1. **Every poll transfers the entire conversation.** Fine at ten messages, wasteful at two hundred
   — and it is the customer's mobile data.
2. **Fetching has a side effect.** `getMyThread` marks staff and seller messages
   `readByCustomer: true`. So a poll is not a read-only operation, which is why the app stops
   polling the moment the screen is backgrounded — otherwise messages would be marked read while
   the phone is in someone's pocket. A `?sinceMessageId=` variant should ideally *not* carry the
   mark-read side effect at all, or should carry it explicitly (`POST /support/thread/read`).

---

## Not a gap, but decisive for the app

These are backend states the mobile app must reflect honestly rather than design around. They come
from the architecture review, not from this mapping.

**Top-ups do not actually happen.** `MockOperatorGateway` is what runs in production and returns
success unconditionally. Every paid order is marked COMPLETED without a top-up occurring.

**There is no real payment acceptance.** The only registered provider is `ManualPaymentProvider` —
an admin confirms each payment by hand.

Per the brief (§52), the app must therefore **not** ship a card-entry screen that pretends to
charge a card. The honest mobile flow is: create the order, show `PENDING_PAYMENT`, present the
real manual payment instructions the backend supports, and let the customer track status. When a
real provider is integrated, the payment step becomes a screen — the surrounding flow does not
change.
