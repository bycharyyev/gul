#!/usr/bin/env bash
# certbot --manual-cleanup-hook: delete the TXT record timeweb-auth.sh published for this
# validation -- matched by value, so a concurrent record (the other half of apex + wildcard, or
# anything else at that name) is left alone. Best-effort: a leftover challenge record is
# harmless, so this never fails the run.
set -uo pipefail

API="https://api.timeweb.cloud"
FQDN="_acme-challenge.${CERTBOT_DOMAIN}"

ids=$(curl -s -H "Authorization: Bearer $TIMEWEB_API_TOKEN" "$API/api/v1/domains/$FQDN/dns-records" \
  | VALUE="$CERTBOT_VALIDATION" python3 -c '
import json, os, sys
want = os.environ["VALUE"]
try:
    records = json.load(sys.stdin).get("dns_records", [])
except Exception:
    records = []
for r in records:
    if r.get("type") == "TXT" and str(r.get("data", {}).get("value", "")).strip("\"") == want:
        print(r["id"])
')

for id in $ids; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/api/v2/domains/$FQDN/dns-records/$id" \
    -H "Authorization: Bearer $TIMEWEB_API_TOKEN")
  echo "deleted TXT record $id at $FQDN (HTTP $code)"
done
exit 0
