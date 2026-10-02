import { EventEmitter } from "node:events";
import { PerfMetricsService, percentile, windowKeys } from "./perf-metrics.service";
import { PerfMetricsMiddleware } from "./perf-metrics.middleware";
import { cacheRatio } from "./performance.service";

/** Hashes and HyperLogLogs (as exact sets -- the test only needs counts) behind a pipeline. */
class FakeRedis {
  hashes = new Map<string, Map<string, number>>();
  sets = new Map<string, Set<string>>();
  pipeline() {
    const ops: Array<() => unknown> = [];
    const p = {
      hincrby: (k: string, f: string, n: number) => {
        ops.push(() => {
          const h = this.hashes.get(k) ?? new Map<string, number>();
          h.set(f, (h.get(f) ?? 0) + n);
          this.hashes.set(k, h);
        });
        return p;
      },
      expire: () => (ops.push(() => 1), p),
      pfadd: (k: string, ...vs: string[]) => (
        ops.push(() => vs.forEach((v) => (this.sets.get(k) ?? this.sets.set(k, new Set()).get(k)!).add(v))),
        p
      ),
      hgetall: (k: string) => (ops.push(() => Object.fromEntries([...(this.hashes.get(k) ?? new Map())].map(([f, v]) => [f, String(v)]))), p),
      exec: async () => ops.map((op) => [null, op()]),
    };
    return p;
  }
  async pfcount(...keys: string[]) {
    const all = new Set<string>();
    for (const k of keys) for (const v of this.sets.get(k) ?? []) all.add(v);
    return all.size;
  }
  async smembers() {
    return [];
  }
  disconnect() {}
}

const NOW = new Date("2026-10-02T12:30:30.000Z");

describe("PerfMetricsService", () => {
  it("aggregates status classes, 429s, latency and users into the period", async () => {
    const redis = new FakeRedis();
    const perf = new PerfMetricsService(redis as never);
    perf.record(200, 20, "u1", NOW);
    perf.record(200, 40, "u2", NOW);
    perf.record(429, 1, null, NOW);
    perf.record(500, 900, "u1", NOW);
    expect(redis.hashes.size).toBe(0); // nothing touches Redis per request
    await perf.flush();

    const snap = await perf.snapshot("5m", NOW);
    expect(snap.totals).toMatchObject({ requests: 4, status2xx: 2, status4xx: 1, status429: 1, status5xx: 1 });
    expect(snap.totals.avgMs).toBeCloseTo((20 + 40 + 1 + 900) / 4, 0);
    expect(snap.series).toHaveLength(5);
    expect(snap.series.at(-1)).toMatchObject({ requests: 4, errors5xx: 1 });

    await expect(perf.activeUsers(NOW)).resolves.toEqual({ online5m: 2, active1h: 2, active24h: 2 });
  });

  it("never throws or blocks when Redis is unavailable", () => {
    const broken = {
      pipeline: () => {
        const p: Record<string, unknown> = {};
        for (const m of ["hincrby", "expire", "pfadd"]) p[m] = () => p;
        p.exec = () => Promise.reject(new Error("Connection is closed."));
        return p;
      },
    };
    const perf = new PerfMetricsService(broken as never);
    expect(() => perf.record(200, 5, "u1")).not.toThrow();
    return expect(perf.flush()).resolves.toBeUndefined();
  });
});

describe("percentile (histogram estimate)", () => {
  it("interpolates inside the bucket the rank falls in", () => {
    // 100 requests: 90 in <=10ms (b0), 10 in 100..250ms (b4)
    expect(percentile({ b0: 90, b4: 10 }, 0.5)).toBeLessThanOrEqual(10);
    const p95 = percentile({ b0: 90, b4: 10 }, 0.95);
    expect(p95).toBeGreaterThan(100);
    expect(p95).toBeLessThanOrEqual(250);
  });

  it("is 0 with no data", () => {
    expect(percentile({}, 0.95)).toBe(0);
  });
});

describe("windowKeys", () => {
  it("uses minute buckets for 5m/1h and hour buckets for 24h/7d, oldest first", () => {
    expect(windowKeys("5m", NOW).keys).toEqual([
      "perf:m:202610021226",
      "perf:m:202610021227",
      "perf:m:202610021228",
      "perf:m:202610021229",
      "perf:m:202610021230",
    ]);
    expect(windowKeys("1h", NOW).keys).toHaveLength(60);
    expect(windowKeys("24h", NOW).keys.at(-1)).toBe("perf:h:2026100212");
    expect(windowKeys("7d", NOW).keys).toHaveLength(168);
  });
});

describe("PerfMetricsMiddleware", () => {
  function run(url: string, status: number, user?: { userId: string }) {
    const perf = { record: jest.fn() };
    const mw = new PerfMetricsMiddleware(perf as never);
    const res = Object.assign(new EventEmitter(), { statusCode: status });
    const next = jest.fn();
    mw.use({ originalUrl: url, user } as never, res as never, next);
    res.emit("finish");
    return { perf, next };
  }

  it("counts every answer, including the rate limiter's 429 that interceptors never see", () => {
    const { perf, next } = run("/api/catalog/services", 429);
    expect(next).toHaveBeenCalled();
    expect(perf.record).toHaveBeenCalledWith(429, expect.any(Number), null);
  });

  it("attributes the request to the signed-in user, if any", () => {
    const { perf } = run("/api/orders/me", 200, { userId: "u7" });
    expect(perf.record).toHaveBeenCalledWith(200, expect.any(Number), "u7");
  });

  it("skips health checks", () => {
    const { perf, next } = run("/api/health/ready", 200);
    expect(next).toHaveBeenCalled();
    expect(perf.record).not.toHaveBeenCalled();
  });
});

describe("cacheRatio", () => {
  it("sums days and groups into hit ratios", () => {
    const r = cacheRatio([
      { day: "2026-10-02", groups: { catalog: { hit: 9, miss: 1 }, gallery: { hit: 1, miss: 1 } } },
    ]);
    expect(r.ratio).toBeCloseTo(10 / 12);
    expect(r.groups.catalog.ratio).toBeCloseTo(0.9);
  });

  it("is null when nothing was read", () => {
    expect(cacheRatio([]).ratio).toBeNull();
  });
});
