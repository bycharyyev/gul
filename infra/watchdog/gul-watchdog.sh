#!/bin/sh
set -e

if curl -fsS --max-time 5 http://127.0.0.1:4000/api/health/ready > /dev/null 2>&1; then
  exit 0
fi

# The app root differs between the two machines, and hardcoding the primary's is why this could
# only ever be installed there. The secondary has been serving real customers since the second A
# record went in on 2026-09-03, so it needs the same watchdog -- an API that dies there now takes
# half the traffic with it.
if [ -d /opt/gul-secondary ]; then
  ROOT=/opt/gul-secondary
else
  ROOT=/opt/gul
fi

echo "gul-watchdog: /api/health/ready failed, running docker compose up -d in $ROOT"
cd "$ROOT"
docker compose up -d
