# Ops workflows — which one to reach for

Every workflow in `.github/workflows/`, grouped by the situation you are in. Run them from
GitHub → Actions → the workflow → *Run workflow* (all manual ones are `workflow_dispatch`).
Each file's own header comment has the details; this page only answers "which one, and how
dangerous is it". Keep it in step when a workflow is added, removed or changes what it touches.

**Risk:** *read-only* — inspects, changes nothing · *writes* — changes server config or `.env`,
recoverable by re-running or reverting · *disruptive* — restarts or recreates something live ·
*irreversible* — cannot be undone by re-running.

## Runs by itself

| Workflow | When | Risk |
|---|---|---|
| `deploy.yml` | Every push to `main` touching the app (`apps/**`, `packages/**`, lockfiles, compose, itself). Build + tests gate, images to GHCR, primary then secondary, smoke; rolls back the image on a failed health check (never the schema). | disruptive |
| `docs-check.yml` | Every PR / push: fails if `docs/analysis/FACTS.md` is stale (`pnpm docs:facts`, after `git add`). | read-only |
| `mobile-ci.yml` | PRs / pushes touching `apps/mobile/**`: format, analyze, tests. | read-only |
| `sync-nginx.yml` | Push touching `infra/nginx/**` (or manual): ships vhosts to both hosts, `nginx -t`, reload. Refuses vhosts whose cert files are missing on that host. | writes |
| `renew-certs.yml` | Mondays: renews the `gulyaly.com` + `*.gulyaly.com` cert via DNS-01 if < 30 days left, installs it on both hosts. Manual `force` / `staging`. | writes |
| `audit-servers.yml` | Daily (`server-audit.sh`); manual for any script in `infra/checks/`. | read-only |
| `prune-images.yml` | Daily: removes unused Docker images. | writes |
| `check-exposed-ports.yml` | Mondays: what a stranger can connect to, from a neutral runner. | read-only |
| `edge-latency.yml` | How long each node takes to answer from outside (connect / TLS / first byte, plus plain HTTP), every 6 h; fails over 2 s. | read-only |
| `email-dns-monitor.yml` | Daily: SPF / DKIM / DMARC / MX still resolve as expected. | read-only |

## Something looks wrong — diagnose first

| Workflow | Use when | Risk |
|---|---|---|
| `diagnose.yml` / `diagnose-secondary.yml` | Site or API misbehaving on one host: containers, logs, `.env` key names (never values). | read-only |
| `audit-servers.yml` (manual) | A specific question: `capacity.sh`, `throughput.sh`, `env-parity.sh` (both hosts' `.env` agree?), `drift.sh`, `primary-outage-forensics.sh`, `primary-postmortem.sh`, `verify-backup-restore.sh`, `certbot-preflight.sh`. | read-only |
| `db-check.yml` | A data question a green deploy can't answer (referral state, sellers, managed subdomains, cargo state). | read-only |
| `check-exposed-ports.yml` | After any firewall / compose port change. | read-only |
| `check-mail-blacklist.yml` | Mail landing in spam: is the relay IP on a DNSBL? | read-only |
| `smtp-integration-test.yml` | Can the API still send mail? Runs `infra/checks/smtp-check.js` inside each host's api container with its own `MAIL_*` settings: handshake + login for transactional and marketing transports. | read-only (sends one message only with a recipient, from the primary) |

## Incident — act

| Workflow | Use when | Risk |
|---|---|---|
| `restart-api.yml` | API wedged but the release is fine (target: primary / secondary / both). | disruptive |
| `emergency-disk-recovery.yml` | Primary disk at 100%, Postgres won't start, site 502. | disruptive |
| `failover-to-secondary.yml` | Primary's **database** is gone (not just its containers — the secondary already serves the app tier). Needs `confirm: FAILOVER`. Promotes the standby: **the old primary cannot rejoin without a manual re-base.** | **irreversible** |
| `prepare-secondary-failover.yml` | Before a planned failover, or if it's been a while: refreshes certs/`.env` on the secondary. Non-disruptive. | writes |

## Change configuration on the hosts

| Workflow | Use when | Risk |
|---|---|---|
| `set-topup-gateway.yml` | Switch top-up fulfilment (`mock` / `http` / empty = fail closed). **Remove `mock` at launch.** Recreates api on both. | disruptive |
| `set-firebase-credentials.yml` | New Firebase push credentials. Recreates api on both. | disruptive |
| `set-freekassa-credentials.yml` | Writes the four `FREEKASSA_*` repository secrets into both hosts' `.env` and recreates the API processes; checks the provider is registered. | writes |
| `rotate-unsubscribe-secret.yml` | First set, or after a leak (`rotate=true` breaks unsubscribe links in mail already sent). | disruptive |
| `rotate-netdata-gate.yml` | Rotate the Netdata dashboard login. | writes |
| `wire-s3-env.yml` | S3 credentials / buckets changed: rewrites `S3_*` on both hosts, recreates api. | disruptive |
| `install-backup-credentials.yml` | Backup bucket credentials changed. | writes |
| `manage-dns.yml` | DNS records via the Timeweb API (pick a `step`; `dry_run` first). Read the gotchas in `CLAUDE.md` before writing a new step. | writes |
| `provision-subdomain.yml` | Normally dispatched by the API from the admin Subdomains tab, not by hand. | writes |

## One-time setup (idempotent — safe to re-run after a server rebuild)

| Workflow | Installs | Risk |
|---|---|---|
| `install-db-backup-s3.yml` | Hourly encrypted Postgres dump to S3 (`run_now` to test). **Reinstall after any VPS migration** — the units live on the server. | writes |
| `install-docker-firewall.yml` | DOCKER-USER rules closing 5432/6379 to all but the secondary (ufw does not). | writes |
| `install-disk-alert.yml` | Disk usage email alert on both hosts. | writes |
| `install-primary-db-alert.yml` | On the secondary: alert when the primary's DB is unreachable. | writes |
| `install-watchdog.yml` | App watchdog on both hosts. | writes |
| `setup-observability.yml` | Netdata streaming secondary → primary, bounded journald. | writes |
| `setup-replication.yml` | Postgres streaming replica on the secondary. | writes |
| `enable-active-active.yml` | Secondary's app tier running against the primary's DB. | writes |
| `setup-mail-relay.yml` | Postfix submission relay on the secondary. **Do not re-run for app mail** (repoints the primary at the relay; that mail went to spam). | writes |
| `sync-mail-config.yml` | Copies `MAIL_*` from the primary's `.env` to the secondary's, recreates its api, runs the SMTP check on both. Check that the primary is right first. | writes |
| `switch-mail-to-regru.yml` | Puts all app mail (transactional + marketing) on the REG.RU mailbox on both hosts, then runs the SMTP check (optional test recipient). | writes |
| `switch-alerts-to-regru.yml` | Moves the hosts' alert emails (disk, primary DB) to REG.RU and sends a test alert from each; `disable_relay` then stops Postfix/OpenDKIM on the secondary and removes the 587 rules. | writes |
| `fetch-latest-backup.yml` | Not setup: downloads the newest encrypted dump as an artifact for `restore-drill.sh` on the owner's PC. | read-only |

## Retired — don't run

| Workflow | Why |
|---|---|
| `install-cert-sync.yml` | Re-enables per-host `certbot --nginx`, which rewrites the vhosts' `ssl_certificate` back to the host lineage. Certificates come from `renew-certs.yml` since 2026-10-01 (`infra/ssl/README.md`). |
| `certbot-once.yml` | HTTP-01 on one host; with round-robin DNS it validates half the time. Every `*.gulyaly.com` name is already covered by the wildcard. Only for a domain outside `gulyaly.com`. |
