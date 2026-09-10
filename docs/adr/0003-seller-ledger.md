# ADR-0003: Append-only seller balance ledger

**Status:** Accepted  
**Date:** 2026-09-06  
**Deciders:** Product owner and backend maintainers

## Context

`Seller.balanceTmt` was the only record of seller money. Atomic updates prevented known double
credits, but could not explain how a balance was produced or prove that all debits and credits
were recorded.

## Decision

Every seller balance mutation writes a signed `SellerLedgerEntry` in the same PostgreSQL
transaction. `Seller.balanceTmt` remains a read cache and must equal the sum of ledger entries.
Entries are append-only and carry a globally unique idempotency key plus a business reference.
Historic non-zero balances receive one `OPENING_BALANCE` entry during migration.

## Options considered

| Option | Auditability | Read performance | Migration risk |
|---|---|---|---|
| Ledger plus cached balance | Strong | Strong | Medium |
| Calculate only from ledger | Strong | Medium | Medium |
| Keep mutable balance only | Weak | Strong | Low |

## Consequences

- Balance disputes can be reconstructed by business event.
- Duplicate financial writes fail on the idempotency constraint.
- Every future balance mutation must update the cache and ledger in one transaction.
- Reconciliation reports mismatches but never auto-corrects financial data.

## Action items

1. Alert when the reconciliation endpoint returns any row.
2. Add controlled compensating `ADJUSTMENT` entries instead of editing old entries.
3. Define retention/export policy for financial evidence.
