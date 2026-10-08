#!/usr/bin/env bash
set -euo pipefail

# Hourly Postgres dump, encrypted on this host, shipped to S3 and not kept on this disk.
#
# The previous version wrote to /opt/gul/backups and rotated locally, which protects against a
# bad migration or an admin mistake but not against losing the box -- the dumps sit on the same
# disk as the database they exist to replace. It also spends disk on the one machine where
# running out of it has already taken the site down once.
#
# So: dump, encrypt, upload, verify it arrived, delete the local copy. The only file left behind
# is one whose upload failed, which is deliberate -- losing a day's backup silently is worse than
# a few kilobytes sitting in the staging directory with a failed unit next to it.
#
# Encryption. The dump is piped straight from pg_dump through gzip into `openssl cms -encrypt`,
# so no readable copy ever touches this disk. It is encrypted to a certificate
# (backup-recipient.pem, public, committed in infra/backups/) whose private key exists only on
# the owner's PC. Anyone holding this host's S3 credentials -- including someone who has taken
# the host -- can download the objects and read nothing. The price: a restore needs that private
# key, and losing it makes every backup unreadable. See infra/backups/README.md.

cd /opt/gul

ENV_FILE=/opt/gul/.env
STAGING=/opt/gul/backups          # transient: holds an encrypted dump only while it uploads
PREFIX=db-backups
RECIPIENT=/opt/gul/scripts/backup-recipient.pem
# 30 days, one dump an hour: about 720 objects of ~60K, so roughly 40MB in the bucket.
RETENTION_DAYS=30

mkdir -p "$STAGING"

# Failed uploads from before encryption (2026-09-28) left readable dumps here. This version never
# uploads them, newer encrypted backups supersede them, and they hold every customer's phone
# number in the clear -- so they go.
for f in "$STAGING"/*.sql.gz.tmp; do
  [ -e "$f" ] || continue
  rm -f "$f" && echo "removed unencrypted leftover $(basename "$f")"
done

env_value() {
  # `|| true`: an absent key is an empty value, not a fatal error. Under `set -o pipefail` grep's
  # exit status 1 would otherwise abort the whole script before it can say what is missing, and the
  # optional BACKUP_S3_REGION is read this way too. `tr -d '\r'` drops a CRLF line ending.
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | sed -e "s/^[\"']//" -e "s/[\"']$//" || true
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
if [ ! -s "$RECIPIENT" ]; then
  echo "encryption certificate $RECIPIENT is missing -- refusing to upload an unencrypted dump" >&2
  exit 1
fi

S3_ENDPOINT=${S3_ENDPOINT%/}

s3() {
  curl --fail --silent --show-error --location \
    --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" \
    --aws-sigv4 "aws:amz:$REGION:s3" \
    "$@"
}

STAMP=$(date -u +%Y%m%d-%H%M%S)
NAME="gul-db-$STAMP.sql.gz.cms"
TMP="$STAGING/$NAME.tmp"
URL="$S3_ENDPOINT/$S3_BUCKET/$PREFIX/$NAME"

# POSTGRES_USER/POSTGRES_DB come from the container's own environment rather than being re-parsed
# here, so this cannot drift out of step with however the postgres service is configured.
# AES-256-GCM (AuthEnvelopedData): a flipped or truncated byte fails decryption instead of
# producing a quietly damaged dump.
# Since Patroni (migrate-to-patroni.yml) the database is the gul-pg container and compose's
# "postgres" is only HAProxy. pg_dump runs inside gul-pg over its local socket -- on a replica as
# well as on the leader, so this works whichever role this node holds right now.
if docker ps --format '{{.Names}}' | grep -qx gul-pg; then
  dump() { docker exec gul-pg sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' < /dev/null; }
else
  dump() { docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' < /dev/null; }
fi
if ! dump \
    | gzip \
    | openssl cms -encrypt -binary -aes-256-gcm -outform DER -out "$TMP" "$RECIPIENT"; then
  echo "dump or encryption failed -- nothing uploaded" >&2
  rm -f "$TMP"
  exit 1
fi

# An encrypted empty dump is a few hundred bytes of envelope; a real one is tens of kilobytes.
BYTES=$(stat -c %s "$TMP")
if [ "$BYTES" -lt 4096 ]; then
  echo "the encrypted dump is only $BYTES bytes -- aborting rather than uploading a file that looks like a backup" >&2
  rm -f "$TMP"
  exit 1
fi

SIZE=$(du -h "$TMP" | cut -f1)
echo "dumped and encrypted $SIZE, uploading to s3://$S3_BUCKET/$PREFIX/$NAME"

# Object Lock makes an object undeletable until its retain-until date, even with valid keys --
# the defence against someone who takes this host and erases the recovery points. It needs
# bucket-side support that not every S3-compatible provider offers. Ask for it; if the provider
# refuses the lock headers specifically, upload without them and say so on every run rather than
# losing the backup. Any other refusal (credentials, permissions) is a hard failure.
RETAIN_UNTIL=$(date -u -d "$RETENTION_DAYS days" +%Y-%m-%dT%H:%M:%SZ)
RESP=$(mktemp)
trap 'rm -f "$RESP"' EXIT
put_object() { # put_object <lock:1|0>  -> prints the HTTP status
  local lock_headers=()
  if [ "$1" = 1 ]; then
    lock_headers=(--header "x-amz-object-lock-mode: GOVERNANCE"
                  --header "x-amz-object-lock-retain-until-date: $RETAIN_UNTIL")
  fi
  curl --silent --show-error --location \
    --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" \
    --aws-sigv4 "aws:amz:$REGION:s3" \
    "${lock_headers[@]}" \
    --upload-file "$TMP" --output "$RESP" --write-out '%{http_code}' "$URL" || true
}

LOCKED=1
CODE=$(put_object 1)
if [ "$CODE" != 200 ] && grep -qiE 'ObjectLock|Object Lock|Retention|InvalidRequest|NotImplemented' "$RESP"; then
  echo "WARNING: the bucket refused Object Lock ($CODE: $(grep -o '<Code>[^<]*' "$RESP" | cut -c7-)) -- uploading without retention; these backups can be deleted by anyone holding the keys" >&2
  LOCKED=0
  CODE=$(put_object 0)
fi
if [ "$CODE" != 200 ]; then
  echo "upload failed (HTTP $CODE): $(tr -d '\n' < "$RESP" | head -c 400)" >&2
  echo "keeping $TMP so the hour's data is not lost with the error" >&2
  # Bound how much a run of failures can cost the disk. Three days is long enough to notice a
  # failed unit and short enough that it cannot fill the volume.
  find "$STAGING" -name '*.tmp' -mtime +3 -delete 2>/dev/null || true
  exit 1
fi

# Verify rather than trust: a 200 on the PUT and an object that is actually there are not the
# same claim, and the difference only shows up on the day someone needs to restore.
HEADERS=$(mktemp)
if ! s3 --head --dump-header "$HEADERS" --output /dev/null "$URL"; then
  echo "uploaded but the object is not there on re-check -- keeping $TMP" >&2
  rm -f "$HEADERS"
  exit 1
fi
if [ "$LOCKED" = 1 ] && ! grep -qi '^x-amz-object-lock-mode: *GOVERNANCE' "$HEADERS"; then
  echo "WARNING: the bucket accepted the lock headers but the object reports no retention -- it is not protected from deletion" >&2
  LOCKED=0
fi
rm -f "$HEADERS"

rm -f "$TMP"
echo "backed up $NAME ($SIZE, encrypted, retention-locked: $([ "$LOCKED" = 1 ] && echo yes || echo no)) to s3://$S3_BUCKET/$PREFIX/"

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
