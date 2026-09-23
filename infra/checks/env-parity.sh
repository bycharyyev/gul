#!/usr/bin/env bash
# Do both machines agree on the values that a customer's session depends on?
#
# Since 2026-09-03 the app and the site reach either server at random. A token minted by one is
# presented to the other on the very next request, so anything involved in issuing or accepting
# that token has to be byte-identical on both. If JWT_SECRET differed, people would be signed out
# at random with no pattern anyone could describe -- the kind of fault that gets reported as "the
# app is buggy" and never reproduces on the machine you happen to be testing against.
#
# Prints a short hash of each value, never the value. Two hosts showing the same hash agree; a
# different hash means they disagree; MISSING means the key is not set at all. The hash is salted
# with the key name so that two different keys holding the same value do not look related, and
# truncated so it cannot be attacked offline as a password digest.
#
# Run with host=both and compare the two columns by eye -- deliberately not automated into a
# pass/fail, because which keys *should* differ is a judgement call: DATABASE_URL and REDIS_URL
# legitimately differ (one points at localhost, the other across the network) and a check that
# insisted they match would be wrong.

ENV_FILE=/opt/gul/.env
[ -f "$ENV_FILE" ] || ENV_FILE=/opt/gul-secondary/.env

echo "host: $(hostname)   file: $ENV_FILE"
echo

# Must match: session identity, and the shared services both nodes talk to.
MUST_MATCH="JWT_ACCESS_SECRET JWT_ACCESS_TTL JWT_REFRESH_TTL JWT_REFRESH_SECRET POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD REDIS_PASSWORD S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_ENDPOINT S3_PRIVATE_BUCKET TELEGRAM_BOT_TOKEN MAIL_USER MAIL_PASS PROVISION_CALLBACK_SECRET CORS_ORIGINS"

# Expected to differ: each points somewhere local to its own host.
MAY_DIFFER="DATABASE_URL REDIS_URL PRIMARY_REDIS_HOST IMAGE_TAG"

digest() {
  key=$1
  line=$(grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null) || true
  if [ -z "$line" ]; then
    echo "MISSING"
    return
  fi
  value=${line#*=}
  if [ -z "$value" ]; then
    echo "EMPTY"
    return
  fi
  printf '%s' "${key}:${value}" | sha256sum | cut -c1-12
}

echo "--- must be identical on both hosts ---"
for key in $MUST_MATCH; do
  printf '  %-28s %s\n' "$key" "$(digest "$key")"
done

echo
echo "--- expected to differ ---"
for key in $MAY_DIFFER; do
  printf '  %-28s %s\n' "$key" "$(digest "$key")"
done
