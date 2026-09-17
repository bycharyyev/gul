#!/bin/bash
# Emails when root disk usage crosses THRESHOLD. Rate-limited to one email per RATE_LIMIT_SECONDS
# regardless of how often the timer fires, so a disk stuck above the threshold doesn't spam.
# Credentials/recipient live in /etc/gul-disk-alert.env (root-only, written by install-disk-alert.yml).
# Run with --test to force a send regardless of current usage or the rate limit -- used to verify
# the whole pipeline (SASL auth, DKIM/SPF) works without waiting for a real 80% disk event.
set -euo pipefail

THRESHOLD=80
STATE_FILE=/var/lib/gul-disk-alert/last-sent
RATE_LIMIT_SECONDS=3600
HOST=$(hostname)
USAGE=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')

FORCE=0
[ "${1:-}" = "--test" ] && FORCE=1

if [ "$FORCE" -ne 1 ] && [ "$USAGE" -lt "$THRESHOLD" ]; then
  exit 0
fi

mkdir -p "$(dirname "$STATE_FILE")"
NOW=$(date +%s)
if [ "$FORCE" -ne 1 ] && [ -f "$STATE_FILE" ]; then
  LAST=$(cat "$STATE_FILE")
  if [ $((NOW - LAST)) -lt "$RATE_LIMIT_SECONDS" ]; then
    exit 0
  fi
fi

# shellcheck source=/etc/gul-disk-alert.env
source /etc/gul-disk-alert.env # MAIL_ALERT_USER, MAIL_ALERT_PASS, MAIL_ALERT_TO, MAIL_RELAY_HOST

BODY_FILE=$(mktemp)
{
  echo "From: Gulyaly Alerts <alerts@gulyaly.pro>"
  echo "To: $MAIL_ALERT_TO"
  echo "Subject: [gulyaly] disk usage on $HOST: ${USAGE}%$([ "$FORCE" -eq 1 ] && echo ' (test)')"
  echo "Date: $(date -R)"
  echo "Content-Type: text/plain; charset=utf-8"
  echo
  echo "Disk usage on $HOST is ${USAGE}% (threshold: ${THRESHOLD}%)."
  echo
  echo "--- df -h ---"
  df -h
  echo
  echo "--- top 5 largest directories under /var ---"
  # `|| true`: with pipefail, head closing the pipe early after 5 lines sends SIGPIPE upstream,
  # which counts as pipeline failure and would otherwise abort the whole script via set -e.
  du -h --max-depth=2 /var 2>/dev/null | sort -rh | head -5 || true
} >"$BODY_FILE"

curl -s -m 20 -k --url "smtp://${MAIL_RELAY_HOST}:587" --ssl-reqd \
  --mail-from "alerts@gulyaly.pro" --mail-rcpt "$MAIL_ALERT_TO" \
  --user "${MAIL_ALERT_USER}:${MAIL_ALERT_PASS}" --upload-file "$BODY_FILE"

rm -f "$BODY_FILE"
echo "$NOW" >"$STATE_FILE"
