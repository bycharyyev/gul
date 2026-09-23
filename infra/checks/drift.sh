#!/usr/bin/env bash
# Does this machine actually match the repository?
#
# Written after finding that docker-compose.secondary.yml had never once been copied to the
# secondary: the deploy updated the image tag and restarted whatever file was already on the box,
# so a file that looked authoritative in git had been a no-op since the day somebody placed it
# there by hand. That went unnoticed for weeks because everything about it looked healthy --
# green deploys, containers restarting, health checks passing. Only a number that came out wrong
# gave it away.
#
# So this compares content, not appearances. It prints a hash of each file as it exists here; run
# it with host=both, or compare against `sha256sum` of the same file in the repo. Same hash means
# the machine is running what is written down. Different means it is not, whatever the deploy said.
#
# Reads only.

echo "############ WHO AM I ############"
hostname
if [ -d /opt/gul-secondary ]; then ROOT=/opt/gul-secondary; else ROOT=/opt/gul; fi
echo "app root: $ROOT"
echo

echo "############ COMPOSE FILE ON DISK ############"
# The single thing that was wrong. Compare this hash with, in the repo:
#   sha256sum docker-compose.prod.yml       (primary)
#   sha256sum docker-compose.secondary.yml  (secondary)
if [ -f "$ROOT/docker-compose.yml" ]; then
  sha256sum "$ROOT/docker-compose.yml" | cut -c1-16
  echo "  services declared: $(grep -cE '^  [a-z][a-z0-9-]*:' "$ROOT/docker-compose.yml")"
  grep -E '^  [a-z][a-z0-9-]*:' "$ROOT/docker-compose.yml" | tr -d ' :' | tr '\n' ' '
  echo
  echo "  age: $(stat -c '%y' "$ROOT/docker-compose.yml" 2>/dev/null | cut -c1-16)"
else
  echo "  MISSING"
fi
echo

echo "############ WHAT IS ACTUALLY RUNNING ############"
# A service in the file that is not running, or a container running that is not in the file, is
# drift by definition -- the second is what --remove-orphans exists to prevent.
docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}" 2>/dev/null
echo

echo "############ NGINX VHOSTS ############"
# sync-nginx ships these, and only started shipping them to the secondary today.
for f in /etc/nginx/sites-enabled/*.conf; do
  [ -e "$f" ] || continue
  printf '  %-40s %s\n' "$(basename "$f")" "$(sha256sum "$f" | cut -c1-16)"
done
# nginx -t needs root to read the private keys; as this user it always fails, and
# reporting that as "invalid" was a false alarm in the first run of this check.
echo "  (nginx -t needs root; sync-nginx runs it as part of every reload)"
echo

echo "############ SYSTEMD UNITS WE INSTALL ############"
# Units live on the machine, not in an image, so a rebuilt or migrated host silently loses them --
# which is exactly how the database went unbacked-up for a fortnight after the August migration.
for unit in certbot.timer gul-db-backup.timer gul-cert-sync.timer gul-disk-alert.timer gul-watchdog.timer gul-docker-firewall.timer gul-docker-firewall.service; do
  state=$(systemctl is-enabled "$unit" 2>/dev/null | head -1 || true)
  active=$(systemctl is-active "$unit" 2>/dev/null | head -1 || true)
  [ -z "$state" ] && state=absent
  [ -z "$active" ] && active=-
  printf '  %-32s %-10s %s\n' "$unit" "$state" "$active"
done
echo

echo "############ IMAGE TAG AND SIZES ############"
grep -E "^IMAGE_TAG=" "$ROOT/.env" 2>/dev/null | cut -c1-24
echo "images held here:"
docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}" 2>/dev/null | grep -E "gul-(api|web|admin)" | head -12
echo "total docker disk:"
docker system df 2>/dev/null | head -4
