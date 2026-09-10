#!/bin/bash
set -euo pipefail

source /etc/gul-primary-db-alert.env
source /etc/gul-disk-alert.env

STATE_DIR=/var/lib/gul-primary-db-alert
FAILURES_FILE="$STATE_DIR/failures"
ALERTED_FILE="$STATE_DIR/alerted"
mkdir -p "$STATE_DIR"

send_alert() {
  local subject=$1 body=$2 message
  message=$(mktemp)
  trap 'rm -f "$message"' RETURN
  {
    echo "From: Gulyaly Alerts <alerts@gulyaly.pro>"
    echo "To: $MAIL_ALERT_TO"
    echo "Subject: $subject"
    echo "Date: $(date -R)"
    echo "Content-Type: text/plain; charset=utf-8"
    echo
    echo "$body"
    echo "Observer: $(hostname)"
    echo "Target: ${PRIMARY_DB_HOST}:5432"
  } >"$message"
  curl --fail --silent --show-error --max-time 20 \
    --url "smtp://${MAIL_RELAY_HOST}:587" --ssl-reqd \
    --mail-from "alerts@gulyaly.pro" --mail-rcpt "$MAIL_ALERT_TO" \
    --user "${MAIL_ALERT_USER}:${MAIL_ALERT_PASS}" --upload-file "$message"
}

if timeout 5 bash -c "exec 3<>/dev/tcp/${PRIMARY_DB_HOST}/5432" 2>/dev/null; then
  echo 0 >"$FAILURES_FILE"
  if [ -f "$ALERTED_FILE" ]; then
    send_alert "[gulyaly] RECOVERED: primary database reachable" \
      "The primary database TCP endpoint is reachable again. Verify topology before failback."
    rm -f "$ALERTED_FILE"
  fi
  exit 0
fi

failures=0
[ -f "$FAILURES_FILE" ] && read -r failures <"$FAILURES_FILE"
failures=$((failures + 1))
echo "$failures" >"$FAILURES_FILE"
if [ "$failures" -ge 3 ] && [ ! -f "$ALERTED_FILE" ]; then
  send_alert "[gulyaly] CRITICAL: primary database unreachable" \
    "Three probes from secondary failed. Diagnose and fence primary before failover; do not promote on this alert alone."
  date -u +%FT%TZ >"$ALERTED_FILE"
fi

