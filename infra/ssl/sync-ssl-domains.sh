#!/usr/bin/env bash
set -euo pipefail

# Idempotent: (re)issues/expands the Let's Encrypt cert to cover every
# server_name currently defined in nginx, so a newly added vhost gets
# SSL automatically on the next timer tick instead of requiring a
# manual `certbot` run. Safe to run repeatedly -- certbot itself skips
# domains whose cert isn't due for renewal and won't touch anything
# if the domain set is unchanged.

DOMAINS=$(grep -rhoP '(?<=server_name\s)[^;]+' /etc/nginx/sites-enabled/*.conf 2>/dev/null \
  | tr ' ' '\n' \
  | grep -v '^_$' \
  | grep -v '^localhost$' \
  | grep -v '^\s*$' \
  | sort -u)

if [ -z "$DOMAINS" ]; then
  echo "No server_name entries found under /etc/nginx/sites-enabled, nothing to do."
  exit 0
fi

ARGS=()
for d in $DOMAINS; do
  ARGS+=(-d "$d")
done

echo "Ensuring SSL coverage for: ${DOMAINS//$'\n'/ }"
certbot --nginx --expand --non-interactive --agree-tos -m malobiznes@gmail.com "${ARGS[@]}"
