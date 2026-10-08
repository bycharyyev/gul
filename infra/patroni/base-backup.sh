#!/bin/sh
# gul-base-backup [--force]: a physical base backup (pg_basebackup, tar, WAL included) encrypted to
# S3 as base/<UTCstamp>.tar.gz.cms -- the starting point that archived WAL is replayed onto for a
# point-in-time restore. Once a day: skipped when today's base already exists, unless --force.
# Then expires base backups and WAL days older than RETAIN_DAYS (WAL is kept one day longer
# than the oldest base, so that base stays restorable).
#
# Called hourly from backup-db.sh on the node whose Postgres is the Patroni leader.
set -eu
. /usr/local/lib/gul/s3.sh
RETAIN_DAYS=7

[ -n "$S3_BUCKET" ] || { echo "BACKUP_S3_* not configured in this container" >&2; exit 1; }

today=$(date -u +%Y%m%d)
if [ "${1:-}" != "--force" ] && s3_keys "base/$today" | grep -q .; then
  echo "base backup for $today already in S3"
else
  stamp=$(date -u +%Y%m%d-%H%M%S)
  tmp=$(mktemp /tmp/base.XXXXXX)
  trap 'rm -f "$tmp"' EXIT
  # -X fetch: the WAL needed to make the copy consistent goes into the tar itself, so a base is
  # restorable even before any archived WAL is applied. Writing a tar to stdout allows only that.
  PGPASSWORD=$REPLICATOR_PASSWORD pg_basebackup -h 127.0.0.1 -U replicator -D - -Ft -X fetch --checkpoint=fast \
    | gzip | openssl cms -encrypt -binary -aes-256-gcm -outform DER -out "$tmp" "$RECIPIENT"
  bytes=$(stat -c %s "$tmp")
  [ "$bytes" -gt 1000000 ] || { echo "base backup is only $bytes bytes -- not uploading that as a backup" >&2; exit 1; }
  s3_put "$tmp" "base/$stamp.tar.gz.cms"
  echo "base backup base/$stamp.tar.gz.cms ($((bytes / 1024)) KB, encrypted)"
fi

cutoff=$(date -u -d "@$(( $(date +%s) - RETAIN_DAYS * 86400 ))" +%Y%m%d)
walcut=$(date -u -d "@$(( $(date +%s) - (RETAIN_DAYS + 1) * 86400 ))" +%Y%m%d)
s3_keys "base/" | while read -r key; do
  day=$(echo "$key" | sed -n 's#^base/\([0-9]\{8\}\)-.*#\1#p')
  [ -n "$day" ] && [ "$day" -lt "$cutoff" ] && s3 --request DELETE --output /dev/null "$S3_EP/$S3_BUCKET/$key" && echo "expired $key"
done || true
s3_keys "wal/" | while read -r key; do
  day=$(echo "$key" | sed -n 's#^wal/\([0-9]\{8\}\)/.*#\1#p')
  [ -n "$day" ] && [ "$day" -lt "$walcut" ] && s3 --request DELETE --output /dev/null "$S3_EP/$S3_BUCKET/$key"
done || true
echo "retention: base older than $cutoff and WAL older than $walcut removed"
