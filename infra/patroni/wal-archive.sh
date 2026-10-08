#!/bin/sh
# Postgres archive_command: gul-wal-archive "%p" "%f". Exit 0 only once the WAL file is encrypted
# and in S3 -- Postgres then may recycle it; on non-zero it keeps the file and retries. With
# archive_timeout = 60 a segment closes at least every minute while anything is written, so the
# archive is at most about a minute behind the database: that is what survives losing BOTH nodes.
#
# Keys: wal/<UTC day archived>/<file>.gz.cms. The day is only for expiry; a restore looks files up
# by name across all days (infra/backups/pitr-drill.sh).
set -eu
. /usr/local/lib/gul/s3.sh

src=$1
name=$2

# Not configured on this node: let Postgres recycle WAL rather than pile it up.
[ -n "$S3_BUCKET" ] || exit 0

# Safety valve. A failing upload makes Postgres keep every segment; left alone that fills the disk
# and takes the database down, which is worse than a gap in the archive. Past 5 GB of pg_wal,
# report the file as archived (it is not) and say so loudly; the hourly backup check fails on the
# archiver falling behind, and the gap is closed by the next base backup.
used=$(du -sm "${PGDATA:-/var/lib/postgresql/data}/pg_wal" 2>/dev/null | cut -f1)
if [ "${used:-0}" -gt 5000 ]; then
  echo "gul-wal-archive: pg_wal is ${used} MB and archiving is failing -- $name NOT archived, dropped to protect the disk" >&2
  exit 0
fi

tmp=$(mktemp /tmp/wal.XXXXXX)
trap 'rm -f "$tmp"' EXIT
encrypt "$src" "$tmp"
s3_put "$tmp" "wal/$(date -u +%Y%m%d)/$name.gz.cms"
