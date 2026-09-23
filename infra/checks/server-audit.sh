#!/usr/bin/env bash
# Read-only audit of a Gulyaly VPS. Piped over ssh stdin (`ssh host bash -s < this`) so nothing
# has to survive three layers of quoting.
#
# Prints no secrets: the database URL is reduced to host:port before it is shown, and .env is
# only ever listed by key.

echo "############ HOST ############"
hostname
uptime
echo "kernel: $(uname -r)"
echo

echo "############ CPU ############"
echo "cores: $(nproc)"
lscpu 2>/dev/null | grep -E "^Model name|^CPU\(s\)|^CPU MHz|^Vendor" || true
echo "--- load per core (1/5/15) ---"
awk '{print $1, $2, $3}' /proc/loadavg
echo "--- top 8 by cpu ---"
ps -eo pcpu,pmem,rss,comm --sort=-pcpu | head -9
echo

echo "############ GPU ############"
# These are plain cloud VPS instances; this exists to say so with evidence rather than assume.
lspci 2>/dev/null | grep -iE "vga|3d|display" || echo "no graphics device on the PCI bus (headless VPS)"
echo

echo "############ MEMORY ############"
free -h
echo "--- top 8 by resident memory ---"
ps -eo pmem,rss,comm --sort=-rss | head -9
echo "--- swap in use ---"
swapon --show 2>/dev/null || echo "no swap configured"
echo

echo "############ DISK ############"
df -h / /var 2>/dev/null | sort -u
echo "--- what is actually using it ---"
du -shx /var/lib/docker /var/log /opt/gul /opt/gul-secondary /home 2>/dev/null | sort -rh
echo "--- docker's own accounting ---"
docker system df 2>/dev/null
echo "--- backups on local disk (the ones that do not survive losing this box) ---"
du -sh /opt/gul/backups 2>/dev/null || echo "no /opt/gul/backups"
ls -1 /opt/gul/backups 2>/dev/null | wc -l
echo "--- journal size ---"
journalctl --disk-usage 2>/dev/null || true
echo

echo "############ CONTAINERS ############"
docker ps -a --format "{{.Names}}\t{{.Status}}\t{{.Image}}" 2>/dev/null
echo "--- live resource snapshot ---"
docker stats --no-stream --format "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null
echo "--- restart counts (a climbing number is a crash loop) ---"
for c in $(docker ps -aq 2>/dev/null); do
  docker inspect --format '{{.Name}} restarts={{.RestartCount}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c"
done
echo "--- log driver and log sizes ---"
for c in $(docker ps -aq 2>/dev/null); do
  f=$(docker inspect --format '{{.LogPath}}' "$c" 2>/dev/null)
  [ -n "$f" ] && [ -f "$f" ] && echo "$(docker inspect --format '{{.Name}}' "$c") $(du -h "$f" | cut -f1)"
done
echo

echo "############ SERVICES RUNNING ############"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}'
echo
echo "############ TIMERS (what wakes this box up) ############"
systemctl list-timers --all --no-pager --no-legend 2>/dev/null | head -20
echo
echo "############ CRON ############"
ls -1 /etc/cron.d 2>/dev/null
crontab -l 2>/dev/null || echo "no crontab for $(whoami)"
echo

echo "############ NETWORK ############"
echo "--- listening sockets ---"
ss -tulpn 2>/dev/null | grep LISTEN | awk '{print $1, $5}' | sort -u
echo "--- firewall ---"
sudo -n ufw status 2>/dev/null || echo "ufw status needs privileges this user does not have"
echo

echo "############ APP WIRING ############"
for dir in /opt/gul /opt/gul-secondary; do
  [ -d "$dir" ] || continue
  echo "--- $dir ---"
  grep -E "^IMAGE_TAG=" "$dir/.env" 2>/dev/null || echo "IMAGE_TAG not set"
  # Host and port only. The credentials in this URL must never reach a run log.
  grep -E "^DATABASE_URL=" "$dir/.env" 2>/dev/null | sed -E 's#^DATABASE_URL=.*@([^/?]+).*#database host: \1#'
  echo "keys present: $(grep -cE '^[A-Z_]+=' "$dir/.env" 2>/dev/null)"
done
echo

echo "############ API HEALTH ############"
curl -fsS -m 5 http://127.0.0.1:4000/api/health/ready 2>&1 | head -c 300 || echo "local API did not answer /health/ready"
echo

echo "############ REGISTRY REACHABILITY ############"
# Deploys began failing on "TLS handshake timeout" to ghcr.io while Docker Hub pulls in the same
# compose file succeeded. The usual cause is an AAAA record the host cannot actually route:
# curl and docker try IPv6 first and sit there until the handshake times out.
echo "--- what ghcr.io resolves to ---"
getent ahosts ghcr.io | awk '{print $1}' | sort -u
echo "--- over IPv4 ---"
curl -4 -sS -m 12 -o /dev/null -w "http=%{http_code} connect=%{time_connect}s tls=%{time_appconnect}s total=%{time_total}s\n" https://ghcr.io/v2/ 2>&1 | tail -2
echo "--- over IPv6 ---"
curl -6 -sS -m 12 -o /dev/null -w "http=%{http_code} connect=%{time_connect}s tls=%{time_appconnect}s total=%{time_total}s\n" https://ghcr.io/v2/ 2>&1 | tail -2
echo "--- default (whatever the resolver prefers) ---"
curl -sS -m 12 -o /dev/null -w "http=%{http_code} total=%{time_total}s\n" https://ghcr.io/v2/ 2>&1 | tail -2
echo "--- docker hub for comparison ---"
curl -sS -m 12 -o /dev/null -w "http=%{http_code} total=%{time_total}s\n" https://registry-1.docker.io/v2/ 2>&1 | tail -2
echo "--- does this host have a default IPv6 route at all ---"
ip -6 route show default 2>/dev/null || echo "no IPv6 default route"

echo "############ POSTGRES STANDBY ############"
# The secondary exists to be promoted. A container that is merely running proves nothing -- what
# matters is whether it is in recovery, whether the WAL receiver is streaming, and how far behind
# it is. Silence here would mean failover restores an old database.
if docker ps --format "{{.Names}}" 2>/dev/null | grep -q "^pg-standby$"; then
  # No psql, and so no credentials: pg_controldata reads the cluster state straight off
  # disk. "in archive recovery" plus a moving REDO location is the whole answer.
  docker exec pg-standby pg_controldata /var/lib/postgresql/data 2>&1 | grep -iE "cluster state|REDO location|Time of latest checkpoint" | head -5
  echo "--- last 5 standby log lines ---"
  docker logs --tail 5 pg-standby 2>&1 | head -5
else
  echo "no pg-standby container on this host"
fi
