# Shared S3 helpers for the WAL archive and base backups (sourced, POSIX sh). Credentials come
# from the container environment (BACKUP_S3_* from patroni.env), the same bucket the hourly dumps
# use. Every object is encrypted to /etc/gul/backup-recipient.pem before it leaves the host; the
# private key exists only on the owner's PC (infra/backups/README.md).

S3_EP=${BACKUP_S3_ENDPOINT%/}
S3_BUCKET=${BACKUP_S3_BUCKET:-}
S3_REGION=${BACKUP_S3_REGION:-us-east-1}
RECIPIENT=/etc/gul/backup-recipient.pem

s3() {
  curl --fail --silent --show-error --location \
    --user "$BACKUP_S3_ACCESS_KEY_ID:$BACKUP_S3_SECRET_ACCESS_KEY" \
    --aws-sigv4 "aws:amz:$S3_REGION:s3" "$@"
}

# s3_put <local file> <key>: upload, then prove the object is there.
s3_put() {
  code=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --user "$BACKUP_S3_ACCESS_KEY_ID:$BACKUP_S3_SECRET_ACCESS_KEY" \
    --aws-sigv4 "aws:amz:$S3_REGION:s3" \
    --upload-file "$1" "$S3_EP/$S3_BUCKET/$2" || true)
  [ "$code" = 200 ] || { echo "upload of $2 failed: HTTP $code" >&2; return 1; }
  s3 --head --output /dev/null "$S3_EP/$S3_BUCKET/$2" || { echo "$2 not there on re-check" >&2; return 1; }
}

# s3_keys <prefix>: every key under a prefix, one per line, across pages (1000 keys each).
s3_keys() {
  token=""
  while :; do
    if [ -n "$token" ]; then
      page=$(s3 -G --data "list-type=2" --data-urlencode "prefix=$1" --data-urlencode "continuation-token=$token" "$S3_EP/$S3_BUCKET") || return 1
    else
      page=$(s3 -G --data "list-type=2" --data-urlencode "prefix=$1" "$S3_EP/$S3_BUCKET") || return 1
    fi
    echo "$page" | grep -o '<Key>[^<]*</Key>' | sed 's/<[^>]*>//g'
    echo "$page" | grep -q '<IsTruncated>true</IsTruncated>' || break
    token=$(echo "$page" | sed -n 's#.*<NextContinuationToken>\([^<]*\)</NextContinuationToken>.*#\1#p')
    [ -n "$token" ] || break
  done
}

# encrypt <in> <out>: gzip + CMS AES-256-GCM to the backup certificate (as backup-db.sh does).
encrypt() {
  gzip -c "$1" | openssl cms -encrypt -binary -aes-256-gcm -outform DER -out "$2" "$RECIPIENT"
}
