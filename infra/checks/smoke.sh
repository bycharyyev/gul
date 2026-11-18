#!/usr/bin/env bash
# Does the deployed release actually serve the things customers use?
#
# The health check the deploy waits on asks one question -- can the API answer /health/ready --
# and answers it from the API's own point of view. That is the check that lets a deploy go green
# while a page nobody looked at is broken, which is exactly the failure worth catching: "several
# things did not come up, and we found out later".
#
# So this walks the real routes over HTTPS, against a named server, the way a customer reaches
# them. Run once per host after each deploy.
#
# Usage: smoke.sh <ip>    -- the address to pin every hostname to.
#
# The seller panel is in this list on purpose. It is the part that gets forgotten, because staff
# see the storefront and the admin console daily and nobody opens /seller until a seller
# complains.
#
# One connection per hostname, not one per route. On 2026-11-15 (deploy run 43734809882) the
# runner opened a fresh TLS connection for every check; after about fourteen in five seconds,
# eight API checks got no answer for 25 s each. None of them reached nginx -- no access-log line,
# no 499 -- while the API answered everything that did arrive in milliseconds: the connections
# were lost between GitHub's network and the host's. So all of a hostname's routes now go
# through one curl invocation, which reuses its connection, and a route that gets no answer at
# all (000) is asked once more after a pause on its own connection. A route that answers with
# the wrong status is not retried: that is the release, not the network.

set -u
TARGET="${1:?usage: smoke.sh <server-ip>}"
FAILED=0

SECTIONS=()   # section titles, in order
ROWS=()       # "section|host|path|expected codes"
section() { SECTIONS+=("$1"); }
check() { # check <host> <path> <expected-codes...>
  local host=$1 path=$2; shift 2
  ROWS+=("${SECTIONS[-1]}|$host|$path|$*")
}

section "storefront"
check gulyaly.com /            200
check gulyaly.com /gallery     200
check gulyaly.com /login       200
check gulyaly.com /register    200
check gulyaly.com /track       200
check gulyaly.com /become-seller 200

section "seller panel"
# Unauthenticated it either renders its own shell or bounces to the login page. Both are fine;
# a 500 or a blank 404 is not, and that is what a broken build looks like here.
check gulyaly.com /seller          200 302 307
check gulyaly.com /seller/orders   200 302 307
check gulyaly.com /seller/products 200 302 307
check gulyaly.com /seller/shop     200 302 307

section "admin console"
check admin.gulyaly.com /      200

section "api, the paths the apps actually call"
check api.gulyaly.com /api/health/ready          200
check api.gulyaly.com /api/catalog/services      200
check api.gulyaly.com /api/catalog/payment-methods 200
check api.gulyaly.com /api/gallery/products      200
check api.gulyaly.com /api/gallery/categories    200
check api.gulyaly.com /api/home-slides           200
check api.gulyaly.com /api/stories               200
check api.gulyaly.com /api/social-links          200
check api.gulyaly.com /api/content-pages/welcome 200
# Guarded routes must still be guarded. A 200 here would mean the guard came off, which is a
# worse outcome than a page being down and would otherwise deploy green.
check api.gulyaly.com /api/orders/me   401
check api.gulyaly.com /api/auth/me     401

# --- run: one curl per hostname, every route of that host over the same connection ---
declare -A CODE   # "host|path" -> status
HOSTS=()
for row in "${ROWS[@]}"; do
  IFS='|' read -r _ host _ _ <<<"$row"
  [[ " ${HOSTS[*]-} " == *" $host "* ]] || HOSTS+=("$host")
done
for host in "${HOSTS[@]}"; do
  args=(); paths=()
  for row in "${ROWS[@]}"; do
    IFS='|' read -r _ h path _ <<<"$row"
    [ "$h" = "$host" ] || continue
    paths+=("$path"); args+=(-o /dev/null "https://$host$path")
  done
  # Options apply to every URL; -w prints one status per URL, in order.
  mapfile -t codes < <(curl -s --connect-timeout 10 -m 25 --resolve "$host:443:$TARGET" -w '%{http_code}\n' "${args[@]}")
  for i in "${!paths[@]}"; do c=${codes[$i]:-000}; CODE["$host|${paths[$i]}"]=${c%$'\r'}; done
done

# --- no answer at all: once more, after a pause, on a fresh connection ---
# Not when nothing answered at all: that is a host that is down, and waiting longer only delays
# the red tick.
ANSWERED=0
for k in "${!CODE[@]}"; do [ "${CODE[$k]}" = "000" ] || ANSWERED=1; done
RETRIED=0
for row in "${ROWS[@]}"; do
  [ "$ANSWERED" = 1 ] || break
  IFS='|' read -r _ host path _ <<<"$row"
  [ "${CODE["$host|$path"]}" = "000" ] || continue
  [ "$RETRIED" = 1 ] || { echo "(no answer from some routes; retrying them in 15 s)"; sleep 15; RETRIED=1; }
  c=$(curl -s -o /dev/null --connect-timeout 10 -m 15 --resolve "$host:443:$TARGET" -w '%{http_code}' "https://$host$path" || true)
  c=${c%$'\r'}
  CODE["$host|$path"]=${c:-000}
done

# --- report ---
for s in "${SECTIONS[@]}"; do
  echo "=== $s ==="
  for row in "${ROWS[@]}"; do
    IFS='|' read -r sec host path expected <<<"$row"
    [ "$sec" = "$s" ] || continue
    code=${CODE["$host|$path"]}
    if [[ " $expected " == *" $code "* ]]; then
      printf '  %-46s %s\n' "$host$path" "$code"
    else
      printf '  %-46s %s  EXPECTED %s\n' "$host$path" "$code" "$expected"
      FAILED=$((FAILED + 1))
    fi
  done
done

echo
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED check(s) failed on $TARGET"
  exit 1
fi
echo "all checks passed on $TARGET"
