# Hourly encrypted Postgres backups to S3

Installed by [`.github/workflows/install-db-backup-s3.yml`](../../.github/workflows/install-db-backup-s3.yml)
(`/opt/gul/scripts/backup-db.sh`, `/opt/gul/scripts/backup-recipient.pem`, and
`gul-db-backup.{service,timer}` in `/etc/systemd/system/`).

**What it does:** once an hour it dumps the `postgres` container's database via `pg_dump`
(using the container's own `POSTGRES_USER`/`POSTGRES_DB`), gzips it, **encrypts it**, uploads it
to `s3://<BACKUP_S3_BUCKET>/db-backups/gul-db-<timestamp>.sql.gz.cms`, verifies the object is
really there, deletes the local copy, and expires anything older than 30 days.

Configuration in `/opt/gul/.env`: `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY_ID`,
`BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_BUCKET` (today `gulyaly-db-backups` on reg.ru), and
optionally `BACKUP_S3_REGION`. The same four values are repository secrets, used by
`fetch-latest-backup.yml`.

## Encryption

The dump goes from `pg_dump` through `gzip` straight into `openssl cms -encrypt -aes-256-gcm`,
so no readable copy is ever written to the server's disk. It is encrypted to the certificate
[`backup-recipient.pem`](backup-recipient.pem) (public, safe to publish). **The matching private
key exists only on the owner's PC**, in `%USERPROFILE%\.gulyaly\backup-encryption\`
(`backup-private-key.pem`, generated 2026-09-28, certificate serial `276F9B00…5365`).

What that buys: anyone who obtains the S3 keys — including someone who has taken the server,
where those keys live — can download the objects and read nothing.

What it costs:
- **Lose the private key and every backup is unreadable.** Keep a second copy somewhere that is
  not this PC (an encrypted USB stick, a password manager's file attachment). Never put it on a
  server or in GitHub.
- The server cannot do a full restore test on its own. `verify-backup-restore.sh` proves what it
  can without the key (the newest object is recent, complete, AES-GCM, addressed to our
  certificate); [`restore-drill.sh`](restore-drill.sh), run on the PC, proves it decrypts into a
  complete dump with real rows. Run the drill monthly (`RELIABILITY_TARGETS.md`).

To replace the key (lost PC, suspected leak): generate a new pair on the PC, commit the new
`backup-recipient.pem`, run the install workflow. Old backups stay readable only with the old
private key, so keep it until they expire (30 days).

```bash
# On the PC, in Git Bash (MSYS_NO_PATHCONV stops Git Bash rewriting /CN=... as a path)
cd ~/.gulyaly/backup-encryption
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:4096 -nodes -keyout backup-private-key.pem \
  -out backup-recipient.pem -days 36500 -subj "/CN=gulyaly-db-backup"
```

## Deletion protection (Object Lock)

Every upload asks for GOVERNANCE retention for 30 days, which makes an object undeletable even
with valid keys. reg.ru's S3 console has no Object Lock setting; if the bucket refuses the lock
headers, the script uploads without them and logs a `WARNING` on every run rather than losing the
backup. Without it, whoever holds the keys can delete the backups (but still cannot read them).
The upload log line ends in `retention-locked: yes|no`.

## Why S3 and not the local disk

Until 2026-09-02 this rotated 14 days of dumps into `/opt/gul/backups`, which protects against a
bad migration or an admin mistake but not against losing the box — the dumps sat on the same
disk as the database they exist to replace. It also spent disk on the one machine where running
out of it has already taken the site down once.

**It had also stopped existing twice.** The units were installed on the old reg.ru VPS and never
reinstalled after the August migration, so between then and 2026-09-02 there were no backups at
all. Then the script was changed to require dedicated `BACKUP_S3_*` storage that was never
configured, and from then until 2026-09-28 it refused to run every hour (found by the analysis
in `docs/analysis/ARCHITECTURE_REVIEW.md`, A-09). The audit that finds this is
[`audit-servers.yml`](../../.github/workflows/audit-servers.yml) with `verify-backup-restore.sh`.

**A failed upload leaves the encrypted dump in `/opt/gul/backups`** and fails the unit, rather
than losing the hour quietly. Leftovers older than three days are cleaned up on the next run, so
a run of failures cannot fill the disk.

## Checking it is alive

```bash
systemctl list-timers gul-db-backup.timer
journalctl -u gul-db-backup.service -n 30
```

## Restoring a dump

On the PC (the only place the key is):

```bash
bash infra/backups/restore-drill.sh --keep      # fetches, decrypts, checks; prints the dump's path
```

Then copy that `dump.sql` to the target server and load it into a **clean** database — restoring
into one that already has data conflicts on existing rows:

```bash
cd /opt/gul
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < dump.sql
```

Delete the decrypted `dump.sql` afterwards: it holds every customer's phone number and order
history.

To decrypt a file by hand:

```bash
openssl cms -decrypt -binary -inform DER -in gul-db-<timestamp>.sql.gz.cms \
  -inkey ~/.gulyaly/backup-encryption/backup-private-key.pem \
  -recip ~/.gulyaly/backup-encryption/backup-recipient.pem | gunzip > dump.sql
```

## Reinstalling after a server rebuild or migration

Run the workflow. It is idempotent, and it is the step that was missed last time.
