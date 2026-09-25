# Architecture review

**Reviewed:** 2026-09-26 · **Method:** the code knowledge graph (`graphify`, 9.5k nodes, no import
cycles), repository metrics from [FACTS.md](FACTS.md), and reading the largest and most connected
files. What the system *is* lives in [`../architecture/CURRENT_ARCHITECTURE.md`](../architecture/CURRENT_ARCHITECTURE.md);
this document is the assessment: what is sound, and what should change.

Priority: **P0** blocks launch · **P1** this quarter · **P2** when touched.

## Verdict

A disciplined modular monolith for its stage. Boundaries are respected (the graph shows **no import
cycles**), money movement is guarded by an enforced rule (any file that changes a stored balance
must write to a ledger; `scripts/check-architecture.mjs` fails the build otherwise), and the
operational story (migration policy, rollback rules, active/active app tier, backups, alerting) is
ahead of what a product with no paying customers usually has. The risks are concentrated in three
places: a few oversized hub files, **no automated tests for web and admin**, and a single-writer
database.

## The hubs (where change concentrates)

The graph ranks nodes by connections. The top ones are the places every change passes through:

| Hub | Connections | Note |
|---|---|---|
| `ApiClient` (`packages/api-client/src/client.ts`, 1,974 lines) | 283 | one class holds every endpoint of every domain |
| `CurrentUser`, `Roles()` decorators | 193 / 162 | expected: they are the access-control vocabulary |
| `PrismaService` | 103 | expected for a Prisma monolith |
| `ChatService` (1,075 lines) | 64 | second-largest service; chat, support and channels in one class |
| `EmailService` (829 lines) | 55 | sending, templates, unsubscribe, alerts |
| `confirmAction()` (admin dialog helper) | 62 | healthy: one dialog, used everywhere |

## Findings

| ID | Pri | Finding | Effort |
|---|---|---|---|
| A-01 | P0 | Web and admin (23k lines) have no automated tests | M |
| A-02 | P1 | `ApiClient` is a 1,974-line single class | M |
| A-03 | P1 | Very large files mix responsibilities (chat, email, admin pages) | M |
| A-04 | P1 | Single-writer PostgreSQL and Redis; failover is manual and unrehearsed | L |
| A-05 | P1 | Business constants live in code (ad prices) instead of settings | S |
| A-06 | P2 | Translations exist in three places | M |
| A-07 | P2 | The ops workflows are not indexed for an operator | S |
| A-08 | P2 | Framework debt: NestJS 10 (a security fix needs 11) | M |

### A-01 · No tests for web and admin

The API has 71 spec files and mobile has 53 test files; `apps/web` (81 files) and `apps/admin` (67
files) have none. These are the surfaces staff use to move money (payment reconciliation, payouts,
orders) and the surface customers pay on (the top-up wizard). A regression there is found by a
person, in production.
**Fix:** start with a handful of end-to-end smoke tests (login, top-up wizard to the payment step,
admin order list) and unit tests for pure logic (price and fee display, validators). Run them in CI.

### A-02 · `ApiClient` as one class

Every endpoint added by any team touches one 1,974-line file, which is also the most connected node
in the graph. The migration to namespaced resources (`api.auth.*`, `api.cargo.*`) has started
(documented in `CURRENT_ARCHITECTURE.md`) but most methods are still flat.
**Fix:** finish the namespacing, one domain per file, and keep a thin facade that composes them.
The graph confirms the split is safe: no cycles run through it.

### A-03 · Oversized files

Largest source files: `chat.service.ts` 1,075 · `web/.../chat/page.tsx` 1,066 · `email.service.ts`
829 · `web/.../account/page.tsx` 807 · `admin/.../cargo.tsx` 782. Long files are not wrong by
themselves, but these each combine several reasons to change. Split when next modified: chat into
rooms, threads and channels; email into sending, templates and alerts.

### A-04 · One writer, manual failover

PostgreSQL has one writer and an asynchronous standby; Redis is one instance shared by both API
nodes; promotion and failback are manual (`failover-to-secondary.yml`). The application tier is
genuinely active/active, so a crashed app container costs nothing, but the loss of the primary host
means minutes of manual work and a small window of lost writes.
**Fix in order:** (1) run a **restore drill**: restore last night's S3 dump into an empty database
and record the time (backups exist and are hourly, but a backup that has never been restored is a
guess); (2) rehearse the failover once and write the measured RTO into `RELIABILITY_TARGETS.md`;
(3) only then consider a managed database or automatic failover.

### A-05 · Constants that should be settings

Story advertising costs 50 TMT and a home-slide 200 TMT, each for 3 days
(`STORY_AD_PRICE_TMT`, `SLIDE_AD_PRICE_TMT` in code). Changing a price is a deploy. Move them to
`PlatformSettings` with an admin screen; the marketplace-purchase fee already follows this pattern.

### A-06 · Translations in three places

`packages/i18n` (web and admin), `strings.dart` (mobile, 1,782 lines) and the push templates hold
overlapping ru/en/tkm text. Turkmen was written without a native reviewer. Drift is likely; agree on
one source of truth (a JSON catalogue exported to both) and have the Turkmen strings reviewed.

### A-07 · Operations workflows

`.github/workflows/` holds the deploy pipeline plus failover, backups, DNS and diagnostics tooling
(count and list in FACTS.md). They are reusable tooling and the documents refer to them, so they stay, but nothing
tells a new operator which one to reach for. Add a table (name, when to run, risk) to
`docs/`; it is a small task with a large effect at 3 a.m.

### A-08 · Framework debt

NestJS 10 (a security fix requires 11, see S-02), Prisma 6, Flutter pinned at 3.38.5 on purpose
(CI is pinned for the same reason). Schedule upgrades as their own tasks; do not let them arrive
inside feature PRs.

## Strengths to keep

- Enforced rules, not conventions: ledger writes, no direct Prisma in controllers, no undeclared
  imports, migration policy, destructive-migration rollback guard.
- Snapshots on money: price, fee, tariff and exchange rate are copied into the order when it is
  created, so a later edit never rewrites history.
- Idempotency keys on payments and ledger entries; ambiguous provider outcomes are never retried
  blindly.
- Partner and shop APIs are versioned (`/api/v1/...`) and have a written governance policy;
  first-party routes are not, deliberately.
- Observability without new infrastructure (Netdata, Sentry, request ids, an API-usage read model).

## Keeping this current

`graphify update .` refreshes the code graph in under a minute (it needs no LLM and no cost); a git
hook can run it after every commit (`graphify hook install`). Regenerate [FACTS.md](FACTS.md) with
`pnpm docs:facts`. Re-run the hub ranking with `graphify god-nodes --top 25` and update the table
above only when a hub changes materially.
