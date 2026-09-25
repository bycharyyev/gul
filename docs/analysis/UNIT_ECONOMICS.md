# Unit economics

**Reviewed:** 2026-09-26 · **Method:** how the code prices, charges, credits and pays out
(`schema.prisma`, `orders`, `gallery`, `cargo`, `seller-ledger`, `referrals`, `withdrawals`).
**Limit:** the platform has no paying customers yet and this review had no access to production
figures or supplier invoices, so it establishes **what the system can and cannot measure**, gives
the formulas, and supplies the queries that turn production data into real numbers. Where a number
is an example, it says so.

## Summary

1. The system records **revenue but not cost**. An order stores the customer's charge, fee and rate,
   never what the platform paid a supplier. Margin per order cannot be computed from the database.
2. The marketplace has **no take rate**. When an order is delivered the seller is credited 100% of
   its amount. Seller-side revenue comes only from advertising, which is sold at fixed prices.
3. Several revenue levers are configurable without a deploy (top-up fee per payment method,
   marketplace-purchase fee and shipping, cargo tariffs and exchange rates) and several are not (ad
   prices are constants in code).
4. Top-up fulfilment is still mocked, so **no real supplier cost exists yet**. Every top-up margin
   discussed below is provisional until a real operator or reseller is connected.

## How each stream earns

| Stream | What the customer pays | What the platform keeps | Cost tracked in the database? |
|---|---|---|---|
| Top-up order | `amountTmt × Rate(currency)` plus `PaymentMethod.feePercent` (default 0) | fee + the gap between the rate charged and the real cost of the currency and of the top-up | **No.** No supplier cost, no margin field |
| Marketplace (gallery) sale | product price (`GalleryProduct.priceTmt`) | **nothing**: `increment: order.amountTmt` credits the seller in full on delivery | n/a |
| Seller advertising | Story 50 TMT / 3 days, home slide 200 TMT / 3 days, debited from the seller's balance | 100% of the price | n/a (no cost) |
| Marketplace purchase (buy on a foreign site for the customer) | `subtotal + max(minimumFee, subtotal × serviceFeePercent) + weightKg × shippingPerKgTmt`; default fee 10% | the service fee, plus any shipping margin | Shipping cost: **No** |
| Cargo shipment | weight bracket `pricePerKgRub` (+ pickup fee) converted through USD cross-rates, snapshotted on the shipment | tariff minus the carrier's real charge | **No** |
| Referral | nothing | pays out a fixed TMT reward per qualifying referral (off by default) | Yes: `Referral.rewardAmountTmt` |

Seller balances (`Seller.balanceTmt`) are **liabilities**: money owed to sellers that leaves through
manual withdrawals (`WithdrawalRequest`, no payment gateway).

## Findings

| ID | Pri | Finding |
|---|---|---|
| E-01 | P0 | No cost basis on orders or shipments: margin, contribution and break-even cannot be measured |
| E-02 | P0 | Top-up fulfilment is mocked; the real cost of goods is unknown, and orders "complete" without delivery |
| E-03 | P1 | Marketplace take rate is 0%: gross sales grow, platform revenue does not |
| E-04 | P1 | Seller float is unmanaged: balances owed vs cash held is not reported |
| E-05 | P1 | Ad prices are constants in code (`STORY_AD_PRICE_TMT`, `SLIDE_AD_PRICE_TMT`) |
| E-06 | P1 | Foreign-exchange exposure: rates and cargo cross-rates are edited by hand, with no staleness alert |
| E-07 | P2 | Referral reward is a fixed amount, not tied to the margin of the qualifying order |
| E-08 | P2 | No cost model for refunds, failed top-ups and manual payment handling |

**E-01.** Add `costTmt` (and a supplier reference) to the order at the moment the top-up is
fulfilled, and a `costRub` snapshot to the shipment. Until then, margin is a spreadsheet exercise.
Nothing else in this document can be turned into a real number without it.

**E-02.** `TOPUP_GATEWAY=mock` with `TOPUP_ALLOW_MOCK_IN_PRODUCTION=true` is set on both hosts and
marks paid orders `COMPLETED` without contacting anyone. That is right for a demo and wrong for a
customer: a real payment would produce a "completed" order with no top-up. It must be removed at
launch (already noted in `CLAUDE.md`); treat it as a launch blocker, not a to-do.

**E-03.** Decide whether the marketplace should take a commission (common ranges are 5-15% of the
sale) and implement it as a ledger entry type (for example `PLATFORM_FEE`, negative on the seller
side) so the append-only ledger and its reconciliation keep working. Even 0% should be a
*setting*, not the absence of code.

**E-04.** Report `SUM(Seller.balanceTmt)` (owed to sellers) next to the cash actually held, and
alert when the ratio drops. Withdrawals are manual, so this is a real cash-management task.

**E-06.** Show "rate last updated" in the admin and alert when a rate or cross-rate is older than a
chosen age. A stale rate is a silent loss on every order placed while it is wrong.

## A model you can fill in

For one top-up order:

```
revenue      = fee + spread              (fee = amountTmt × feePercent; spread = charge - cost of currency)
contribution = revenue - supplier cost - payment cost - referral reward - support cost
```

Monthly break-even:

```
orders needed = fixed monthly cost / average contribution per order
fixed monthly cost = servers + storage + mail + domains + tools + people
```

Fixed cost lines to fill in from real invoices (not estimated here):

| Line | Where it is paid | Monthly |
|---|---|---|
| Primary VPS (SmartApe, 6 vCPU / 3.8 GiB) | hosting | ? |
| Secondary VPS (app tier, replica, mail relay) | hosting | ? |
| S3 storage (reg.ru; public and private buckets, backups) | reg.ru | ? |
| Domain and DNS | registrar / Timeweb | ? |
| Firebase | Spark plan | 0 (Remote Config is free up to 100,000 fetches a day) |
| Sentry | plan in use | ? |
| Google Play developer account | one-time | 25 USD once |

Illustration only, to show the arithmetic (replace every number): with an average top-up of
25 TMT, a 2% fee and a 1% spread, revenue is 0.75 TMT per order; if the other costs per order are
0.25 TMT, contribution is 0.50 TMT, and a fixed cost of 500 TMT a month needs 1,000 orders a month.

## Get the real numbers (run against the production database)

Read-only queries; adjust table and column names if the schema has moved (`\d "Order"` shows them).

```sql
-- 1. Top-ups by service and currency, last 30 days: volume, fees, average order
SELECT s."code", o."currency", COUNT(*) AS orders,
       SUM(o."amountTmt") AS gmv_tmt, SUM(o."feeAmount") AS fees, AVG(o."amountTmt") AS avg_order_tmt
FROM "Order" o JOIN "Service" s ON s."id" = o."serviceId"
WHERE o."status" = 'COMPLETED' AND o."createdAt" > now() - interval '30 days'
GROUP BY 1, 2 ORDER BY gmv_tmt DESC;

-- 2. Marketplace: sales delivered vs what the platform earned from sellers
SELECT (SELECT COALESCE(SUM("amountTmt"),0) FROM "GalleryOrder" WHERE "status" = 'DELIVERED') AS gross_sales_tmt,
       (SELECT COALESCE(-SUM("amountTmt"),0) FROM "SellerLedgerEntry"
         WHERE "type" IN ('STORY_AD_DEBIT','SLIDE_AD_DEBIT')) AS ad_revenue_tmt;

-- 3. Money owed to sellers right now
SELECT COALESCE(SUM("balanceTmt"),0) AS owed_to_sellers_tmt FROM "Seller";

-- 4. Referral cost paid so far
SELECT COUNT(*) AS rewards, COALESCE(SUM("rewardAmountTmt"),0) AS paid_tmt
FROM "Referral" WHERE "status" = 'REWARDED';

-- 5. Marketplace-purchase service fees quoted vs. delivered orders
SELECT COUNT(*) AS delivered, SUM(q."serviceFeeTmt") AS fees_tmt, SUM(q."shippingTmt") AS shipping_tmt
FROM "MarketplacePurchaseOrder" p
JOIN LATERAL (SELECT * FROM "MarketplacePurchaseQuote" WHERE "orderId" = p."id" ORDER BY "version" DESC LIMIT 1) q ON true
WHERE p."status" = 'DELIVERED';
```

## Metrics to put on the admin dashboard

Average order value and orders per customer (repeat rate) · gross sales vs platform revenue ·
take rate · ad slots sold vs offered · seller activation (approved sellers with a sale in 30 days) ·
referral cost per acquired customer · rate age · owed-to-sellers vs cash. The existing
`admin-stats` module and the analytics dashboard are the place to add them.

## Keeping this current

When a price, fee, tariff, reward or ledger type changes, update the "How each stream earns" table
in the same PR. Counts of models, routes and modules come from [FACTS.md](FACTS.md). Replace the
illustration with real numbers as soon as the queries above return data, and date the change.
