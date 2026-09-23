# ADR-0006: Marketplace purchase as a separate Cargo bounded context

**Status:** Accepted  
**Date:** 2026-09-08

## Context

“Выкуп из маркетплейса до дома” owns a cart, merchant review, product price, procurement and a
maximum payment authorization. Existing `Shipment` owns declared physical cargo and route
tracking. Sharing their tables or state machine would make payment and warehouse invariants
implicit and unsafe.

Official seller APIs are scoped to a merchant cabinet/catalog rather than being stable public-page
scraping APIs. For example, Yandex Market requires an API-Key with explicit cabinet permissions
and its offer-mapping method is scoped by `businessId`:

- https://yandex.ru/dev/market/partner-api/doc/ru/concepts/api-key
- https://yandex.ru/dev/market/partner-api/doc/ru/reference/business-offer-mappings/getOfferMappings

## Decision

- `MarketplacePurchaseOrder`, item snapshots, quote versions, account and append-only financial
  ledger are independent of `Shipment`.
- Inputs accept only HTTPS URLs whose exact normalized hostname is in the compiled marketplace
  allowlist. No request is ever sent to a customer-controlled URL.
- Source adapters may call fixed official API origins only. Until merchant credentials and a
  suitable product contract exist, all six sources use `ManualReviewMarketplaceAdapter`, which
  performs no network request. Scraping is prohibited.
- Manual review freezes title/external id/image/unit price/weight snapshots. Quotes are append-only
  versions and carry FX and weight-confidence snapshots.
- Quote acceptance records explicit consent and price cap but is `AUTHORIZATION_PENDING`; it does
  not claim payment. Existing account credit is atomically debited first. An ADMIN/MANAGER confirms
  the remaining external authorization with a provider-scoped unique reference and audit trail.
- Exact warehouse weight settles at most the authorized cap. Unused authorization becomes reusable
  account credit exactly once, with ledger evidence. Amount above cap becomes
  `FINAL_PAYMENT_DUE`; it is never silently charged.
- Financial cancellation/refund cannot use the generic status endpoint; a dedicated, idempotent
  confirmed-refund workflow owns its account and ledger writes.

## Consequences

- Adding a genuine API adapter requires provider credentials, contract tests and a fixed API
  origin, but no domain rewrite.
- Manual review adds operational latency while avoiding brittle scraping and SSRF.
- Marketplace balance is closed-loop service credit; external cash refund policy remains an
  operational/legal decision and must be represented by a confirmed external reference.
