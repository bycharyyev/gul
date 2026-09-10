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

set -u
TARGET="${1:?usage: smoke.sh <server-ip>}"
FAILED=0

check() { # check <host> <path> <expected-codes...>
  host=$1; path=$2; shift 2
  code=$(curl -s -o /dev/null -m 25 --resolve "$host:443:$TARGET" -w '%{http_code}' "https://$host$path" || echo 000)
  for ok in "$@"; do
    if [ "$code" = "$ok" ]; then
      printf '  %-46s %s\n' "$host$path" "$code"
      return 0
    fi
  done
  printf '  %-46s %s  EXPECTED %s\n' "$host$path" "$code" "$*"
  FAILED=$((FAILED + 1))
}

echo "=== storefront ==="
check gulyaly.pro /            200
check gulyaly.pro /gallery     200
check gulyaly.pro /login       200
check gulyaly.pro /register    200
check gulyaly.pro /track       200
check gulyaly.pro /become-seller 200

echo "=== seller panel ==="
# Unauthenticated it either renders its own shell or bounces to the login page. Both are fine;
# a 500 or a blank 404 is not, and that is what a broken build looks like here.
check gulyaly.pro /seller          200 302 307
check gulyaly.pro /seller/orders   200 302 307
check gulyaly.pro /seller/products 200 302 307
check gulyaly.pro /seller/shop     200 302 307

echo "=== admin console ==="
check admin.gulyaly.pro /      200

echo "=== api, the paths the apps actually call ==="
check api.gulyaly.pro /api/health/ready          200
check api.gulyaly.pro /api/catalog/services      200
check api.gulyaly.pro /api/catalog/payment-methods 200
check api.gulyaly.pro /api/gallery/products      200
check api.gulyaly.pro /api/gallery/categories    200
check api.gulyaly.pro /api/home-slides           200
check api.gulyaly.pro /api/stories               200
check api.gulyaly.pro /api/social-links          200
check api.gulyaly.pro /api/content-pages/welcome 200
# Guarded routes must still be guarded. A 200 here would mean the guard came off, which is a
# worse outcome than a page being down and would otherwise deploy green.
check api.gulyaly.pro /api/orders/me   401
check api.gulyaly.pro /api/auth/me     401

echo
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED check(s) failed on $TARGET"
  exit 1
fi
echo "all checks passed on $TARGET"
