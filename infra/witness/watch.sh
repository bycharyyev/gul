#!/bin/sh
# Witness-side health watcher (container gul-witness-watch on the witness node).
#
# Every 30 s it asks each app node the question a visitor's browser asks -- HTTPS
# /api/health/ready pinned to that node, certificate verified. When a node's state changes (down =
# two misses in a row, ~1 min; up = one success), it dispatches watchdog.yml on GitHub at once
# instead of waiting for GitHub's own 5-minute schedule. The decision and the DNS change stay in
# watchdog.yml, which re-probes from GitHub's side before touching anything.
#
# What this node holds is deliberately weak: a GitHub token that can only start workflows in this
# repository. No Timeweb key, no SSH key to the app nodes. Anything destructive among the workflows
# sits behind the "danger" environment and waits for the owner's approval click.
#
# Environment (from /etc/gul-witness.env, mode 600): A, B (node addresses), GH_TOKEN, REPO.
set -u

INTERVAL=30
MIN_GAP=120   # seconds between two dispatches; a change inside the gap is sent when it ends

probe() {
  code=$(curl -s -o /dev/null -m 8 --resolve "api.gulyaly.com:443:$1" -w '%{http_code}:%{ssl_verify_result}' \
    https://api.gulyaly.com/api/health/ready 2>/dev/null || true)
  [ "$code" = "200:0" ]
}

dispatch() { # dispatch <workflow file> <reason>
  http=$(curl -s -o /tmp/dispatch.out -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/actions/workflows/$1/dispatches" -d '{"ref":"main"}' || true)
  echo "$(date -u +%FT%TZ) dispatched $1 ($2): HTTP $http"
  [ "$http" = 204 ] || cat /tmp/dispatch.out
}

state_a=up; state_b=up; miss_a=0; miss_b=0
last=0; pending=""

echo "$(date -u +%FT%TZ) watching both app nodes every ${INTERVAL}s"
while :; do
  for n in a b; do
    eval "ip=\$$(echo "$n" | tr a-z A-Z)"
    eval "miss=\$miss_$n; state=\$state_$n"
    if probe "$ip"; then miss=0; new=up; else miss=$((miss + 1)); new=$state; [ "$miss" -ge 2 ] && new=down; fi
    if [ "$new" != "$state" ]; then
      echo "$(date -u +%FT%TZ) node $n: $state -> $new"
      pending="node $n $new"
    fi
    eval "miss_$n=$miss; state_$n=$new"
  done

  now=$(date +%s)
  # Heartbeat every 10 min, and every probe while anything is not plainly up, so the log shows
  # what this watcher actually saw.
  if [ $((now - ${hb:-0})) -ge 600 ] || [ "$miss_a$miss_b" != "00" ]; then
    echo "$(date -u +%FT%TZ) a=$state_a(miss $miss_a) b=$state_b(miss $miss_b)"
    hb=$now
  fi
  if [ -n "$pending" ] && [ $((now - last)) -ge "$MIN_GAP" ]; then
    dispatch watchdog.yml "$pending"
    last=$now; pending=""
  fi
  sleep "$INTERVAL"
done
