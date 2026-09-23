# Order notifications & stats — real end-to-end test (2026-08-29)

Tested by creating real orders against production via the API (not mocked), reading actual DB/log
state, then cleaning up. Findings below are from that test, not from reading the code alone.

## Regular top-up Order → customer email: works, but structurally unreachable

`sendOrderCreated` (on order creation) and `sendOrderStatusUpdate` (on COMPLETED/FAILED) both fire
correctly and the relay delivers — confirmed with a real order (TMCELL, $0.62, full
`PENDING_PAYMENT → PAID → PROCESSING → COMPLETED` cycle in ~9s): both `ORDER_CREATED` and
`ORDER_COMPLETED` rows in `EmailLog` show `status: SENT`, no error.

**But:** there is no way for a `User.email` to ever be set anywhere in the product —
not on `POST /auth/register`, not on `PATCH /auth/me` (self-service profile update), not even on
`PATCH /users/:id` (admin user edit). All three DTOs were checked directly; none has an `email`
field. The column exists and the send logic is correct, but **no real customer's order
confirmation email can ever actually fire** — the only reason this test's emails sent at all is
that the address was set directly in the database for the test, then reverted afterward. This
needs a product decision (a real editable-email field somewhere), not a code fix here.

## GalleryOrder → seller Telegram notification: code is correct, currently unreachable in prod

`GalleryService.createOrder` fires `TelegramBotService.notifyNewOrder` synchronously on creation
(not on a later status change) — but only `if (product.sellerId)` is set. Checked: **every one of
the 5 seeded gallery products has `sellerId: null`**, and `GET /sellers/admin` returned `[]` —
**there are zero real sellers in production right now.** So this path has never fired for real and
can't yet, structurally, until a seller actually signs up and links a product.

Verified the code itself is correct by creating a throwaway test seller (`test_seller_qa`,
disabled again afterward) and temporarily assigning them an existing product, then placing a real
order: no crash, no error in logs. `TelegramBotService.notifySeller`
(`apps/api/src/telegram-bot/telegram-bot.service.ts:58-66`) does
`if (!seller?.telegramChatId) return;` with **no log line** on that branch — a real message could
only be confirmed by an actual seller with a linked Telegram chat, which nobody has done yet. Note
for later: that silent return means if a real seller's notification ever silently fails to have a
chat linked, there's currently zero trace of it — worth a debug-level log if this becomes a
support question down the line, not urgent now.

## Admin notification: doesn't exist, by design as built

No email, Telegram, webhook, or any other push notification to admin/staff for a new order of
either kind — confirmed by reading `orders.service.ts`, `payments.service.ts`,
`gallery.service.ts`, `telegram-bot.service.ts` end to end. Admin only finds out by checking the
dashboard/orders list. This may be intentional (low order volume for now) or may be worth adding
later — a product decision, not something broken.

## Statistics

`GET /admin/stats` correctly reflects regular `Order`s — the test order above showed up
immediately (`totals.orders: 1`, `ordersByStatus.COMPLETED: 1`, `queue.completed: 1`, and this
*is* the very first real order in this prod database, hence the totals being exactly 1).

**`GalleryOrder`s are entirely excluded from `AdminStatsService`** (`admin-stats.service.ts`) —
confirmed by code (`getStats()`/`getOrdersTimeseries()` both query only `"Order"`) and by the test
(the GalleryOrder created during this test didn't move any number in `/admin/stats`). Flower/gift
shop revenue and volume are invisible on the main admin dashboard entirely; `getDatabaseOverview()`
does count `galleryOrders` as a raw row count but nowhere near the actual stats/timeseries. Whether
this is intentional (gallery treated as a separate vertical, per CLAUDE.md) or a real gap worth
folding in is a product call — flagging it rather than deciding it.

Seller-facing analytics (`GET /sellers/me/timeseries`, `/sellers/me/top-products`) is a separate,
correctly-scoped-to-GalleryOrder system and wasn't touched by this gap — not tested live tonight
since it needs an actual logged-in seller session.

## Test data left behind (cleaned up where possible)

- One real `Order` (TMCELL, $0.62, COMPLETED) under the seed admin account — no delete endpoint
  exists for orders; harmless, left as-is.
- One real `GalleryOrder` (Тюльпаны, 220 TMT) under the same account, same reasoning.
- Seller `test_seller_qa` — created, then disabled (`isEnabled: false`); no seller-delete endpoint
  exists. Its user account (`+70000000099`) still exists too, for the same reason.
- The Тюльпаны product's `sellerId` was reassigned to the test seller and reverted back to `null`.
- The seed admin's `email` was set to a real address for the send test, then reverted to `null`.
