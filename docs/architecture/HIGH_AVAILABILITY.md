# High availability: current architecture and decisions

This documents the actual two-VPS setup as built, including the constraints that ruled out a
few options along the way. Written after a real audit of the codebase, not aspirational.

## Topology

| | Primary (`DEPLOY_HOST`) | Secondary (`91.184.250.89`) |
|---|---|---|
| Role | Serves production traffic | **Also serves production traffic** — app tier is active/active |
| Postgres | Read-write primary — the one authoritative database | Streaming replica (`pg-standby` container, async) **and** where secondary's own api container talks over the network by default |
| App containers | api/web/admin running, DB = local | api/web/admin running continuously, DB = **primary's, over the network** (not the local standby — that's read-only) |
| nginx + TLS | Live | Live, same certs, ready to serve real traffic today — just needs DNS to send it any |
| Subnet | `109.238.95.0/24` | `91.184.250.0/24` — a genuinely different network |
| Redis | Read-write Redis used by both app nodes in normal operation | Warm local Redis is started only during database failover |

Both are bootstrapped identically from GitHub Actions (`deploy` user, docker group, SSH key) —
no hand-configured server exists that isn't reproducible from this repo's workflows.

**Application HA and database HA are deliberately decoupled** (`enable-active-active.yml`): the
database stays simple single-primary/standby (no fencing/quorum complexity needed), while the app
tier is genuinely active/active because nothing stops a NestJS process on one VPS from talking to
a Postgres on another — `pg_hba.conf` on the primary allows the secondary's IP as any app user
(not just the `replicator` role used for streaming), and the secondary's `.env` has
`DATABASE_URL` pointing at the primary's IP instead of its own local (read-only) standby. This
means a crash of primary's *app containers alone* (the actual failure mode a real test already
hit once — see below) no longer needs any failover procedure at all: the secondary is already
serving correctly, unaffected. `failover-to-secondary.yml` is now reserved for the harder case —
primary's *database* is gone too.

## What's automatic vs. manual, and why

**Automatic:**
- Postgres streaming replication (continuous, `pg-standby` always catching up to primary).
- Deploys (push to `main` → build → GHCR → deploy → health-check → auto-rollback on failure).
- Nginx vhost sync (`sync-nginx.yml`, triggered by `infra/nginx/**` changes).
- Cert renewal (certbot timer + daily `gul-cert-sync.timer` expansion).

**Deliberately manual:**
- **Postgres promotion.** Two nodes with no third witness/quorum means there's no safe way to
  tell "primary is down" apart from "the network link to primary is down" from the standby's own
  point of view. Auto-promoting on that ambiguity risks both nodes accepting writes at once
  (split-brain) with real money involved. `failover-to-secondary.yml` requires provider-level
  fencing of the primary plus two independent confirmation strings before it can promote.

  **Considered and decided against automating this further (2026-08-28), pending revisit:**
  Patroni (or repmgr) *could* give sub-30s automatic failover, but only safely with a real
  quorum — that means a **third node** running just enough to break ties (etcd participant; it
  doesn't need to run Postgres itself, a small "witness" VPS is enough). Rough cost/risk if this
  is picked up later:
  - **Infra cost**: one more cheap VPS (etcd's footprint is small — 1 vCPU/1GB RAM/a few GB disk
    is plenty; the meaningful requirement is low-latency disk for etcd's fsync-heavy writes, not
    size). Ballpark a few dollars/month at the same provider — get an exact quote before
    committing, don't plan against a guess.
  - **Engineering cost**: real, not incremental. Patroni takes over what's currently manual
    (`pg_basebackup`/`pg_promote`) — `setup-replication.yml` and `failover-to-secondary.yml`
    would both need replacing with Patroni-native tooling, plus the staging failover-testing pass
    this doc's own rules require before touching prod. This is a multi-day project done properly,
    not a config toggle.
  - **New operational surface**: etcd + Patroni are two more systems to understand, monitor, and
    keep patched — and a misconfigured automatic failover is a well-known way *real* outages get
    created, not just prevented.
  - **Decision for now**: stay semi-manual — `failover-to-secondary.yml` already exists as a
    single confirmed command; what's missing is an *alert* that tells a human to run it (see
    "monitoring" below). At current scale (a handful of real customers), the operational
    simplicity and lower split-brain risk outweigh a faster RTO. Revisit option (a) when scale or
    on-call coverage actually justifies the added moving parts — this isn't a permanent no, just
    not yet.
- **DNS cutover.** Two things independently rule out automating this:
  1. **No VIP/VRRP is possible.** Investigated and rejected: keepalived-style floating-IP
     failover requires both nodes on the same L2 broadcast domain. These two VPS are on
     different subnets with different gateways (see table above) — a floating IP simply cannot
     move between them at the network layer. This isn't a config problem, it's how ARP/VRRP work.
  2. **DNS-provider API access — resolved 2026-08-27.** `gulyaly.pro`'s NS was pointed at
     Timeweb Cloud (registrar stayed reg.ru; Timeweb is now the authoritative DNS). Timeweb's API
     uses a plain Bearer token (`TIMEWEB_API_TOKEN` secret) with no IP allowlisting, unlike
     reg.ru's — see `manage-dns.yml` and the "DNS management" section in `CLAUDE.md`. Automating
     a real failover DNS cutover is now *possible* infrastructure-wise; still not done, since an
     automatic cutover on ambiguous "is primary really down" signal is the split-brain risk this
     doc already argues against — a human-triggered `manage-dns.yml` dispatch as the last step of
     `failover-to-secondary.yml` would be the shape of it, not an automatic trigger.
- **Routing across both nodes still needs one more DNS record.** The cheap way to get real
  client-side failover for the common case: add a *second* A record for `gulyaly.pro` (the
  wildcard already covers `www`/`admin`/`api`) pointing at the secondary's IP, alongside the
  existing one for primary. Most HTTP clients and browsers already retry the next A record on a
  connection failure. This is now a one-line `manage-dns.yml` dispatch away rather than a DNS-panel
  visit — genuinely not done yet only because it changes live traffic distribution, which is a
  bigger call than a docs update should make unilaterally. See "what's left" below.

## What "active/active" means here, precisely

- **App tier**: genuinely active/active. Both VPS run api/web/admin continuously, both able to
  serve any request, both talking to the same single Postgres (primary's). A user's JWT is
  stateless and refresh tokens live in that shared database, so which node answers a given
  request doesn't matter — no session affinity needed.
- **Database**: still single-primary/standby, unchanged. This is intentional, not a shortcut —
  seedes both nodes trying to accept writes independently (multi-primary) is a correctness hazard
  this project explicitly avoids.
- **Redis is shared in normal operation**: both app nodes use the primary Redis, so BullMQ jobs,
  quotas and distributed throttles have one coordination point. During a database failover the
  secondary switches to its warm local Redis; PostgreSQL sweepers reconstruct durable pending
  work, while non-authoritative transient counters restart.

## Failover procedure — for when primary's *database* is gone, not just its app tier

If only primary's containers/app crashed, there's nothing to do: the secondary is already
serving correctly (see above). This procedure is for when primary's Postgres itself is
unreachable/destroyed. **Decided 2026-08-28**: this stays semi-manual (human runs one confirmed
command) rather than automatic (Patroni + a witness node) — see the cost/risk note earlier in
this doc. What follows is the actual runbook that decision implies.

### Who notices, and how

There is currently **no automatic detection that specifically means "primary's database is
down"** — nothing pages a human on that condition today. What exists:
- **UptimeRobot** (external) polls the public endpoints and can alert on the *site* being down —
  but that's a symptom that could also mean "primary's app crashed" (which needs no failover at
  all, see above), not a diagnosis. Whatever channel UptimeRobot is configured to alert through
  is outside this repo — check its own dashboard, not assumed here.
- **`gul-watchdog.timer`** only checks `127.0.0.1:4000/api/health/ready` *from primary itself* and
  restarts local containers — useless if primary is unreachable rather than just unhealthy, since
  a dead VPS can't run its own watchdog.
- **A Telegram disk-usage alert is being added** (`infra/watchdog/`, in progress as of this
  writing) — the natural place to also add a primary-reachability check *from the secondary*
  (the one node actually positioned to notice primary going dark and to know it might need to
  act), so one alert covers both "disk full" and "primary might be down, here's the promote
  command." Not wired up yet pending a destination chat ID.
- Until that lands: the honest answer is a human has to notice the site is down (via UptimeRobot,
  a support ping, or checking directly) and then diagnose "is this app-tier-only (nothing to do)
  or actually the database (run the steps below)."

### The actual steps

1. **Diagnose first.** `curl https://api.gulyaly.pro/api/health/ready` failing doesn't by itself
   mean the database is gone — check `ssh` reachability to primary and `docker compose ps` there
   if at all possible. If primary's containers are just crashed/restarting and the VPS itself is
   reachable, this is the "nothing to do, secondary's already serving" case, not a failover case.
2. `prepare-secondary-failover.yml` — run this periodically, or right before a suspected
   failover if it's been a while, so certs/`.env` on the secondary are current. Non-destructive,
   safe to run anytime; also keeps `.env`'s `DATABASE_URL` pointed at primary (consistent with
   active/active) rather than resetting it to the local standby.
3. **Fence primary first** in the VPS provider control panel (power it off or apply a network
   fence that prevents PostgreSQL writes). SSH merely being unreachable is not sufficient proof.
4. **The promote command**: dispatch `failover-to-secondary.yml` with `confirm=FAILOVER` and
   `fence_confirm=PRIMARY_POWERED_OFF` —
   `gh workflow run failover-to-secondary.yml -f confirm=FAILOVER -f fence_confirm=PRIMARY_POWERED_OFF`.
   The workflow also refuses promotion while primary SSH is reachable, verifies the standby is
   still in recovery, and enforces a 16 MiB receive/replay lag gate. This one dispatch does
   everything below; nobody hand-edits a `.env` file or a connection string during a real
   incident:
   - Runs `SELECT pg_promote(wait_seconds => 60);` on `pg-standby` — **irreversible**, it
     stops following primary's WAL the instant this runs.
   - **How the app actually switches to the new master**: not DNS, not a config format change —
     just the *host* segment of `DATABASE_URL` in `/opt/gul-secondary/.env`. Before failover it
     reads `...@<primary's IP>:5432/...`; the workflow `sed`-rewrites it to `...@postgres:5432/...`
     (`postgres` is a docker-network alias that resolves to the now-writable local `pg-standby`
     inside `gul-net`), then `docker compose up -d --force-recreate api` so the api container
     picks up the new env on restart. User/password/database name are untouched — only where it
     connects changes.
   - Starts the secondary's local Redis, switches `PRIMARY_REDIS_HOST=redis`, recreates API, and
     health-checks it against the freshly promoted database and emergency queue.
5. **DNS**: if the second A record for `gulyaly.pro` → `91.184.250.89` (see "what's left" below)
   already exists, most clients fail over on their own via normal A-record retry — nothing to do.
   If it doesn't exist yet, add it via `manage-dns.yml` (Timeweb Cloud API — **not** the reg.ru
   panel; NS moved to Timeweb on 2026-08-27, see the "DNS management" section in `CLAUDE.md`). TTL
   is already low (300s).

**Resolved 2026-08-28 for avatars/documents:** these now live in S3-compatible object storage
(see [STORAGE.md](STORAGE.md)), reachable identically from either node — a failover no longer
loses or serves stale files for them. The local `uploads` volume itself still isn't synced to the
secondary, but nothing in the app writes there anymore once `S3_*` is configured (the fallback
path only activates when S3 env vars are unset, e.g. local dev).

**Failback** (old primary recovering after a promotion) is still not automated — see the
"deliberately manual" reasoning above; the old primary's WAL has diverged and needs a manual
re-base before it can safely take writes again. Don't just restart the old primary's Postgres and
assume it'll rejoin cleanly.

**Failback** (old primary comes back after a promotion): not yet built. The old primary's
Postgres would need to be re-based from the new primary (its own WAL has diverged since
promotion — it cannot simply rejoin) before it could safely take traffic back. Treat the old
primary as untrusted for writes until that rebuild happens; this is the "old-primary fencing"
piece a from-scratch HA design would normally automate, and it isn't automated here.

## Financial-integrity fixes made during the 2026-08-26 audit

Real races found by reading the actual code (not assumed) and fixed:

- **Top-up delivery**: `processTopup` had no idempotency guard — a crash after the operator
  gateway accepted a charge but before the result was recorded, followed by a BullMQ retry,
  could have sent the same top-up twice. Now claims `QUEUED → SENT` atomically first; a retry
  after that point is refused rather than resent (**at-most-once delivery, not exactly-once** —
  a genuine crash-mid-send now leaves the order stuck in `PROCESSING` for manual reconciliation
  instead of risking a second real charge). `jobId = orderId` in BullMQ adds queue-level dedup.
  Gateway exceptions are now caught and recorded as `FAILED` instead of leaving the job stuck.
- **Gallery order delivery** (`gallery.service.ts`): seller balance credit on `DELIVERED` was a
  plain read-then-write; two concurrent calls could both pass the check and double-credit. Now
  an atomic conditional update claims the transition first.
- **Withdrawal approve/reject**: same read-check-then-write pattern; reject's balance refund
  now happens inside the same transaction as the atomic status claim.
- **Referral rewards** (`maybeRewardReferral`): already correctly used an atomic conditional
  claim — no bug found here, confirmed by reading the code, not assumed.
- **`AuditLog`**: existed in the schema with zero writes anywhere in `apps/api/src`. Now wired
  into payment confirmation, admin order status changes, rate changes, seller application
  approve/reject, withdrawal approve/reject, gallery seller-balance credits, referral settings
  changes, and staff privilege changes.
- **Health checks**: `/health` checked only Postgres, no liveness/readiness split. Now
  `/health/live` (no dependencies — for a liveness probe that shouldn't restart the process over
  someone else's outage) and `/health/ready` (Postgres **and** Redis). `/health` stays as an
  alias of `/ready` for existing deploy/failover scripts that already curl that exact path.

## Redis: not a source of truth

Redis backs BullMQ, quotas and transient distributed counters. Postgres is authoritative for
money (orders, payments, seller balances). Both nodes share primary Redis normally. On failover,
secondary switches to its warm local Redis and durable database sweepers recreate pending work;
nothing financially authoritative lives only in Redis.

## What's left for both nodes to actually receive live traffic

`enable-active-active.yml` has run successfully — both nodes are up, both pass
`/api/health/ready` against the same primary database. What's still needed is purely on the DNS
side: **add a second A record for `gulyaly.pro` pointing at `91.184.250.89`**, alongside the
existing one for the primary. Until that exists, DNS still only ever hands out primary's IP, so
the secondary — while fully healthy and serving correctly if asked — never actually receives real
traffic today. This is no longer blocked on DNS-panel access (see the Timeweb API section above)
— it's a deliberate decision not yet made, not a capability gap.

## What hasn't been tested against a real failure yet

Verified: both nodes healthy against the shared primary database (`enable-active-active.yml`),
nginx/certs live on both.

**`failover-to-secondary.yml` was run for real on 2026-08-28** (test-phase, no real customers yet,
primary untouched throughout — a deliberate dry run of the runbook, not a real incident). Found
and fixed two real bugs the runbook had never surfaced before:
- `pg_promote()` was invoked via `psql` with no `-U`, which defaults to role "postgres" — but
  `pg-standby`'s data directory is a `pg_basebackup` copy of primary's, which has no such role
  (primary's actual superuser is `gul_prod`, from `POSTGRES_USER` in its `.env`). Promote failed
  outright with `role "postgres" does not exist` until fixed to `-U gul_prod`.
- The post-repoint health-check window (15 × 2s = 30s) was too short — the container needs more
  like 60-90s to finish settling into a fully-accepting-connections primary right after promotion.
  Widened to 40 × 2s = 80s.

With both fixed, a second run promoted cleanly: `pg_is_in_recovery()` → `f`, secondary's api
answered `/api/health/ready` with 200 against its own newly-writable local database. Confirmed the
runbook's steps and exact commands are otherwise accurate as written.

Afterward, restored the standby to its pre-test state (not part of a real failover, since primary
was never actually down): removed the diverged `pg-standby` container + volume, re-ran
`setup-replication.yml` for a fresh `pg_basebackup`, confirmed `pg_stat_replication` on primary
shows it streaming again, then re-ran `prepare-secondary-failover.yml` and force-recreated
secondary's `api` to re-point it back at primary's database (active/active mode). This restore
sequence isn't part of `failover-to-secondary.yml` itself and has no one-command equivalent yet —
worth turning into its own workflow if this needs testing again, rather than repeating it by hand.

**Still not tested for real**: an actual primary-*database* outage (this run proved the promote
mechanics, not detection-under-a-real-outage), or DNS-level failover under load (blocked on the
second A record, see above). The one real production failure test that *has* happened — killing
the api container — is what led to the watchdog timer (§ above); treat any other "automatic
failover" or "zero downtime" claim as unproven until it's actually exercised.
