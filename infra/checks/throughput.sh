#!/usr/bin/env bash
# How many requests a second does the API actually serve? Measured, over the loopback, so the
# number is the application's own capacity with the network taken out of it.
#
# Read-only in the sense that matters -- it only issues GETs to a catalogue endpoint -- but it is
# a load test against production and it will briefly occupy the box. Keep the durations short.
#
# Two things make the result honest rather than flattering:
#
#   * every request carries a different X-Forwarded-For, so the per-client rate limit (120/min,
#     working correctly since the trust-proxy fix) does not silently cap the test at 2/s;
#   * the load generator runs on the same 6-core box as the server, so it competes for CPU. The
#     figures below are therefore a FLOOR. Real capacity with the client elsewhere is higher.

python3 - <<'PY'
import http.client, time, threading, statistics

HOST, PORT, PATH = "127.0.0.1", 4000, "/api/catalog/services"

def burst(n, concurrency):
    lat, lock, counter = [], threading.Lock(), {"i": 0}

    def worker(wid):
        conn = http.client.HTTPConnection(HOST, PORT, timeout=10)
        mine = []
        while True:
            with lock:
                if counter["i"] >= n:
                    break
                counter["i"] += 1
                seq = counter["i"]
            t0 = time.perf_counter()
            try:
                # A distinct client per request: the rate limiter is per-IP now, and a test that
                # tripped it would be measuring the limiter rather than the application.
                conn.request("GET", PATH, headers={"X-Forwarded-For": "198.51.%d.%d" % (seq // 250 % 250, seq % 250)})
                r = conn.getresponse()
                r.read()
                if r.status != 200:
                    return
            except Exception:
                conn = http.client.HTTPConnection(HOST, PORT, timeout=10)
                continue
            mine.append(time.perf_counter() - t0)
        with lock:
            lat.extend(mine)

    threads = [threading.Thread(target=worker, args=(w,)) for w in range(concurrency)]
    t0 = time.perf_counter()
    for t in threads: t.start()
    for t in threads: t.join()
    elapsed = time.perf_counter() - t0
    return len(lat), elapsed, lat

# Warm the process: the very first requests pay for lazy module loading and an empty query plan
# cache, and reporting those as steady-state throughput would understate it badly.
burst(50, 4)

print("%-12s %10s %10s %10s %10s" % ("параллельно", "запросов", "в секунду", "среднее", "p95"))
for c in (1, 4, 16, 64):
    n = 300 if c == 1 else 800
    done, elapsed, lat = burst(n, c)
    if not lat:
        print("%-12d  не удалось" % c)
        continue
    lat.sort()
    p95 = lat[int(len(lat) * 0.95) - 1]
    print("%-12d %10d %10.0f %9.1fms %9.1fms" % (
        c, done, done / elapsed, statistics.mean(lat) * 1000, p95 * 1000))
PY

echo
echo "--- нагрузка на машину сразу после теста ---"
uptime
docker stats --no-stream --format "{{.Name}}  cpu {{.CPUPerc}}  mem {{.MemUsage}}" 2>/dev/null | head -6
