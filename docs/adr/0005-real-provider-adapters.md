# ADR-0005: Payment and top-up provider boundaries

**Status:** Accepted

**Date:** 2026-09-06 (revised 2026-09-07)

## Context

Gulyaly had only manual payment confirmation and a mock top-up implementation. Leaving the mock on
the production execution path could report a fictitious fulfillment as successful. Vendor APIs also
differ in signatures, state vocabularies, idempotency and product identifiers.

A first revision of this ADR named YooKassa as the concrete acquiring adapter and shipped one. That
was reverted on 2026-09-07: **which payment processor to use is still an open business decision**,
and shipping an adapter for a vendor nobody has committed to meant carrying credentials plumbing,
a seeded payment method and a vendor-shaped webhook contract for a service that may never be used.

## Decision

**Build the boundary, not the vendor.** Ship the full provider-neutral payment pipeline and keep
`manual` as the only registered provider until an acquirer is chosen.

The boundary is `PaymentProvider` (`apps/api/src/payments/providers/payment-provider.interface.ts`):
`initiate` (receiving the durable application idempotency key), optional `lookup`, and optional
`verifyAndParseWebhook`. Verification and parsing are deliberately one method so transport code
cannot persist an untrusted event before the adapter has authenticated the exact raw bytes.

Everything around that boundary is already built and vendor-independent:

- durable per-order initiation guard (an unresolved attempt cannot be charged twice),
- `Payment` written *before* the provider call, with `UNKNOWN` on an ambiguous network outcome,
- verified webhook inbox (`PaymentEvent`) deduplicated on the provider's own stable event id,
- reconciliation sweep that re-queries stale attempts and settles only on an exact amount and
  currency match,
- off-site redirect handling (`redirectUrl` → `/payment/return`).

Use a narrow HTTPS bridge contract for top-up fulfillment until a reseller-specific API is known.
The bridge receives an immutable order ID as its idempotency key and returns only `CONFIRMED`,
`DECLINED` or `UNKNOWN`. Transport and schema failures are ambiguous and are never blindly retried.

## Options considered

### Ship a concrete adapter now (YooKassa)

What the first revision did. Rejected on revision: it commits the codebase, the seed and the DNS/
webhook registration checklist to a vendor that has not been selected, and the adapter cannot be
verified at all without merchant credentials — so it was untested code carrying an implied decision.

### Invent a generic acquiring API and pretend it is configurable

Rejected. Authentication differs too much between acquirers (HMAC signature vs. credentialed
re-fetch vs. IP allowlist) to hide behind one config shape. The interface stays small and honest:
an adapter authenticates however its vendor requires and returns a normalized event.

### Build the boundary only, defer the vendor

Chosen. Selecting an acquirer later costs one file in `providers/`, one line in
`PaymentProviderRegistry`, and one `PaymentMethod` row.

### Put each top-up reseller directly in the API

Useful once a reseller is selected, but premature without its product mapping and outcome contract.
The bridge keeps those unstable details outside the order state machine.

## Consequences

- Card acceptance is not available. `manual` (staff confirms in the admin console) is the only
  enabled payment method, which is what production already does today.
- No vendor credentials, seeded vendor payment method or vendor webhook URL exist to leak or
  misconfigure.
- Verified provider success still cannot settle a mismatched amount or currency — that check lives
  in the core, not in an adapter, so it applies to whichever vendor is chosen.
- Production top-up is fail-closed unless `TOPUP_GATEWAY` is configured.

## Adding an acquirer later

1. Implement `PaymentProvider` in `apps/api/src/payments/providers/<vendor>-payment.provider.ts`.
   Authenticate webhooks in `verifyAndParseWebhook` before returning anything derived from them.
2. Register it in `PaymentProviderRegistry`, behind its own `isConfigured()` check so an
   unconfigured deployment simply does not expose it.
3. Insert a `PaymentMethod` row whose `provider` equals the adapter's `key`, `isEnabled = false`.
4. Configure credentials and `PAYMENT_RETURN_URL` in `/opt/gul/.env` on **both** hosts.
5. Register `https://api.gulyaly.pro/api/payments/webhooks/<key>` in the merchant account.
6. Run a sandbox payment end to end and read the resulting `PaymentEvent` row.
7. Only then set `isEnabled = true`.
