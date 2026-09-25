# Project analysis

The current, evidence-based assessment of Gulyaly, kept next to the code so it can be updated in the
same pull request as the change that makes it stale.

| Document | Question it answers |
|---|---|
| [SECURITY.md](SECURITY.md) | What can be attacked, what is already protected, and what to fix first |
| [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) | Is the structure sound, where is change concentrated, what is the debt |
| [UNIT_ECONOMICS.md](UNIT_ECONOMICS.md) | How does each stream earn, what can the system measure, what is missing |
| [UX_AND_BEHAVIOR.md](UX_AND_BEHAVIOR.md) | How does the product look and behave, including under bad conditions |
| [FACTS.md](FACTS.md) | Every countable fact (generated, never edited) |

What the system *is* is described in [`../architecture/CURRENT_ARCHITECTURE.md`](../architecture/CURRENT_ARCHITECTURE.md);
these documents assess it. Reviewed 2026-09-26.

## Before real customers (P0)

| ID | Item | Where |
|---|---|---|
| A-09 | **Database backups are probably not being made** (dedicated backup storage not configured on the primary); fix and prove with the restore check | [ARCHITECTURE_REVIEW](ARCHITECTURE_REVIEW.md) |
| E-02 / U-01 | Connect a real top-up supplier and delete the mock gateway flag; today a paid order shows "completed" with nothing delivered | [UNIT_ECONOMICS](UNIT_ECONOMICS.md) |
| E-01 | Record the supplier cost on every order and shipment so margin can be measured | [UNIT_ECONOMICS](UNIT_ECONOMICS.md) |
| S-01, S-02 | *Fixed 2026-09-26:* Next.js, multer, nodemailer, sharp bumped (NestJS 11 upgrade still open) | [SECURITY](SECURITY.md) |
| S-03 | Security headers on the web and admin sites | [SECURITY](SECURITY.md) |
| S-04 | Close the public API documentation in production | [SECURITY](SECURITY.md) |
| A-01 | Smoke tests for the top-up flow and the admin money screens | [ARCHITECTURE_REVIEW](ARCHITECTURE_REVIEW.md) |
| n/a | A payment acquirer is not chosen yet (only manual confirmation exists) | [`../adr/0005-real-provider-adapters.md`](../adr/0005-real-provider-adapters.md) |

## This quarter (P1)

S-05 tokens out of `localStorage` · S-06 public repository documents production · S-07 SSH password
login on the secondary · S-08 second factor for staff · S-09 analytics only after consent · E-03
marketplace take rate · E-04 seller float report · E-05 ad prices to settings · E-06 rate staleness
alert · A-02 split `ApiClient` · A-03 split oversized files · A-04 restore drill and failover
rehearsal · U-02 offline behaviour · U-03 accessibility · U-04 real consent · U-05 Turkmen review.

## How this stays true

Three mechanisms, none of which depends on anyone remembering:

1. **Generated facts.** `pnpm docs:facts` rewrites [FACTS.md](FACTS.md) from the tracked files
   (routes, models, migrations, tests, screens, workflows, dependencies). The `Docs facts` workflow
   runs `pnpm docs:check` on every pull request and fails when the file is stale, so a change that
   moves a number must carry the regenerated file.
2. **Code knowledge graph.** `graphify` keeps a queryable graph of the code in `graphify-out/`
   (git-ignored, regenerated on demand). `pnpm graph` (or `graphify update .`) refreshes it in under a
   minute with no cost, and `graphify hook install` refreshes it after every commit. Ask it instead
   of re-reading the repository: `graphify query "<question>"`, `graphify path "A" "B"`,
   `graphify explain "X"`, `graphify god-nodes`. The report is `graphify-out/GRAPH_REPORT.md`.
3. **A rule for prose.** A pull request that changes behaviour updates the finding or the table it
   affects in these documents (see "Keeping this current" in each). Findings are never deleted: when
   one is fixed, its row gets a date and the word *fixed*, so the history of decisions survives.

When a finding is fixed, or a new one is found, edit the register above and the detail document in
the same PR. A review like this one should be repeated after any large release, and at the latest
before launch.
