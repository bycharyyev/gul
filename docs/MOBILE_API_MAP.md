# Mobile API map

The HTTP surface a Gulyaly customer app can actually use, extracted from the Nest controllers
(decorators, guards, roles) and verified against production where the endpoint is public.

**Base URL:** `https://api.gulyaly.pro/api` — note the `/api` prefix; it is part of the path, not
the host.

**Totals:** 157 routes overall; 69 are customer-facing (not `/admin/*`, not the API-key partner
channel). Of those, 19 are public and the rest need a JWT.

## Error envelope

Every error passes through `AllExceptionsFilter` and comes back in one shape:

```json
{ "code": "BAD_REQUEST", "message": "Некорректный email", "statusCode": 400 }
```

`code` is the `HttpStatus` name. `message` is **either a string or an array of strings** — Nest
returns an array for validation failures. A client that types it as `String` renders
`first,second` with no space, which is exactly the bug the web client had. Type it as
`String | List<String>` and join deliberately.

Server messages are frequently already in Russian and safe to show. Prefer them over a generic
fallback when present.

## Pagination

**There is none.** No customer list endpoint accepts `page`, `limit`, `cursor`, `skip` or `take` —
`/orders/me`, `/gallery/orders/me`, `/gallery/products`, `/stories` and the rest return the full
set. At current volume (5 products, 1 order) this is invisible; it is a real gap before launch.
See [MOBILE_API_GAPS.md](MOBILE_API_GAPS.md).

---

## Authentication

Access token is a short-lived JWT (`JWT_ACCESS_TTL`, default 15m). Refresh token is an opaque
48-byte hex string, stored server-side only as a SHA-256 hash, **single-use and rotated on every
refresh**.

| Method | Path | Auth | Throttle |
|---|---|---|---|
| POST | `/auth/register` | public | 10/min |
| POST | `/auth/login` | public | 10/min |
| POST | `/auth/refresh` | public | 10/min |
| POST | `/auth/password-reset/request` | public | 5/min |
| POST | `/auth/password-reset/confirm` | public | 5/min |
| GET | `/auth/me` | jwt | 20/min |
| PATCH | `/auth/me` | jwt | — |
| PATCH | `/auth/me/locale` | jwt | — |
| POST | `/auth/change-password` | jwt | 10/min |
| GET | `/auth/sessions` | jwt | — |
| DELETE | `/auth/sessions/:id` | jwt | — |
| POST | `/auth/logout-all` | jwt | — |

**Login / register response**

```json
{
  "accessToken": "eyJ…",
  "refreshToken": "9f2c…",
  "user": {
    "id": "cuid", "phone": "+993…", "fullName": "…", "username": "…",
    "role": "CUSTOMER", "avatarUrl": "https://…|null", "locale": "ru"
  }
}
```

`register` takes `{ phone, password, fullName?, referredByUsername?, locale? }`. Login is
**phone + password** — there is no email login. Password bounds are 8–72 characters.

**Refresh** takes `{ refreshToken }` and returns a fresh `{ accessToken, refreshToken }` with no
`user`. The old refresh token is revoked atomically, so two concurrent refreshes cannot both
succeed — one gets 401. This is precisely why the mobile client needs single-flight refresh: five
parallel 401s must produce **one** refresh call, not five.

**Password reset** is by email and answers identically whether or not the account exists —
`{ sent: true, expiresInMinutes: 15 }` in every case. The confirm step takes
`{ email, code, newPassword }` where `code` is exactly six digits, and revokes every session on
success, so the app must route to login afterwards.

---

## Account and profile

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/auth/me` | jwt | Profile |
| PATCH | `/auth/me` | jwt | `{ fullName, phone?, locale? }` |
| PATCH | `/auth/me/locale` | jwt | `{ locale }` — `ru` \| `en` \| `tkm` |
| GET | `/account/email` | jwt | Verification state |
| POST | `/account/email/request` | jwt | Sends a 6-digit code |
| POST | `/account/email/confirm` | jwt | `{ code }` |
| GET | `/account/email/preferences` | jwt | Marketing opt-ins |
| PATCH | `/account/email/preferences` | jwt | — |
| POST | `/avatar` | jwt | multipart, ≤5 MB, jpeg/png/webp |
| DELETE | `/avatar` | jwt | — |
| GET | `/documents` · POST · DELETE `/documents/:id` | jwt | ≤20 MB, ≤50 per user |

`locale` uses **`tkm`**, not the ISO `tk`. The mobile app must match or the server rejects it.

---

## Home content

All public, all returning plain arrays.

| Method | Path | Shape |
|---|---|---|
| GET | `/stories` | `id, title, subtitle, imageUrl, linkType, serviceId, galleryProductId, externalUrl, ctaLabel, badgeLabel, sponsorLabel, priceTmt, startsAt, endsAt, sortOrder` |
| GET | `/home-slides` | same shape as stories |
| GET | `/social-links` | `id, platform, label, url, sortOrder` |
| GET | `/content-pages/:slug` | CMS page by slug |

Stories and slides carry a `linkType` plus one of `serviceId` / `galleryProductId` /
`externalUrl` — the app routes on `linkType` rather than guessing from which id is non-null.
`startsAt` / `endsAt` mean the client must filter by time as well as `isActive`.

There is **no** `/home` aggregate endpoint. A home screen assembles itself from these four calls
plus `/catalog/services`.

---

## Top-up

| Method | Path | Auth |
|---|---|---|
| GET | `/catalog/services` | public |
| GET | `/catalog/services/:id/rates` | public |
| GET | `/catalog/payment-methods` | public |
| POST | `/orders` | jwt |
| GET | `/orders/me` | jwt |
| GET | `/orders/:id` | jwt |
| POST | `/payments/orders/:id/initiate` | jwt |
| GET | `/order-tracking?orderId=&recipientIdentifier=` | public |

**Service** (verified live): `id, code, name, description, logoUrl, inputType, validationRegex,
minAmountTmt, maxAmountTmt, isEnabled, sortOrder`.

`inputType` is `PHONE` or `ACCOUNT_ID` and `validationRegex` is a server-supplied pattern — the
app should apply that regex for input validation rather than hardcoding a phone format per
operator.

**Payment method:** `id, code, name, provider, feePercent, isEnabled, sortOrder`. Production
currently returns **exactly one** method, and its provider is `manual`.

**Creating an order** takes `{ serviceId, paymentMethodId, recipientIdentifier, amountTmt,
currency }`. The server computes `rateApplied`, `feeAmount`, `amountCharged` and any referral
discount and returns them on the order. The client sends the *requested amount* and displays what
comes back — it must never multiply a rate locally.

**Order states:** `PENDING_PAYMENT → PAID → PROCESSING → COMPLETED | FAILED`, with `CANCELLED`
and `REFUNDED` reachable from most states. Admin transitions are whitelisted server-side.

**Tracking** requires *both* the order id and the recipient identifier and returns a reduced
field set. It is the only order view available without a session.

---

## Gallery

| Method | Path | Auth |
|---|---|---|
| GET | `/gallery/categories` | public |
| GET | `/gallery/products?categoryId=&sellerId=&search=` | public |
| POST | `/gallery/orders` | jwt |
| GET | `/gallery/orders/me` | jwt |

`/gallery/products` **does** take filters, contrary to an earlier note here: `categoryId`,
`sellerId` and `search`. `search` is a case-insensitive `contains` across `name` **and** `sku` —
verified live, Cyrillic included (`?search=роз` → 1 result, `?search=FLW` → 2). Filtering
client-side is therefore unnecessary and wrong once the catalogue grows.

**Product** (verified live): `id, name, description, sku, priceTmt, imageUrl, categoryId,
category, sellerId, seller, isEnabled, sortOrder`. One image only — there is no gallery of images
per product.

**Order** takes `{ productId, recipientName, recipientPhone, deliveryCity, deliveryAddress,
cardMessage? }`. Price comes from the product server-side; the client never sends an amount.

Gallery order states: `PENDING_PAYMENT → PAID → PROCESSING → DELIVERED | CANCELLED`.

Note there is **no cart** and **no product-detail endpoint** — see the gaps document.

---

## Referral

| Method | Path | Auth |
|---|---|---|
| GET | `/referrals/me` | jwt |
| PATCH | `/referrals/username` | jwt |

The user's `username` doubles as their referral code, and is settable. Registration accepts
`referredByUsername`. Reward amounts are server configuration; the balance is applied
automatically as a discount at checkout, so the app displays it and never computes it.

---

## Support

| Method | Path | Auth |
|---|---|---|
| GET | `/support/thread` | jwt |
| POST | `/support/thread/messages` | jwt |

One thread per user, created on demand. The seller-scoped variants
(`/support/seller/:sellerId/thread`) are for the seller console, not the customer app.

**Polling only** — there is no websocket, SSE or push channel.

---

## Uploads

| Method | Path | Auth | Limits |
|---|---|---|---|
| POST | `/uploads/image` | jwt | 8 MB; jpeg, png, webp, gif |
| GET | `/uploads/:storedName` | public | local-disk fallback only |
| POST | `/avatar` | jwt | 5 MB; jpeg, png, webp |
| POST | `/documents` | jwt | 20 MB; 50 per user |

With S3 configured (production), uploads return an absolute public URL and `/uploads/:storedName`
is never used. Filenames are server-generated UUIDs; the client cannot choose them.

---

## Not available to the customer app

- `/admin/*` — 88 routes, staff only.
- `/partner/*` — API-key channel for B2B resellers, not for a mobile client.
- Seller console routes (`/sellers/me/*`, `/withdrawals`, `/stories/seller`,
  `/home-slides/seller`) require the `SELLER` role. A customer app should not implement them; a
  separate seller app could.
