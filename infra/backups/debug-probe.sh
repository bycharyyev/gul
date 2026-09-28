#!/usr/bin/env bash
# One-off diagnostic, called by .github/workflows/debug-backup-run.yml over SSH. Uploads one
# harmless 4-byte object to the backup bucket with the exact same Object-Lock headers
# backup-db.sh sends, WITHOUT --fail, so reg.ru's real error body (if any) is visible instead of
# being swallowed. Never echoes a credential value -- only reg.ru's own response body and the
# HTTP status code reach stdout. Deletes the probe object again on the way out (best-effort).
set -euo pipefail

ENV_FILE=/opt/gul/.env
env_value() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed -e "s/^[\"']//" -e "s/[\"']$//" || true
}

S3_ENDPOINT=$(env_value BACKUP_S3_ENDPOINT)
S3_ACCESS_KEY_ID=$(env_value BACKUP_S3_ACCESS_KEY_ID)
S3_SECRET_ACCESS_KEY=$(env_value BACKUP_S3_SECRET_ACCESS_KEY)
S3_BUCKET=$(env_value BACKUP_S3_BUCKET)
REGION=$(env_value BACKUP_S3_REGION)
REGION=${REGION:-us-east-1}
S3_ENDPOINT=${S3_ENDPOINT%/}

if [ -z "$S3_ENDPOINT" ] || [ -z "$S3_ACCESS_KEY_ID" ] || [ -z "$S3_SECRET_ACCESS_KEY" ] || [ -z "$S3_BUCKET" ]; then
  echo "one of the four BACKUP_S3_* keys is empty in $ENV_FILE -- nothing to probe" >&2
  exit 1
fi

PROBE=$(mktemp)
echo "probe" > "$PROBE"
KEY="debug/probe-$(date -u +%s).txt"
RETAIN_UNTIL=$(date -u -d "1 day" +%Y-%m-%dT%H:%M:%SZ)

echo "--- PUT with Object-Lock headers (no --fail, so any error body prints) ---"
curl --silent --show-error --location \
  --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" \
  --aws-sigv4 "aws:amz:$REGION:s3" \
  --header "x-amz-server-side-encryption: AES256" \
  --header "x-amz-object-lock-mode: GOVERNANCE" \
  --header "x-amz-object-lock-retain-until-date: $RETAIN_UNTIL" \
  --upload-file "$PROBE" "$S3_ENDPOINT/$S3_BUCKET/$KEY" \
  -w '\nHTTP_STATUS:%{http_code}\n'
STATUS=$?
echo "curl exit code: $STATUS"

echo
echo "--- Same PUT WITHOUT Object-Lock headers, for comparison ---"
curl --silent --show-error --location \
  --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" \
  --aws-sigv4 "aws:amz:$REGION:s3" \
  --upload-file "$PROBE" "$S3_ENDPOINT/$S3_BUCKET/${KEY}.plain" \
  -w '\nHTTP_STATUS:%{http_code}\n'
echo "curl exit code: $?"

rm -f "$PROBE"

echo
echo "--- cleanup (best-effort, ignore errors) ---"
curl --silent --show-error --location --request DELETE \
  --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" \
  --aws-sigv4 "aws:amz:$REGION:s3" \
  "$S3_ENDPOINT/$S3_BUCKET/${KEY}.plain" -o /dev/null -w 'delete plain probe: %{http_code}\n' || true
