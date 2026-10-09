# Ops workflows (catalog)

Generated from `.github/workflows/*.yml` (the names and triggers are read from the files, so this
list cannot drift from them). Regenerate after adding or removing a workflow. Deleted on 2026-10-09:
`install-cert-sync`, `setup-mail-relay`, `failover-to-secondary`, `setup-replication`,
`prepare-secondary-failover`, `enable-active-active`, `certbot-once`, `wire-s3-env`, `diagnose-secondary`
(superseded by Patroni / replace-node / ha-diag; they remain in git history, do not restore them).

| Workflow | What it is | Flags |
|---|---|---|
| `api-logs.yml` | API logs and .env restore | — |
| `audit-servers.yml` | Audit servers | scheduled |
| `bake-node-image.yml` | Bake the node image (Timeweb, weekly) | scheduled |
| `build-patroni-image.yml` | Build Patroni image | — |
| `check-exposed-ports.yml` | Check exposed ports (read-only) | scheduled; read-only |
| `check-mail-blacklist.yml` | Check mail relay IP against major DNSBLs | — |
| `db-check.yml` | DB check (read-only) | read-only |
| `delete-timeweb-server.yml` | Delete a Timeweb Cloud server (irreversible) | approval (danger) |
| `deploy.yml` | Deploy | — |
| `diagnose.yml` | Diagnose VPS | — |
| `docs-check.yml` | Docs facts | no manual trigger |
| `edge-latency.yml` | Edge latency (read-only) | scheduled; read-only |
| `email-dns-monitor.yml` | Email DNS monitor | scheduled |
| `emergency-disk-recovery.yml` | Emergency — reclaim disk and bring the stack up | — |
| `enable-wal-archive.yml` | Enable the WAL archive (rolling restart of gul-pg) | approval (danger) |
| `fetch-latest-backup.yml` | Fetch latest backup | — |
| `fetch-pitr-set.yml` | Fetch PITR set (latest base backup + WAL since) | — |
| `ha-diag.yml` | HA diagnostics (read-only) | read-only |
| `harden-ssh.yml` | Harden SSH (key-only login) | approval (danger) |
| `host-diag.yml` | Host diagnostics (read-only) | read-only |
| `host-keys.yml` | Host keys (read-only) | read-only |
| `incident-state.yml` | Incident state (read-only) | read-only |
| `install-backup-credentials.yml` | Install backup credentials | — |
| `install-db-backup-s3.yml` | Install DB backups to S3 | — |
| `install-disk-alert.yml` | Install disk usage email alert (both VPS) | — |
| `install-docker-firewall.yml` | Install docker port firewall (WRITES) | — |
| `install-primary-db-alert.yml` | Install primary DB reachability alert on secondary | — |
| `install-watchdog.yml` | Install app watchdog | — |
| `install-witness-watch.yml` | Install the witness health watcher | — |
| `manage-dns.yml` | Manage Timeweb DNS records | approval (danger) |
| `migrate-redis-ha.yml` | Redis HA -- replica + Sentinel quorum (one-time cutover) | approval (danger) |
| `migrate-to-patroni.yml` | Migrate the database to Patroni (one-time cutover) | approval (danger) |
| `mobile-ci.yml` | Mobile CI | no manual trigger |
| `patroni-drill.yml` | HA drills (Patroni, Redis, whole data tier) / switchover | approval (danger) |
| `provision-subdomain.yml` | Provision subdomain | — |
| `provision-timeweb-server.yml` | Provision a Timeweb Cloud server (paid) | approval (danger) |
| `prune-images.yml` | Prune unused images (WRITES) | scheduled |
| `redis-force-failover.yml` | Redis force failover (outage recovery) | — |
| `renew-certs.yml` | Renew the gulyaly.com certificate (DNS-01) on both hosts | scheduled |
| `replace-node.yml` | Replace a dead node (buys a Timeweb server unless use_host is given) | — |
| `restart-api.yml` | Restart the api container (primary and/or secondary) | — |
| `rotate-netdata-gate.yml` | Rotate netdata-gate credentials (GATE_PASS + GATE_SECRET) | — |
| `rotate-unsubscribe-secret.yml` | Set or rotate UNSUBSCRIBE_SECRET on both hosts | — |
| `secondary-netcheck.yml` | Secondary network check (read-only) | read-only |
| `set-cryptocloud-credentials.yml` | Set CryptoCloud credentials on both hosts | — |
| `set-firebase-credentials.yml` | Set Firebase push credentials on both hosts | — |
| `set-freekassa-credentials.yml` | Set FreeKassa credentials on both hosts | — |
| `set-heleket-credentials.yml` | Set Heleket credentials on both hosts | — |
| `set-redis-sentinels.yml` | Point the API at the Redis Sentinels | — |
| `set-topup-gateway.yml` | Set the top-up fulfilment gateway on both hosts | — |
| `setup-etcd.yml` | Set up etcd quorum (primary + secondary + witness) | approval (danger) |
| `setup-observability.yml` | Set up observability (netdata streaming to primary + bounded journald retention) | — |
| `smtp-integration-test.yml` | SMTP check (production sending path) | — |
| `switch-alerts-to-regru.yml` | Send server alerts through REG.RU | — |
| `switch-mail-to-regru.yml` | Send all app mail through REG.RU | — |
| `sync-mail-config.yml` | Sync mail config to the secondary | — |
| `sync-nginx.yml` | Sync nginx vhosts | — |
| `timeweb-server-catalog.yml` | Timeweb server catalog (read-only) | read-only |
| `watchdog.yml` | Watchdog (node health -> DNS + Telegram) | scheduled |

Workflows marked **approval (danger)** wait for the owner's Approve in GitHub before they run.
Read-only workflows change nothing; run them freely when diagnosing.
