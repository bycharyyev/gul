# ADR-0002: Domain-scoped contracts and API client resources

**Status:** Accepted  
**Date:** 2026-09-06  
**Deciders:** Frontend, mobile and backend maintainers

## Context

One schema file and one API client class grew past one thousand lines. They made unrelated
domains conflict and encouraged a single shared package to become a new monolith. Existing web
and admin code imports from the package root, so a flag-day rewrite would create avoidable risk.

## Decision

Contracts and client resources are split by business domain. Package-root exports and flat
`ApiClient` methods remain compatibility facades while applications move incrementally to
namespaced resources such as `api.auth.login()` and `api.cargo.track()`.

## Options considered

| Option | Migration risk | Domain ownership | Consumer compatibility |
|---|---|---|---|
| Incremental domain modules plus facade | Low | Strong | Preserved |
| Immediate breaking rewrite | High | Strong | Broken |
| Keep single files | None now | Weak | Preserved |

## Consequences

- New domain changes touch smaller files with clearer ownership.
- Existing clients continue compiling throughout the migration.
- Compatibility aliases temporarily duplicate the public surface and must be removed only in a
  planned major version.
- Flutter remains separately generated/maintained until OpenAPI generation is introduced.

## Action items

1. Use domain files for every new contract.
2. Continue extracting client resources when their domain is next modified.
3. Migrate application call sites to namespaced resources incrementally.
