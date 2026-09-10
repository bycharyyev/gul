#!/usr/bin/env bash
# Read-only. How many people can actually be on this thing at once, and what runs out first.
#
# The answer is never "the server has 6 cores so 6 things at a time". It is set by whichever of
# these hits its ceiling first, and they are wildly different numbers:
#
#   * the API is one Node process -- one event loop -- no matter how many cores the box has;
#   * Postgres has a hard max_connections, and Prisma opens a fixed pool per API instance;
#   * nginx multiplies workers by connections and is almost never the limit;
#   * memory is shared with the database on this box, so the app cannot grow into it freely.
#
# Everything below is measured rather than assumed, including how much traffic actually arrives
# today -- headroom means nothing without knowing the current number.

read_root() {
  docker run --rm --pid=host --privileged -v /:/host alpine \
    chroot /host /bin/sh -c "$1" 2>&1
}

psql_q() {
  # < /dev/null is mandatory: this script is fed to `ssh bash -s` on stdin, and a compose exec
  # without it swallows the rest of the file and the job still reports success.
  (cd /opt/gul && docker compose exec -T postgres sh -c "psql -X -A -t -U \"\$POSTGRES_USER\" \"\$POSTGRES_DB\" -c \"$1\"") < /dev/null
}

echo "############ THE BOX ############"
echo "cores: $(nproc)"
free -h | head -2
echo

echo "############ CEILING 1: THE API IS ONE PROCESS ############"
# main.ts calls NestFactory.create + app.listen with no cluster module, so JavaScript execution
# for every request in flight happens on a single thread. Extra cores help Postgres, nginx and
# the Next.js renderer -- they do not help the API serve more requests per second.
echo "node processes inside the api container:"
api=$(docker ps --format "{{.Names}}" | grep -m1 api); docker exec "$api" ps -eo pid,pcpu,rss,args 2>/dev/null | grep -i "node\|PID" | head -5 || echo "  could not read $api"
echo
docker stats --no-stream --format "{{.Name}}\t cpu {{.CPUPerc}}\t mem {{.MemUsage}}" 2>/dev/null
echo

echo "############ CEILING 2: DATABASE CONNECTIONS ############"
echo -n "max_connections: "; psql_q "SHOW max_connections"
echo -n "reserved for superuser: "; psql_q "SHOW superuser_reserved_connections"
echo -n "in use right now: "; psql_q "SELECT count(*) FROM pg_stat_activity"
echo "by client and state:"
psql_q "SELECT coalesce(client_addr::text,'local') || '  ' || coalesce(state,'?') || '  ' || count(*) FROM pg_stat_activity GROUP BY client_addr, state ORDER BY count(*) DESC"
echo -n "shared_buffers: "; psql_q "SHOW shared_buffers"
echo -n "work_mem: "; psql_q "SHOW work_mem"
echo
echo "prisma pool size per API instance (connection_limit; blank means Prisma's default of cores*2+1):"
grep -oE "connection_limit=[0-9]+" /opt/gul/.env 2>/dev/null || echo "  not set -> default applies"
echo

echo "############ CEILING 3: NGINX ############"
read_root "nginx -T 2>/dev/null | grep -aE '^\s*(worker_processes|worker_connections|keepalive_timeout|worker_rlimit_nofile)' | head -6"
echo

echo "############ WHAT ARRIVES TODAY ############"
# Headroom is meaningless without the current number. The busiest single minute in the log is the
# figure that matters -- averages hide the peak that actually decides whether people wait.
read_root "test -f /var/log/nginx/access.log && wc -l < /var/log/nginx/access.log"
echo "  <- requests in the current access log"
echo "busiest minutes on record:"
read_root "awk -F'[][]' '{print substr(\$2,1,17)}' /var/log/nginx/access.log 2>/dev/null | sort | uniq -c | sort -rn | head -5"
echo "distinct client addresses seen:"
read_root "awk '{print \$1}' /var/log/nginx/access.log 2>/dev/null | sort -u | wc -l"
echo

echo "############ HOW FAST DOES IT ANSWER, FROM THE BOX ITSELF ############"
# Loopback, so this is the application's own time with the network taken out. If these are already
# slow with nobody on the site, no amount of concurrency planning will help.
for path in /api/health/ready /api/catalog/services; do
  printf '%-28s' "$path"
  curl -o /dev/null -s -w "http=%{http_code}  total=%{time_total}s\n" -m 10 "http://127.0.0.1:4000$path"
done
echo

echo "############ RATE LIMIT IN FRONT OF ALL OF IT ############"
# ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]) -- per IP, in memory, per process.
echo "app-level: 120 requests / 60s per IP (from app.module.ts)"
read_root "nginx -T 2>/dev/null | grep -acE 'limit_req|limit_conn'"
echo "  <- nginx-level rate limit directives (0 means none)"
echo
echo "############ IS THE RATE LIMITER SEEING REAL CLIENTS ############"
# main.ts never enables Express trust proxy, so req.ip is the socket peer -- which is always
# nginx on the loopback. ThrottlerGuard tracks by req.ip, so every visitor on earth may be
# counted as one client against a 120-per-minute budget. A pile of 429s in the access log is
# what that looks like from outside; none at all would mean something else is going on.
read_root "awk '{print \$9}' /var/log/nginx/access.log 2>/dev/null | sort | uniq -c | sort -rn | head -8"
echo "  <- HTTP status codes in the current access log"
echo
echo "429s, and who got them:"
read_root "awk '\$9==429 {print \$1}' /var/log/nginx/access.log 2>/dev/null | sort | uniq -c | sort -rn | head -5"
echo
echo "what the API itself thinks the client address is (should be a real address, not 127.0.0.1):"
curl -s -m 5 -H 'X-Forwarded-For: 203.0.113.9' -o /dev/null -w "  probe sent, http=%{http_code}
" http://127.0.0.1:4000/api/health/ready
