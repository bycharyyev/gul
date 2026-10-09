# High availability

Status as of 2026-10-09. This replaces the August/September text, which described a manual
failover. The old design, and how it failed, is in git history.

## What it protects against

| Failure | Who handles it | Time | Data lost |
|---|---|---|---|
| App container crashes on one node | Docker restart + `gul-watchdog` self-heal | ~30 s | none |
| Database leader dies | Patroni, the other node takes over | 6–11 s | none (synchronous replication) |
| Redis master dies | Sentinel promotes the replica | ~13 s | none (queue persisted and replicated) |
| A node stops answering | watcher removes it from DNS | ~2 min (+ resolver caches) | none |
| A node stays dead 15 min | `replace-node.yml` buys and rebuilds it | ~20–30 min | none |
| Both app nodes die at once | cloud WAL archive restores the database | up to ~1 min of writes | ≤ 1 min |
| Data corrupted or deleted by mistake | point-in-time restore from the archive | to any minute of the last 7 days | up to the mistake |

## The three servers

- **A** (`DEPLOY_HOST`): app, Postgres leader (usually), Redis master (usually), bots, backups.
- **B** (`SECONDARY_HOST`): app, Postgres and Redis replicas; serves traffic too.
- **W** (`WITNESS_HOST`): no application. One etcd member, one Sentinel, the watcher. It can start
  workflows and nothing else.

## Votes

- **Patroni** uses a 3-member etcd quorum (A, B, W) to elect the Postgres leader. Synchronous
  replication, not strict: a commit waits for one replica, and with the replica down the leader
  keeps writing alone.
- **Sentinel** (3 members, A, B, W) elects the Redis master. Clients never trust a node's own claim
  to be master: `apps/api/src/queue/redis-connection.ts` asks the Sentinels.
- **Bots** (Telegram polling) run on whichever node holds a Redis lease
  (`apps/api/src/common/polling-lease.ts`), so a dead node hands polling over in ~30 s.

## Replacement

`replace-node.yml` runs when the witness sees a node down for 15 minutes with the other node up.
It re-proves the node is dead, creates a Timeweb server (from the newest `gul-node-*` image in that
location, otherwise plain Ubuntu, trying the presets in turn), fences the dead address on the
survivor and the witness, updates etcd and Sentinel membership, rebuilds the database and Redis
replicas from the live node, starts the app with the same image tag, updates DNS and the GitHub
secrets, and reports to Telegram. A second run never buys a second server while one is in use.

When the dead machine comes back, the watcher rebuilds that role onto it from scratch (`FENCED_HOST`)
and deletes the stand-in. Nothing from the old machine's disk is reused.

## Golden image

`bake-node-image.yml` runs weekly: a temporary server gets Docker, nginx, the node's container
images at the current release (each one test-started), has its host identity and secrets stripped,
and is snapshotted to `gul-node-*`. The newest image is kept per location. Replacement uses it so a
new node starts in minutes and pulls only the difference.

## Backups and point-in-time restore

- Hourly encrypted `pg_dump` (30 days), taken by the leader only.
- Continuous WAL archive from the leader (`archive_timeout = 60`), encrypted, plus a daily physical
  base backup (7 days). Restoring from them to any minute is shown by `infra/backups/pitr-drill.sh`
  (run on the owner's PC; the decryption key is only there).

## Drills (run them after any change to this path)

- `patroni-drill.yml` `drill`: stop the database leader; 6 s to a new leader, site healthy on both
  nodes after 11 s; the old leader rejoins as a replica by itself.
- `patroni-drill.yml` `redis-drill`: stop the Redis master; 13 s to the new master, site healthy.
- `patroni-drill.yml` `node-drill`: stop the whole data tier on one node; 12 s, site healthy, data
  intact (restore counts unchanged).
- `patroni-drill.yml` `app-drill`: stop nginx on the secondary; DNS follows, and returns after the
  restart.
- `replace-node.yml` `mode=drill`: rebuild a node onto a given host.
- Real incidents, 2026-10-09: power-off of the secondary (the replacement worked end to end after
  three fixes, see git log); loss of the primary while the Sentinel set held stale entries (no
  quorum, Redis down ~13 min until a guarded forced failover, `redis-force-failover.yml`). Both led
  to changes in the code and workflows that are now tested.

## Known limits

- The witness is one machine. If it dies with one app node, the survivor keeps serving and can
  keep its leadership, but it cannot be replaced automatically if it is the one that died.
- A Timeweb answer of "no capacity" in every location stops replacement; the witness retries every
  30 minutes.
- Cloud servers are billed hourly until deleted; a stand-in left behind costs money.
- Files kept on a node's local uploads volume are not copied between nodes. Avatars and documents
  are in S3 (`docs/analysis`); anything else still written to the local volume needs checking before
  relying on a node swap to keep it.
