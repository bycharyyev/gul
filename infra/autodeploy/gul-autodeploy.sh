#!/usr/bin/env bash
#
# Pull-based deploy: the server watches main and ships it, with nobody's runner in the middle.
#
# This exists because GitHub Actions is not always available to us -- a billing block stops every
# job, including the build. So this script does what the pipeline did, on the box itself: fetch
# the source, build the three images, migrate, restart, health-check, and roll back when it is
# safe to roll back.
#
# It keeps the pipeline's rules rather than inventing gentler ones, because those rules were
# learned from outages:
#
#   * The rollback decision is made against the tag ACTUALLY RUNNING, not the previous commit.
#     `prisma migrate deploy` applies every pending migration, so a release whose own diff
#     touches no migration can still apply one an earlier failed deploy left behind.
#   * A release carrying `migration-policy: allow-destructive` is never rolled back. An image
#     rollback restores code and cannot restore schema, and /api/health is SELECT 1 plus a Redis
#     ping -- it would report green over old code on a converted schema.
#   * Nothing is swapped in until all three images have built. A half-built release must not
#     take the site down.
#
# Runs as the `deploy` user (docker group, no sudo). Installed by the systemd timer beside it.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gul}"
SRC_DIR="${SRC_DIR:-$APP_DIR/src}"
REPO="${REPO:-bycharyyev/gul}"
BRANCH="${BRANCH:-main}"
API_PUBLIC_URL="${API_PUBLIC_URL:-https://api.gulyaly.pro/api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4000/api/health}"

# Building three Node images needs real headroom. Postgres lives on this box; an OOM during a
# build can get the kernel to shoot it instead, which turns a deploy into an outage.
MIN_FREE_DISK_MB="${MIN_FREE_DISK_MB:-9000}"
MIN_MEM_TOTAL_MB="${MIN_MEM_TOTAL_MB:-5500}" # RAM + swap

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

cd "$APP_DIR" || die "no $APP_DIR"

# ---- one at a time -------------------------------------------------------------------------
# The timer fires on a schedule and a build takes many minutes. Without this, a slow build would
# be joined by the next tick and both would write .env and restart containers underneath it.
exec 9>"$APP_DIR/.autodeploy.lock"
flock -n 9 || { log "another deploy is running; skipping this tick"; exit 0; }

# ---- credentials ---------------------------------------------------------------------------
# Reuses the token already on the box for the subdomain feature rather than adding a second
# credential. Read directly out of .env so it never has to exist in a second place.
TOKEN="$(grep -E '^GH_ACTIONS_TOKEN=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- || true)"
[ -n "$TOKEN" ] || die "GH_ACTIONS_TOKEN missing from $APP_DIR/.env -- git cannot reach a private repo without it"
GHCR_OWNER="$(grep -E '^GHCR_OWNER=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- || true)"
GHCR_OWNER="${GHCR_OWNER:-${REPO%%/*}}"

# ---- what is running, what is on main ------------------------------------------------------
if [ ! -d "$SRC_DIR/.git" ]; then
  log "first run: cloning $REPO into $SRC_DIR"
  git clone --quiet "https://x-access-token:${TOKEN}@github.com/${REPO}.git" "$SRC_DIR"
fi

cd "$SRC_DIR"
# The token can be rotated; re-setting the remote each run keeps a rotation from silently
# breaking every future deploy with an authentication failure nobody is watching for.
git remote set-url origin "https://x-access-token:${TOKEN}@github.com/${REPO}.git"
git fetch --quiet --prune origin "$BRANCH"

NEW_TAG="$(git rev-parse "origin/$BRANCH")"
PREV_TAG="$(grep -E '^IMAGE_TAG=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- || true)"

if [ "$NEW_TAG" = "$PREV_TAG" ]; then
  log "already on ${NEW_TAG:0:7}; nothing to do"
  exit 0
fi

log "deploying ${PREV_TAG:0:7}${PREV_TAG:+ }-> ${NEW_TAG:0:7}"
git reset --quiet --hard "$NEW_TAG"

# ---- preflight ------------------------------------------------------------------------------
FREE_MB="$(df -Pm "$APP_DIR" | tail -1 | awk '{print $4}')"
log "free disk: ${FREE_MB} MB"
if [ "$FREE_MB" -lt "$MIN_FREE_DISK_MB" ]; then
  log "under ${MIN_FREE_DISK_MB} MB free -- reclaiming before building"
  docker builder prune -a -f >/dev/null 2>&1 || true
  docker image prune -a -f --filter "until=2h" >/dev/null 2>&1 || true
  FREE_MB="$(df -Pm "$APP_DIR" | tail -1 | awk '{print $4}')"
  log "free disk after reclaim: ${FREE_MB} MB"
  [ "$FREE_MB" -ge 4000 ] || die "still only ${FREE_MB} MB free -- refusing to build"
fi

MEM_MB="$(awk '/MemTotal|SwapTotal/ {sum += $2} END {print int(sum/1024)}' /proc/meminfo)"
log "RAM + swap: ${MEM_MB} MB"
if [ "$MEM_MB" -lt "$MIN_MEM_TOTAL_MB" ]; then
  # Refusing is the safe answer. The Next.js build alone peaks around 2 GB, and the thing the
  # kernel kills when it runs out is whatever it likes -- frequently Postgres.
  die "only ${MEM_MB} MB of RAM+swap; add swap before enabling auto-deploy (see README)"
fi

# ---- build, and only then swap in -----------------------------------------------------------
build() {
  local app="$1"
  shift
  log "building $app"
  docker build \
    --file "apps/$app/Dockerfile" \
    --tag "ghcr.io/${GHCR_OWNER}/gul-${app}:${NEW_TAG}" \
    "$@" \
    . >/dev/null || die "$app image failed to build -- nothing was changed on the running site"
}

# Sequential, not parallel: three Node builds at once is how this box runs out of memory. The
# build context is the repo root because the images need packages/* as well as their own app.
build api
build web --build-arg "NEXT_PUBLIC_API_URL=${API_PUBLIC_URL}"
build admin --build-arg "VITE_API_URL=${API_PUBLIC_URL}"
log "all three images built"

# ---- would a rollback be honest? -------------------------------------------------------------
SCHEMA_BREAKING=false
if [ -z "$PREV_TAG" ] || ! git cat-file -e "${PREV_TAG}^{commit}" 2>/dev/null; then
  # Cannot tell what the running image contains, so cannot promise going back to it works.
  log "previous tag unknown or absent from history -- treating this release as schema-breaking"
  SCHEMA_BREAKING=true
else
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if grep -Eqi 'migration-policy:[[:space:]]*allow-destructive' "$file"; then
      log "schema-breaking migration not present in the running image: $file"
      SCHEMA_BREAKING=true
    fi
  done <<EOF
$(git diff --name-only "$PREV_TAG" "$NEW_TAG" -- 'apps/api/prisma/migrations/*/migration.sql')
EOF
fi

# ---- ship -------------------------------------------------------------------------------------
cp docker-compose.prod.yml "$APP_DIR/docker-compose.yml"
cd "$APP_DIR"

set_tag() {
  sed -i '/^IMAGE_TAG=/d' .env
  echo "IMAGE_TAG=$1" >> .env
}
grep -qE '^GHCR_OWNER=' .env || echo "GHCR_OWNER=${GHCR_OWNER}" >> .env

up_with_retry() {
  # `up -d` races with its own teardown: the API stops gracefully, and compose can ask to create
  # the replacement while the daemon is still removing the old one. That clears within seconds,
  # so it is a wait, not an error.
  for attempt in 1 2 3; do
    docker compose up -d && return 0
    log "up attempt $attempt failed; retrying in $((attempt * 10))s"
    sleep $((attempt * 10))
  done
  return 1
}

wait_healthy() {
  for _ in $(seq 1 15); do
    curl -fsS "$HEALTH_URL" >/dev/null && return 0
    sleep 2
  done
  return 1
}

set_tag "$NEW_TAG"

# Additive migrations run before the new code serves traffic, so the new application never sees a
# half-upgraded schema.
if ! docker compose run --rm api npx prisma migrate deploy < /dev/null; then
  log "migration failed; leaving the previous release running"
  set_tag "${PREV_TAG:-latest}"
  exit 1
fi

up_with_retry || die "containers would not start on ${NEW_TAG:0:7}"

if wait_healthy; then
  log "healthy on ${NEW_TAG:0:7}"
  # -a with a grace window: every deploy leaves the previous SHA-tagged images fully tagged and
  # unused, and dangling-only pruning never touches those. That is how this disk filled before.
  docker image prune -a -f --filter "until=48h" >/dev/null 2>&1 || true
  docker builder prune -f --filter "until=48h" >/dev/null 2>&1 || true
  exit 0
fi

log "health check failed on ${NEW_TAG:0:7}"

if [ "$SCHEMA_BREAKING" = "true" ]; then
  # Going back would put old code on a converted schema and then report success, because the
  # health endpoint never touches a converted column. A green line over a broken release is worse
  # than a red one.
  die "release is schema-breaking -- refusing to roll back automatically. Fix forward, or restore the database from backup first."
fi

log "rolling back to ${PREV_TAG:0:7}"
set_tag "${PREV_TAG:-latest}"
up_with_retry || die "rollback failed to start containers -- site is down, intervene manually"
wait_healthy || die "rolled back to ${PREV_TAG:0:7} and it is still unhealthy -- intervene manually"
die "rolled back to ${PREV_TAG:0:7}; ${NEW_TAG:0:7} was not healthy"
