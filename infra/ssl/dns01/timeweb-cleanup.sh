#!/usr/bin/env bash
# certbot --manual-cleanup-hook: remove the challenge TXT records from _acme-challenge.<domain>.
#
# certbot runs this only after every validation of the order has finished, and the name exists
# for nothing but renew-certs.yml (one run at a time, concurrency group "certs"). So this deletes
# every TXT record there: first the ids timeweb-auth.sh recorded, then anything still listed --
# which also sweeps up records a cancelled run left behind. Best-effort: a leftover challenge
# record is harmless, so this never fails the run.
set -uo pipefail

API="https://api.timeweb.cloud"
FQDN="_acme-challenge.${CERTBOT_DOMAIN}"
IDS_FILE="${RUNNER_TEMP:-/tmp}/acme-txt-ids"

delete_id() { # delete_id <id>
  for path in "$FQDN" "$CERTBOT_DOMAIN"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/api/v2/domains/$path/dns-records/$1" \
      -H "Authorization: Bearer $TIMEWEB_API_TOKEN")
    if [ "${code:0:1}" = "2" ]; then echo "deleted TXT record $1 (HTTP $code)"; return; fi
  done
  echo "could not delete TXT record $1 (last HTTP $code)"
}

# 1. The ids recorded when the records were created.
if [ -f "$IDS_FILE" ]; then
  grep "^$FQDN " "$IDS_FILE" | awk '{print $2}' | sort -u | while read -r id; do delete_id "$id"; done
  sed -i "\#^$FQDN #d" "$IDS_FILE"
fi

# 2. Whatever is still listed at that name.
listing=$(curl -s -H "Authorization: Bearer $TIMEWEB_API_TOKEN" "$API/api/v1/domains/$FQDN/dns-records")
ids=$(printf '%s' "$listing" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    data = {}
records = data.get("dns_records", []) if isinstance(data, dict) else []
for r in records:
    if str(r.get("type", "")).upper() == "TXT" and r.get("id") is not None:
        print(r["id"])
')
for id in $ids; do delete_id "$id"; done

# Diagnose without leaking anything: the listing's shape, never its values.
if [ -z "$ids" ]; then
  printf '%s' "$listing" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception as e:
    print("listing was not JSON:", type(e).__name__); sys.exit()
recs = data.get("dns_records") if isinstance(data, dict) else None
print("listing keys:", sorted(data) if isinstance(data, dict) else type(data).__name__,
      "| records:", len(recs) if isinstance(recs, list) else recs,
      "| types:", sorted({str(r.get("type")) for r in recs}) if isinstance(recs, list) else "-")
'
fi
exit 0
