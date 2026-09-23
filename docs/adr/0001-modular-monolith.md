# ADR-0001: Keep the backend as a modular monolith

**Status:** Accepted  
**Date:** 2026-09-06  
**Deciders:** Product owner and backend maintainers

## Context

Top-up, marketplace, cargo, referrals and communications share transactions and a small operating
team. The primary risks are incomplete provider integrations and state-layer recovery, not API
CPU isolation. Introducing distributed transactions now would make financial correctness harder.

## Decision

Keep one NestJS deployment unit and one PostgreSQL schema. Enforce domain boundaries through Nest
modules, exported application services, explicit state machines and import rules. A module may be
extracted only after an ADR identifies a measured scaling, isolation or ownership constraint.

## Options considered

| Option | Complexity | Transaction safety | Independent scaling | Operational cost |
|---|---|---|---|---|
| Modular monolith | Low | Strong | Process-level only | Low |
| Immediate microservices | High | Requires distributed workflows | Strong | High |
| Unstructured monolith | Low initially | Strong | Weak | Growing maintenance cost |

## Consequences

- Cross-domain financial changes can remain local PostgreSQL transactions.
- Deployments and local development stay simple.
- One bad runtime component can still affect the API process until workers are separated by role.
- Module boundaries need automated enforcement as the team and codebase grow.

## Action items

1. Add import-boundary checks for the domain map in `CURRENT_ARCHITECTURE.md`.
2. Keep controllers as transport adapters; prevent direct Prisma access from controllers.
3. Separate HTTP and worker process roles without splitting the database when runtime isolation is needed.
