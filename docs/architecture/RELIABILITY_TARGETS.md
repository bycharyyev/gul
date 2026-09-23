# Reliability targets

**Status:** Proposed — requires product-owner approval  
**Last updated:** 2026-09-06

These are initial targets, not claims about current production performance.

| Capability | Proposed target | Measurement |
|---|---|---|
| Public API availability | 99.9% monthly | external readiness probe |
| Customer read request | p95 < 500 ms | API route-template metrics |
| Customer write request | p95 < 1 s, excluding provider completion | API metrics |
| Critical email enqueue | 99% < 30 s | outbox creation to queue time |
| Top-up final state | 99% < 5 min after confirmed payment | payment confirmation to terminal order state |
| Database RPO | <= 5 min | replica replay position plus backup coverage |
| Database RTO | <= 60 min | timed failover drill |
| Upload RPO | 0 after successful S3 response | object-store durability |
| Backup restore | successful monthly | isolated restore report |

## Required alerts

- readiness failure on either application node;
- replication lag over five minutes;
- no successful database backup within two hours;
- critical email oldest-job age over one minute;
- confirmed payment without a queued or terminal order;
- top-up in `PROCESSING` beyond the reconciliation threshold;
- disk free space below the deployment safety threshold;
- seller cached balance differing from the future ledger total.

## Review

Approve or adjust these targets before selecting managed PostgreSQL, Redis HA or automatic
failover tooling: architecture cost should follow an explicit recovery requirement.
