# Top-up provider bridge contract

Gulyaly can use a reseller/operator bridge by setting `TOPUP_GATEWAY=http`. The bridge is a real
external integration boundary: it maps Gulyaly service IDs to vendor product IDs and normalizes the
vendor result. The API refuses non-HTTPS endpoints and fails startup when required configuration is
missing.

## Request

`POST {TOPUP_HTTP_BASE_URL}/topups`

Headers:

- `Authorization: Bearer <TOPUP_HTTP_API_KEY>`
- `Idempotency-Key: <order id>`
- `Content-Type: application/json`

Body fields are `idempotencyKey`, `orderId`, `serviceId`, `recipientIdentifier`, and
`amount: { value, currency: "TMT" }`.

The bridge must bind an idempotency key to exactly one immutable request and return the original
result for every retry. It must never start a second top-up for the same key.

## Response

Return HTTP 2xx with:

```json
{"outcome":"CONFIRMED","operatorRef":"vendor-reference"}
```

`outcome` is exactly one of:

- `CONFIRMED`: the vendor definitively completed the top-up;
- `DECLINED`: the vendor definitively rejected it and guarantees it cannot complete later;
- `UNKNOWN`: accepted/pending or otherwise ambiguous; Gulyaly keeps the order in reconciliation
  and never blindly retries it.

Transport errors, non-2xx responses, malformed JSON, and unknown values are treated as `UNKNOWN`.
Do not include credentials, full vendor payloads, or customer data in error messages.
