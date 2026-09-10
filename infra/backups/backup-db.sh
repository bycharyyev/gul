#!/usr/bin/env bash
set -euo pipefail

# Daily Postgres dump, shipped to S3 and not kept on this disk.
#
# The previous version wrote to /opt/gul/backups and rotated locally, which protects against a
# bad migration or an admin mistake but not against losing the box -- the dumps sit on the same
# disk as the database they exist to replace. It also spends disk on the one machine where
# running out of it has already taken the site down once.
#
# So: dump, upload, verify it arrived, delete the local copy. The only file left behind is one
# whose upload failed, which is deliberate -- losing a day's backup silently is worse than a few
# megabytes sitting in /tmp with a failed unit next to it.

cd /opt/gul

ENV_FILE=/opt/gul/.env
STAGING=/opt/gul/backups          # transient: holds a dump only while it is being made or retried
PREFIX=db-backups
# 30 days, now at one dump an hour: about 720 objects of ~60K, so roughly 40MB in the bucket.
# Kept flat rather than thinned to dailies after a week -- thinning is more code, and the
# thing it would save is measured in megabytes.
RETENTION_DAYS=30
REGION=us-east-1

mkdir -p "$STAGING"

# Backup storage has its own credentials and bucket. Reusing the API's object-storage identity
# would let an application compromise erase both live objects and every recovery point.
env_value() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed -e "s/$//" -e "s/^[\"']//" -e "s/[\"']$//"
}

S3_ENDPOINT=$(env_value BACKUP_S3_ENDPOINT)
S3_ACCESS_KEY_ID=$(env_value BACKUP_S3_ACCESS_KEY_ID)
S3_SECRET_ACCESS_KEY=$(env_value BACKUP_S3_SECRET_ACCESS_KEY)
S3_BUCKET=$(env_value BACKUP_S3_BUCKET)
REGION=$(env_value BACKUP_S3_REGION)
REGION=${REGION:-us-east-1}

if [ -z "$S3_ENDPOINT" ] || [ -z "$S3_ACCESS_KEY_ID" ] || [ -z "$S3_SECRET_ACCESS_KEY" ] || [ -z "$S3_BUCKET" ]; then
  echo "dedicated BACKUP_S3_* storage is not configured in $ENV_FILE -- refusing to run" >&2
  exit 1
fi

S3_ENDPOINT=${S3_ENDPOINT%/}

# Private bucket, always. These dumps contain every customer's phone number and order history.
s3() {
  curl --fail --silent --show-error --location \
    --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" \
    --aws-sigv4 "aws:amz:$REGION:s3" \
    "$@"
}

STAMP=$(date -u +%Y%m%d-%H%M%S)
NAME="gul-db-$STAMP.sql.gz"
TMP="$STAGING/$NAME.tmp"

# POSTGRES_USER/POSTGRES_DB come from the container's own environment rather than being re-parsed
# here, so this cannot drift out of step with however the postgres service is configured.
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$TMP"

if [ ! -s "$TMP" ]; then
  echo "the dump came out empty -- aborting rather than uploading a file that looks like a backup" >&2
  rm -f "$TMP"
  exit 1
fi

SIZE=$(du -h "$TMP" | cut -f1)
echo "dumped $SIZE, uploading to s3://$S3_BUCKET/$PREFIX/$NAME"

RETAIN_UNTIL=$(date -u -d "$RETENTION_DAYS days" +%Y-%m-%dT%H:%M:%SZ)
if ! s3 --header "x-amz-server-side-encryption: AES256" \
    --header "x-amz-object-lock-mode: GOVERNANCE" \
    --header "x-amz-object-lock-retain-until-date: $RETAIN_UNTIL" \
    --upload-file "$TMP" "$S3_ENDPOINT/$S3_BUCKET/$PREFIX/$NAME"; then
  echo "upload failed -- keeping $TMP so the day's data is not lost with the error" >&2
  # Bound how much a run of failures can cost the disk. Three days is long enough to notice a
  # failed unit and short enough that it cannot fill the volume.
  find "$STAGING" -name '*.sql.gz.tmp' -mtime +3 -delete 2>/dev/null || true
  exit 1
fi

# Verify rather than trust: a 200 on the PUT and an object that is actually there are not the
# same claim, and the difference only shows up on the day someone needs to restore.
HEADERS=$(mktemp)
if ! s3 --head --dump-header "$HEADERS" --output /dev/null "$S3_ENDPOINT/$S3_BUCKET/$PREFIX/$NAME"; then
  echo "uploaded but the object is not there on re-check -- keeping $TMP" >&2
  rm -f "$HEADERS"
  exit 1
fi
if ! grep -qi '^x-amz-object-lock-mode: *GOVERNANCE' "$HEADERS" ||
   ! grep -qi '^x-amz-object-lock-retain-until-date:' "$HEADERS"; then
  echo "uploaded object is not retention-locked -- keeping local copy and failing closed" >&2
  rm -f "$HEADERS"
  exit 1
fi
rm -f "$HEADERS"

rm -f "$TMP"
echo "backed up $NAME ($SIZE) to s3://$S3_BUCKET/$PREFIX/"

# Retention. The date lives in the object name, so expiring old dumps needs no metadata and no
# XML date parsing -- just a string comparison against a cutoff.
CUTOFF=$(date -u -d "$RETENTION_DAYS days ago" +%Y%m%d)
LISTING=$(s3 "$S3_ENDPOINT/$S3_BUCKET?list-type=2&prefix=$PREFIX/" || echo "")
echo "$LISTING" \
  | grep -o '<Key>[^<]*</Key>' \
  | sed 's/<[^>]*>//g' \
  | while read -r key; do
      day=$(echo "$key" | sed -n 's#.*gul-db-\([0-9]\{8\}\)-.*#\1#p')
      [ -z "$day" ] && continue
      if [ "$day" -lt "$CUTOFF" ]; then
        if s3 --request DELETE --output /dev/null "$S3_ENDPOINT/$S3_BUCKET/$key"; then
          echo "expired $key"
        fi
      fi
    done
