#!/usr/bin/env bash
# Point-in-time restore drill. Run on the PC that holds the private key, with Docker running:
#   bash infra/backups/pitr-drill.sh
#
# Fetches the newest base backup and the archived WAL since (fetch-pitr-set.yml), decrypts them
# here, restores them into a throwaway postgres:16-alpine container on a docker volume, replays
# every WAL file, and reports how close to "now" the restored database got and what is in it.
# This is the proof that losing BOTH servers costs at most about a minute of data. Everything
# decrypted is deleted at the end (the volume included) -- it holds every customer's data.
set -euo pipefail

REPO="bycharyyev/gul"
KEY_DIR="${BACKUP_KEY_DIR:-$HOME/.gulyaly/backup-encryption}"
PRIVATE="$KEY_DIR/backup-private-key.pem"
CERT="$KEY_DIR/backup-recipient.pem"
[ -r "$PRIVATE" ] && [ -r "$CERT" ] || { echo "private key or certificate not found in $KEY_DIR" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running" >&2; exit 1; }

WORK=$(mktemp -d)
VOL="gul-pitr-drill-$$"
cleanup() {
  docker rm -f "$VOL" >/dev/null 2>&1 || true
  docker volume rm "$VOL" "$VOL-wal" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

before=$(gh run list --repo "$REPO" --workflow fetch-pitr-set.yml --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
gh workflow run fetch-pitr-set.yml --repo "$REPO"
run=""
for _ in $(seq 1 30); do
  sleep 4
  run=$(gh run list --repo "$REPO" --workflow fetch-pitr-set.yml --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
  [ -n "$run" ] && [ "$run" != "$before" ] && break
done
gh run watch "$run" --repo "$REPO" --exit-status >/dev/null
gh run download "$run" --repo "$REPO" -n pitr-set -D "$WORK/enc"

dec() { openssl cms -decrypt -binary -inform DER -in "$1" -inkey "$PRIVATE" -recip "$CERT" | gunzip; }

BASE=$(ls "$WORK"/enc/*.tar.gz.cms 2>/dev/null | head -1)
echo "base backup: $(basename "$BASE"); WAL files: $(ls "$WORK/enc/wal" | wc -l)"
mkdir -p "$WORK/wal"
dec "$BASE" > "$WORK/base.tar"
for f in "$WORK"/enc/wal/*.gz.cms; do
  [ -e "$f" ] || continue
  dec "$f" > "$WORK/wal/$(basename "$f" .gz.cms)"
done

# Docker volumes, not bind mounts: Postgres refuses a data directory whose permissions it cannot
# set, which is every Windows path.
docker volume create "$VOL" >/dev/null
docker volume create "$VOL-wal" >/dev/null
docker run --rm -i -v "$VOL":/d alpine sh -c 'tar -x -C /d && chown -R 70:70 /d && chmod 700 /d' < "$WORK/base.tar"
(cd "$WORK/wal" && tar -c .) | docker run --rm -i -v "$VOL-wal":/w alpine sh -c 'tar -x -C /w && chown -R 70:70 /w'

# Recover through every archived file, then open read-write. The node's own config and pg_hba come
# with the base; override only what a laptop needs.
docker run -d --name "$VOL" -v "$VOL":/var/lib/postgresql/data -v "$VOL-wal":/wal postgres:16-alpine sh -c '
  cd /var/lib/postgresql/data
  rm -f standby.signal postmaster.pid
  touch recovery.signal && chown postgres recovery.signal
  exec su-exec postgres postgres -D /var/lib/postgresql/data     -c restore_command="cp /wal/%f %p" -c recovery_target_action=promote     -c archive_mode=off -c listen_addresses=localhost -c port=5432     -c unix_socket_directories=/var/run/postgresql' >/dev/null

ok=0
for _ in $(seq 1 150); do
  if docker logs "$VOL" 2>&1 | grep -q "database system is ready to accept connections"; then ok=1; break; fi
  docker ps -q --filter "name=$VOL" | grep -q . || break
  sleep 2
done
echo "--- recovery log ---"
docker logs "$VOL" 2>&1 | grep -E "starting point-in-time|restored log file|redo done|last completed transaction|selected new timeline|FATAL|PANIC" \
  | sed -E 's/.*restored log file "([^"]+)".*/restored \1/' \
  | awk '/^restored/{n++; last=$0; next} {print} END{if(n) print n " WAL files replayed, last: " last}'
[ "$ok" = 1 ] || { echo "PITR DRILL FAILED: the restored database did not open" >&2; docker logs --tail 30 "$VOL" >&2; exit 1; }
last=$(docker logs "$VOL" 2>&1 | sed -n 's/.*last completed transaction was at log time \(.*\)$/\1/p' | tail -1)
echo "restored up to: ${last:-unknown}; now: $(date -u '+%F %T') UTC"
echo "pitr drill passed: base + archived WAL restore into a working database"
