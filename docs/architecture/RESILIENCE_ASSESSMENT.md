# Resilience assessment

**Status:** Working assessment — complements [`HIGH_AVAILABILITY.md`](HIGH_AVAILABILITY.md) and
[`RELIABILITY_TARGETS.md`](RELIABILITY_TARGETS.md), which remain the source of truth for the
topology and targets.
**Last updated:** 2026-09-17

This is a read-only assessment of how resilient the deployed system actually is today, scored by
layer, distinguishing what is *protected* from what is *proven* from what is *still open*. Every
claim below was verified against the source in this repo (workflows, `infra/`, `apps/api`), not
assumed from the docs.

---

## Verdict

Above average for a two-VPS MVP, with one clear single point of failure: the Postgres primary.
The app tier is genuinely active/active and self-healing; the data tier is deliberately manual
with **no automatic detection of a primary-database outage**, so the real recovery time is
bounded by a human noticing, not by the (already-proven) promote mechanics.

Layer scores (out of 5):

| Layer | Score | Notes |
|---|---|---|
| App tier (web/api/admin) | 5 | active/active on two nodes, auto-restart, auto-rollback |
| Release / deploy | 5 | immutable SHA tags, health-gated, auto-rollback, graceful shutdown |
| Database | 3 | streaming replica, but manual failover and no auto-detection |
| Data durability | 4 | hourly off-box S3 dumps + replica + S3-hosted files |
| Observability | 2 | Netdata present, but almost no alerts wired |
| Recovery (RTO) | 3 | 60 min target, but gated on human detection |

---

## What actually protects it (verified)

### 1. App tier is genuinely active/active

Both VPS (`109.238.95.125` and `91.184.250.89`) run `api`/`web`/`admin` continuously, both serve
real traffic, both talk to the single Postgres primary over the network. JWTs are stateless and
refresh tokens live in the shared database, so it does not matter which node answers a request —
no session affinity is needed. **A crash of primary's containers alone needs no failover at all**:
the secondary is already serving. See [`HIGH_AVAILABILITY.md`](HIGH_AVAILABILITY.md#topology).

> Status note: `infra/watchdog/gul-watchdog.sh` (updated 2026-09-03) records that the second
> `gulyaly.pro` A record went in on that date, so the secondary is now receiving real customers.
> The "what's left" section of `HIGH_AVAILABILITY.md` predates that change and is stale on this
> one point.

### 2. Self-healing (watchdog)

`gul-watchdog.timer` polls `127.0.0.1:4000/api/health/ready` every 30s and runs
`docker compose up -d` on failure. This is the fix for a real incident where Docker's own
`restart` policy did not bring a dead API back up. It was originally installed only on the
primary; `gul-watchdog.sh` now detects `/opt/gul-secondary` and works identically on both nodes —
closing the previous blind spot where an API dying on the secondary took half the traffic with it.

### 3. Deploy resilience

- Images are tagged by commit SHA (plus `:latest`), so every previous release stays addressable
  for rollback.
- The deploy records the outgoing tag and **auto-rolls back** if the new tag fails its health
  check, instead of leaving prod broken.
- `main.ts` calls `app.enableShutdownHooks()`, so the `SIGTERM` from `docker compose up -d` during
  a deploy drains in-flight requests instead of cutting them off.
- Log growth is capped (journald `SystemMaxUse=1G` per host), preventing a repeat of the
  "disk at 98%" incident.

### 4. Data durability

- A Postgres **streaming replica** (`pg-standby` on the secondary) continuously catches up to the
  primary — warm standby, async, RPO target ≤ 5 min.
- **Hourly `pg_dump` to off-box S3** (reg.ru private bucket), 30-day retention, atomic upload.
  There was a real gap between the August migration and 2026-09-02 when no backup ran at all (the
  systemd units lived on the server, not in an image); `install-db-backup-s3.yml` now reinstalls
  them.
- **Files are on S3**, not a per-host disk volume: avatars, documents, and general-purpose image
  uploads are all in S3-compatible storage reachable from either node, so failover no longer
  serves stale or missing files. See [`STORAGE.md`](STORAGE.md).

### 5. Financial integrity (also a resilience property)

Atomic conditional claims prevent double-spend on crash/retry across the money paths: top-up
delivery is at-most-once (`QUEUED → SENT`), gallery seller credit, withdrawal refund, and referral
reward are all claimed atomically. `AuditLog` is wired into every financial operation. A crash
mid-operation strands the order in a reconcilable state rather than duplicating a charge. See
[`HIGH_AVAILABILITY.md`](HIGH_AVAILABILITY.md#financial-integrity-fixes-made-during-the-2026-08-26-audit).

---

## The single point of failure: the database

Everything converges on one Postgres primary. The app-tier failure is covered (above); a
*database* failure needs a human, and here are the two real gaps.

### Gap 1 — no automatic detection of "primary DB is down"

Nothing pages a human on that specific condition today
([`HIGH_AVAILABILITY.md`](HIGH_AVAILABILITY.md#who-notices-and-how)):

- UptimeRobot alerts on "site is down", which is a *symptom* that could mean either "app crashed"
  (no failover needed) or "database gone" (failover needed) — it is not a diagnosis.
- The watchdog only checks `127.0.0.1` **from the primary itself**, which is useless when the
  primary is fully down (a dead VPS cannot run its own watchdog).
- A Telegram reachability check **from the secondary** (the one node positioned to notice and act)
  is in progress in `infra/watchdog/` but not wired up yet, pending a destination chat ID.

### Gap 2 — failover is deliberately manual (correct for two nodes)

This is an explicit decision, not an omission: with two nodes and no third witness, there is no
safe way to distinguish "primary is down" from "the link to primary is down", and auto-promoting
on that ambiguity risks split-brain with real money involved
([`HIGH_AVAILABILITY.md`](HIGH_AVAILABILITY.md#whats-automatic-vs-manual-and-why)):

- `failover-to-secondary.yml` requires provider-level fencing plus two confirmation strings
  (`confirm=FAILOVER`, `fence_confirm=PRIMARY_POWERED_OFF`).
- Patroni + an etcd witness node was considered and deliberately deferred until scale or on-call
  coverage justifies the added moving parts.
- **Failback is not automated**: after a promotion the old primary's WAL has diverged and needs a
  manual re-base before it can safely take writes again.

### Real RTO

The target in `RELIABILITY_TARGETS.md` is RTO ≤ 60 min. The actual RTO is "time until a human
notices" + "fencing time in the provider panel" + "~80s promotion". Until the primary-down alert
lands (Gap 1), real RTO can be **hours, not 60 minutes**. This is the single most impactful
number to improve.

---

## Proven vs unproven

**Proven by a real test:**

- Killing the api container led to the watchdog fix — real self-healing path exercised.
- A dry-run failover on 2026-08-28 ran `pg_promote()` for real and found/fixed two genuine bugs
  (missing `postgres` role → `-U gul_prod`; health-check window 30s → 80s).
- S3 upload / presign / delete round-tripped against the real buckets.

**Not proven by a real failure:**

- A genuine primary-*database* outage (the dry run proved the promote mechanics, not
  detection-under-a-real-incident).
- DNS-level failover under load.
- Failback in its entirety.
- Any "zero downtime" claim — `HIGH_AVAILABILITY.md` explicitly says to treat it as unproven until
  exercised.

---

## Secondary weak spots (non-critical, listed for completeness)

1. **Shared Redis is a soft SPOF.** Both nodes use the primary Redis for BullMQ, quotas and
   distributed throttles in normal operation. Redis is *not* a source of truth for money (Postgres
   is authoritative), and on failover the secondary starts its warm local Redis while durable
   Postgres sweepers reconstruct pending work. A Redis loss is a delay, not a money loss.

2. **Netdata alerts are not wired.** The engine has alerts built in, but nothing is configured
   ([`OBSERVABILITY.md`](OBSERVABILITY.md#what-this-doesnt-cover)); the only active alert is the
   disk >80% email. `RELIABILITY_TARGETS.md` requires alerts for replication lag, oldest job age,
   stuck orders, and backup freshness — none of which are wired today.

3. **No health-aware load balancing.** Traffic distribution is client-side DNS round-robin only
   (A records); a client can reach a half-dead node until its own timeout. Acceptable for two
   nodes, but there is no health-based routing.

4. **`Seller.balanceTmt` is not a ledger** (ADR-0003). Balances are a mutable running total rather
   than append-only, so there is no per-currency audit trail for dispute resolution. This is a data
   integrity gap, not an availability one, but it matters for a financial product.

---

## Highest-value improvements (by cost/impact)

1. **Primary-down alert from the secondary node** (Telegram channel half-built in
   `infra/watchdog/`) — closes the main RTO gap. Cheapest and most important step.
2. **Replication-lag alert (> 5 min)** — Netdata already supports it; just enable.
3. **Failback workflow** — the post-promotion restore is currently a hand sequence
   (`HIGH_AVAILABILITY.md`), worth turning into its own workflow before the next test.
4. **Seller balance ledger** (ADR-0003) — integrity, not availability, but the right hardening for
   a money-handling product.

---

## References

- [`HIGH_AVAILABILITY.md`](HIGH_AVAILABILITY.md) — topology, failover runbook, manual-vs-auto decisions.
- [`RELIABILITY_TARGETS.md`](RELIABILITY_TARGETS.md) — proposed SLOs and required alerts.
- [`STORAGE.md`](STORAGE.md) — S3 file storage and what it resolves for failover.
- [`OBSERVABILITY.md`](OBSERVABILITY.md) — Netdata/metrics/logs and the alert gap.
- `infra/watchdog/gul-watchdog.sh` — self-healing poll.
- `apps/api/src/health/health.controller.ts` — liveness vs readiness split.
