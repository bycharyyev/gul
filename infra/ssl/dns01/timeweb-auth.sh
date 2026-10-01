#!/usr/bin/env bash
# certbot --manual-auth-hook: publish the DNS-01 challenge as a TXT record at
# _acme-challenge.<domain> through the Timeweb Cloud API, then wait until Timeweb's own
# nameservers answer with it. Used by .github/workflows/renew-certs.yml; see infra/ssl/README.md.
#
# certbot sets CERTBOT_DOMAIN (gulyaly.com for both the apex and *.gulyaly.com) and
# CERTBOT_VALIDATION. For apex + wildcard it runs this twice, so two TXT records with different
# values coexist at the same name -- each run adds its own and never touches the other.
set -euo pipefail

: "${TIMEWEB_API_TOKEN:?TIMEWEB_API_TOKEN is not set}"
API="https://api.timeweb.cloud"
FQDN="_acme-challenge.${CERTBOT_DOMAIN}"

# Timeweb only attaches records to a registered subdomain (404 domain_not_found otherwise, see
# CLAUDE.md "DNS management"). 400 here means already registered, which is fine.
curl -s -o /dev/null -X POST "$API/api/v1/domains/${CERTBOT_DOMAIN}/subdomains/_acme-challenge" \
  -H "Authorization: Bearer $TIMEWEB_API_TOKEN" || true

BODY=$(jq -n --arg v "$CERTBOT_VALIDATION" '{type: "TXT", value: $v}')
code=$(curl -s -o /tmp/timeweb-txt-create.json -w '%{http_code}' -X POST "$API/api/v2/domains/$FQDN/dns-records" \
  -H "Authorization: Bearer $TIMEWEB_API_TOKEN" -H "Content-Type: application/json" -d "$BODY")
if [ "${code:0:1}" != "2" ]; then
  echo "Timeweb refused the TXT record (HTTP $code): $(cat /tmp/timeweb-txt-create.json)" >&2
  exit 1
fi
echo "TXT record created at $FQDN (HTTP $code)"

# Remember the id for timeweb-cleanup.sh, which deletes by id rather than re-finding the record
# through a listing whose shape it would have to guess.
id=$(jq -r '.dns_record.id // .id // empty' /tmp/timeweb-txt-create.json 2>/dev/null || true)
if [ -n "$id" ]; then
  echo "$FQDN $id" >> "${RUNNER_TEMP:-/tmp}/acme-txt-ids"
fi

# Let's Encrypt asks the authoritative servers, so wait for those -- not a public resolver,
# whose cache could still hold the previous answer.
# Timeweb has taken from ~4 to ~8 minutes to publish a new record (measured 2026-10-01), so
# allow 20 before giving up.
for i in $(seq 1 80); do
  for ns in ns1.timeweb.ru ns2.timeweb.ru; do
    if dig +short TXT "$FQDN" "@$ns" | tr -d '"' | grep -qx -- "$CERTBOT_VALIDATION"; then
      echo "visible on $ns after $((i * 15))s"
      # One more beat so every Timeweb nameserver has it, not just the first to answer.
      sleep 20
      exit 0
    fi
  done
  sleep 15
done
echo "TXT record never appeared on Timeweb's nameservers" >&2
exit 1
