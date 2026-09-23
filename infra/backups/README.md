# Hourly immutable Postgres backups to dedicated S3 storage

Installed by [`.github/workflows/install-db-backup-s3.yml`](../../.github/workflows/install-db-backup-s3.yml)
(`/opt/gul/scripts/backup-db.sh` + `gul-db-backup.{service,timer}` in `/etc/systemd/system/`).

**What it does:** once an hour it dumps the `postgres` container's database via `pg_dump`
(using the container's own `POSTGRES_USER`/`POSTGRES_DB`), gzips it, uploads it to
`s3://<BACKUP_S3_BUCKET>/db-backups/gul-db-<timestamp>.sql.gz`, verifies the object is really
there, deletes the local copy, and expires anything older than 30 days.

**Why S3 and not the local disk.** Until 2026-09-02 this rotated 14 days of dumps into
`/opt/gul/backups`, which protects against a bad migration or an admin mistake but not against
losing the box — the dumps sat on the same disk as the database they exist to replace. It also
spent disk on the one machine where running out of it has already taken the site down once.
The bucket and credentials must be dedicated to backups. Configure `BACKUP_S3_ENDPOINT`,
`BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_BUCKET`, and optionally
`BACKUP_S3_REGION` in `/opt/gul/.env`. Do not grant this identity access to application objects.
The bucket must have versioning and S3 Object Lock enabled; every upload requests GOVERNANCE
retention for 30 days and server-side AES-256 encryption. Prefer a separate account/project and
deny `s3:BypassGovernanceRetention` to the writer so a compromised production host cannot erase
recovery points. Bucket lifecycle may remove retained versions after the retention period.

**It had also stopped existing.** The units were installed on the old reg.ru VPS and never
reinstalled after the August migration, so between then and 2026-09-02 there were no backups at
all — the "reinstall after a migration" step below was written and then skipped. The audit that
found this is [`audit-servers.yml`](../../.github/workflows/audit-servers.yml); an empty
`systemctl list-timers` is the signal.

**A failed upload leaves the dump in `/opt/gul/backups`** and fails the unit, rather than losing
the day quietly. Leftovers older than three days are cleaned up on the next run, so a run of
failures cannot fill the disk.

## Checking it is alive

```bash
systemctl list-timers gul-db-backup.timer
journalctl -u gul-db-backup.service -n 30
```

## Restoring a dump

```bash
# list what is there
curl --user "$BACKUP_S3_ACCESS_KEY_ID:$BACKUP_S3_SECRET_ACCESS_KEY" --aws-sigv4 "aws:amz:${BACKUP_S3_REGION:-us-east-1}:s3"   "$BACKUP_S3_ENDPOINT/$BACKUP_S3_BUCKET?list-type=2&prefix=db-backups/"

# fetch one, then restore
curl --user "$BACKUP_S3_ACCESS_KEY_ID:$BACKUP_S3_SECRET_ACCESS_KEY" --aws-sigv4 "aws:amz:${BACKUP_S3_REGION:-us-east-1}:s3"   -o dump.sql.gz "$BACKUP_S3_ENDPOINT/$BACKUP_S3_BUCKET/db-backups/gul-db-<timestamp>.sql.gz"

cd /opt/gul
gunzip -c dump.sql.gz | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

Restoring into a database that already has data will conflict on existing rows — for a full
restore onto a clean database, drop and recreate it first (or start a scratch `postgres`
container) rather than piping into the live one.

## Reinstalling after a server rebuild or migration

Run the workflow. It is idempotent, and it is the step that was missed last time.
