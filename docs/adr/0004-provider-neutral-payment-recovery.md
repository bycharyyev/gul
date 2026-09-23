# ADR-0004: Provider-neutral payment recovery and webhook processing

**Status:** Accepted  
**Date:** 2026-09-06  
**Deciders:** Product owner and backend maintainers

## Context

Payment initiation currently writes a `Payment` before contacting the provider, which preserves
evidence of an attempted charge after a process crash. That is necessary but insufficient: an
HTTP retry can still create another attempt, a transport error cannot distinguish a declined
charge from an accepted-but-unreported charge, and there is no durable webhook inbox or automated
way to inspect stale attempts. Selecting a real card, SBP or crypto provider is a separate business
decision, but the consistency and recovery rules should not depend on that selection.

The system must avoid double charging, tolerate repeated requests and webhook deliveries, and
surface ambiguous payments without guessing their outcome. PostgreSQL remains authoritative;
provider calls and Redis queue delivery cannot participate in its transaction.

## Decision

Implement a provider-neutral payment lifecycle with explicit application statuses:
`INITIATING`, `PENDING`, `SUCCEEDED`, `DECLINED`, `UNKNOWN`, and `CANCELLED`. Provider-specific
status text is stored separately and cannot directly drive order transitions.

Payment initiation accepts an HTTP `Idempotency-Key` scoped to the order and requester. The key and
request identity are persisted before the provider call. Repeating the same logical request returns
the existing attempt and never calls the provider twice; reusing the key for different input is
rejected. A provider timeout, connection loss, malformed response, or process interruption with an
uncertain outcome moves the attempt to `UNKNOWN`, not `DECLINED` or a retryable failure.

The provider contract may implement lookup by the persisted idempotency key or provider transaction
reference. Lookup is optional because not every provider supports it. Recovery never starts a new
charge: it reads the existing provider-side result and applies only a verified terminal outcome.
Unsupported or still-ambiguous attempts remain visible for manual reconciliation.

Webhook delivery uses a durable inbox. A provider adapter verifies the signature against the raw
request body and normalizes the event to a stable provider event id, transaction reference and
application payment status. The event is persisted with a unique `(provider, eventId)` key before
business effects are applied. Duplicate delivery returns success without applying effects twice.
Stored payloads and operational logs must exclude credentials, signatures and unnecessary personal
or payment data.

A single settlement application service owns both webhook and manual confirmation. In one database
transaction it conditionally claims the payment as `SUCCEEDED`, transitions the order from
`PENDING_PAYMENT` to `PAID`, and creates the unique `TopupJob`. Queue publication happens after
commit and is recoverable from PostgreSQL by the existing stuck-order sweeper. Repeated settlement
of an already-settled payment is a successful no-op.

Provide a staff-only, read-only reconciliation view for stale `INITIATING` and `UNKNOWN` attempts,
including their age and safe references. A scheduled reconciliation pass may use provider lookup
when supported and may apply a verified terminal result, but it must never manufacture a new
payment attempt or auto-correct an ambiguous result. Stale counts and oldest age are exposed through
structured logs and operational alerts.

## Options considered

### Option A: Provider-neutral recovery contract and durable inbox

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Double-charge protection | Strong |
| Provider portability | Strong |
| Operational visibility | Strong |

**Pros:** Defines consistency before vendor selection; makes retries and duplicate webhooks safe;
preserves ambiguous evidence; supports both automated lookup and manual reconciliation.

**Cons:** Requires schema changes, a state machine, raw-body webhook handling and additional
operational tooling before the first real gateway is connected.

### Option B: Implement recovery inside each provider adapter

| Dimension | Assessment |
|---|---|
| Complexity | Low initially, high per provider |
| Double-charge protection | Inconsistent |
| Provider portability | Weak |
| Operational visibility | Fragmented |

**Pros:** A first provider can be integrated quickly using its native terminology and callbacks.

**Cons:** Core order semantics become vendor-specific; every integration repeats idempotency,
deduplication and reconciliation logic; switching providers becomes risky.

### Option C: Keep manual confirmation and investigate failures ad hoc

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Double-charge protection | Weak |
| Provider portability | Not applicable |
| Operational visibility | Weak |

**Pros:** No immediate implementation cost.

**Cons:** HTTP retries may create multiple attempts, ambiguous outcomes are mislabeled, repeated
webhooks cannot be processed safely, and stale payments depend on manual database inspection.

## Trade-off analysis

Option A adds moderate up-front work but keeps financially sensitive invariants in one application
service and one database, consistent with the modular-monolith decision. It deliberately does not
promise exactly-once communication with an external provider. Instead, stable identifiers,
conditional transitions and durable evidence make repeated delivery safe and uncertain outcomes
observable. Optional lookup avoids assuming capabilities that a future provider may not offer.

## Consequences

- A payment outcome has a canonical meaning independent of provider vocabulary.
- Retried initiation and webhook requests are safe under concurrency.
- Network errors no longer imply that a payment was declined or safe to retry.
- Manual confirmation and provider callbacks share one settlement path.
- PostgreSQL contains enough durable evidence to rebuild lost queue publication and investigate
  stale attempts.
- Provider adapters must implement signature verification and normalization; lookup remains an
  explicitly declared optional capability.
- `UNKNOWN` attempts may require human work and can remain unresolved when a provider offers no
  lookup API.
- Reconciliation reports and applies verified facts but never silently edits or deletes financial
  history.

## Action items

1. [x] Add the canonical payment status enum, timestamps and provider-status fields with a
   deterministic migration for existing rows.
2. [x] Add request-scoped HTTP idempotency and reject key reuse with different input.
3. [x] Extend the provider interface with capability-declared lookup and signed webhook parsing.
4. [x] Add the durable webhook event model and unique provider event constraint.
5. [x] Route manual confirmation, webhook success and verified lookup success through one
   transactional settlement service.
6. [x] Add the staff reconciliation endpoint and stale-payment alert.
7. [x] Test concurrent initiation, ambiguous errors, duplicate webhooks, settlement races and
   recovery after database commit but before queue publication.
