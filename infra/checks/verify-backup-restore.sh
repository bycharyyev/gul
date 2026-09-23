#!/usr/bin/env bash
# Does the newest S3 backup actually restore, and how old is it?
#
# "The timer is enabled and last exited 0" is not the same claim as "the file it produced is a
# working database" -- a truncated upload, a pg_dump against the wrong database, or a schema that
# silently stopped matching migrations would all leave the timer green. This downloads the newest
# object, restores it into a throwaway Postgres that touches nothing else on the box, and compares
# row counts against the live database. Never writes to the real one.
set -euo pipefail

cd /opt/gul
ENV_FILE=/opt/gul/.env
PREFIX=db-backups
WORKDIR=$(mktemp -d)
CONTAINER=restore-verify-pg
trap 'docker rm -f $CONTAINER >/dev/null 2>&1 || true; rm -rf "$WORKDIR"' EXIT

env_value() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed -e "s/\"//g" -e "s/'\''//g"
}
S3_ENDPOINT=$(env_value BACKUP_S3_ENDPOINT); S3_ENDPOINT=${S3_ENDPOINT%/}
S3_ACCESS_KEY_ID=$(env_value BACKUP_S3_ACCESS_KEY_ID)
S3_SECRET_ACCESS_KEY=$(env_value BACKUP_S3_SECRET_ACCESS_KEY)
S3_BUCKET=$(env_value BACKUP_S3_BUCKET)
REGION=$(env_value BACKUP_S3_REGION); REGION=${REGION:-us-east-1}
if [ -z "$S3_ENDPOINT" ] || [ -z "$S3_ACCESS_KEY_ID" ] || [ -z "$S3_SECRET_ACCESS_KEY" ] || [ -z "$S3_BUCKET" ]; then
  echo "dedicated BACKUP_S3_* storage is not configured" >&2
  exit 1
fi

s3() {
  curl --fail --silent --show-error --location \
    --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" \
    --aws-sigv4 "aws:amz:$REGION:s3" "$@"
}

echo "############ WHAT IS IN S3 ############"
LISTING=$(s3 "$S3_ENDPOINT/$S3_BUCKET?list-type=2&prefix=$PREFIX/")
LATEST=$(echo "$LISTING" | grep -o '<Key>[^<]*</Key>' | sed 's/<[^>]*>//g' | sort | tail -1)
COUNT=$(echo "$LISTING" | grep -c '<Key>' || true)
if [ -z "$LATEST" ]; then
  echo "no backup objects found under $PREFIX/ -- nothing to restore" >&2
  exit 1
fi
echo "objects in bucket: $COUNT"
echo "newest: $LATEST"

# The timestamp lives in the filename (gul-db-YYYYMMDD-HHMMSS.sql.gz), set by the backup script
# itself in UTC -- read that back rather than trusting S3's Last-Modified, which reflects the PUT
# and would silently drift if an object were ever re-uploaded.
STAMP=$(echo "$LATEST" | sed -n 's#.*gul-db-\([0-9]\{8\}-[0-9]\{6\}\).*#\1#p')
if [ -n "$STAMP" ]; then
  BACKUP_EPOCH=$(date -u -d "${STAMP:0:8} ${STAMP:9:2}:${STAMP:11:2}:${STAMP:13:2}" +%s)
  NOW_EPOCH=$(date -u +%s)
  AGE_H=$(( (NOW_EPOCH - BACKUP_EPOCH) / 3600 ))
  AGE_M=$(( ((NOW_EPOCH - BACKUP_EPOCH) % 3600) / 60 ))
  echo "backup time (UTC): ${STAMP:0:4}-${STAMP:4:2}-${STAMP:6:2} ${STAMP:9:2}:${STAMP:11:2}:${STAMP:13:2}"
  echo "age: ${AGE_H}h ${AGE_M}m"
  if [ "$AGE_H" -gt 25 ]; then
    echo "backup is older than the 25h recovery-point gate" >&2
    exit 1
  fi
else
  echo "backup filename has no parseable UTC timestamp" >&2
  exit 1
fi
echo

echo "############ DOWNLOADING ############"
s3 --output "$WORKDIR/dump.sql.gz" "$S3_ENDPOINT/$S3_BUCKET/$LATEST"
SIZE=$(du -h "$WORKDIR/dump.sql.gz" | cut -f1)
gunzip -t "$WORKDIR/dump.sql.gz" && echo "downloaded and gzip-valid: $SIZE" || { echo "gzip corrupt" >&2; exit 1; }
gunzip -k "$WORKDIR/dump.sql.gz"
echo

echo "############ RESTORING INTO A THROWAWAY DATABASE ############"
# A password generated here and used nowhere else: this container is never published on any port
# and is removed by the trap above the moment this script exits, successfully or not.
RESTORE_PASS=$(openssl rand -hex 20)
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD="$RESTORE_PASS" -e POSTGRES_DB=restoretest \
  postgres:16-alpine >/dev/null

for i in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

# A plain `pg_dump` (no --no-owner) emits `ALTER TABLE ... OWNER TO <role>` for every object, and
# a fresh postgres:16-alpine container has no role but its own superuser. Without this the very
# first ALTER … OWNER TO fails the whole restore -- found on the first real run of this script.
# The role name is read from the live container rather than hardcoded, so this keeps working if
# it is ever renamed, and is never echoed: it is not a secret, but there is no reason to print it.
DB_ROLE=$(docker compose exec -T postgres sh -c 'echo "$POSTGRES_USER"' < /dev/null 2>/dev/null | tr -d '[:space:]')
if [ -n "$DB_ROLE" ]; then
  docker exec "$CONTAINER" psql -U postgres -d restoretest -v ON_ERROR_STOP=1 \
    -c "CREATE ROLE \"$DB_ROLE\"" >/dev/null
fi

if ! docker exec -i "$CONTAINER" psql -U postgres -d restoretest -v ON_ERROR_STOP=1 \
    < "$WORKDIR/dump.sql" > "$WORKDIR/restore.log" 2>&1; then
  echo "RESTORE FAILED -- last 30 lines:" >&2
  tail -30 "$WORKDIR/restore.log" >&2
  exit 1
fi
echo "restore completed without error"
echo

echo "############ DOES IT LOOK LIKE THE REAL DATABASE ############"
# The live side's query travels over stdin into `sh -c '...psql...'`, not as a `-c` argument
# after it: `sh -c 'script' extra-args` hands those extra args to the script as positional
# parameters, not to psql inside it -- they are silently swallowed. This is also why every SQL
# check elsewhere in infra/checks/ (referral-state.sql etc.) is piped on stdin rather than passed
# as -c: it is the one form that survives ssh -> docker compose exec -> an inner shell intact.
live_query() {
  echo "$1;" | docker compose exec -T postgres sh -c 'psql -Aqt -U "$POSTGRES_USER" "$POSTGRES_DB"' 2>/dev/null | tr -d '[:space:]'
}
compare() { # compare <table>
  live=$(live_query "select count(*) from \"$1\"")
  restored=$(docker exec "$CONTAINER" psql -Aqt -U postgres -d restoretest \
    -c "select count(*) from \"$1\"" 2>/dev/null | tr -d '[:space:]')
  printf '  %-16s live=%-8s restored=%-8s %s\n' "$1" "${live:-?}" "${restored:-?}" \
    "$([ "$live" = "$restored" ] && echo ok || echo 'DIFFERS -- expected if new rows arrived after the dump')"
}
compare User
compare Order
compare Service
compare ContentPage

echo
echo "--- latest applied migration, live vs restored (must match: same schema) ---"
live_mig=$(live_query "select migration_name from _prisma_migrations order by started_at desc limit 1")
restored_mig=$(docker exec "$CONTAINER" psql -Aqt -U postgres -d restoretest \
  -c "select migration_name from _prisma_migrations order by started_at desc limit 1" 2>/dev/null | tr -d '[:space:]')
echo "  live:     $live_mig"
echo "  restored: $restored_mig"
if [ -z "$live_mig" ] || [ "$live_mig" != "$restored_mig" ]; then
  echo "schema mismatch between the dump and the live database" >&2
  exit 1
fi
echo "backup restore verification passed"
