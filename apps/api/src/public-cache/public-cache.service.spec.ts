import { of, lastValueFrom, throwError } from "rxjs";
import { PublicCacheService, stableParams } from "./public-cache.service";
import { PublicCacheInvalidationInterceptor } from "./invalidates-public-cache.decorator";

/**
 * Just enough of ioredis for the cache: strings, hashes, a pipeline, MULTI and the one Lua script
 * (whose semantics are reproduced here, since the generation check is the point of it).
 */
class FakeRedis {
  strings = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  down = false;
  /** Runs inside eval before the write, to simulate an edit landing mid-load. */
  beforeWrite?: () => void;

  private check() {
    if (this.down) throw new Error("Connection is closed.");
  }
  private hash(key: string) {
    let h = this.hashes.get(key);
    if (!h) this.hashes.set(key, (h = new Map()));
    return h;
  }
  pipeline() {
    const ops: Array<() => unknown> = [];
    const p = {
      get: (k: string) => (ops.push(() => this.strings.get(k) ?? null), p),
      hget: (k: string, f: string) => (ops.push(() => this.hashes.get(k)?.get(f) ?? null), p),
      hincrby: (k: string, f: string, n: number) => (
        ops.push(() => this.hash(k).set(f, String(Number(this.hash(k).get(f) ?? 0) + n))),
        p
      ),
      expire: () => (ops.push(() => 1), p),
      exec: async () => {
        this.check();
        return ops.map((op) => [null, op()]);
      },
    };
    return p;
  }
  multi() {
    const ops: Array<() => unknown> = [];
    const m = {
      incr: (k: string) => (ops.push(() => this.strings.set(k, String(Number(this.strings.get(k) ?? 0) + 1))), m),
      del: (k: string) => (ops.push(() => this.hashes.delete(k)), m),
      exec: async () => {
        this.check();
        return ops.map((op) => [null, op()]);
      },
    };
    return m;
  }
  async eval(_script: string, _n: number, hashKey: string, genKey: string, gen: string, field: string, value: string) {
    this.check();
    this.beforeWrite?.();
    if ((this.strings.get(genKey) ?? "0") !== gen) return 0;
    this.hash(hashKey).set(field, value);
    return 1;
  }
  async hgetall(key: string) {
    this.check();
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }
  disconnect() {}
}

function setup() {
  const redis = new FakeRedis();
  const cache = new PublicCacheService(redis as never);
  return { redis, cache };
}

const flush = () => new Promise((r) => setImmediate(r));

describe("PublicCacheService", () => {
  it("loads once, then answers from Redis", async () => {
    const { cache } = setup();
    const load = jest.fn().mockResolvedValue([{ id: "s1", price: "1.50" }]);

    await expect(cache.wrap("catalog", "services", {}, 30, load)).resolves.toEqual([{ id: "s1", price: "1.50" }]);
    await flush();
    await expect(cache.wrap("catalog", "services", {}, 30, load)).resolves.toEqual([{ id: "s1", price: "1.50" }]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.localStats().catalog).toMatchObject({ miss: 1, hit: 1, error: 0 });
  });

  it("answers a miss in the same JSON shape a hit has (dates as strings)", async () => {
    const { cache } = setup();
    const at = new Date("2026-10-02T10:00:00.000Z");
    await expect(cache.wrap("content", "stories", {}, 30, async () => [{ at }])).resolves.toEqual([
      { at: "2026-10-02T10:00:00.000Z" },
    ]);
  });

  it("keys on every parameter, in any order, ignoring empty ones", async () => {
    const { cache } = setup();
    const load = jest.fn().mockImplementation(async () => Math.random());

    const a = await cache.wrap("gallery", "products", { categoryId: "c1", search: "rose" }, 30, load);
    await flush();
    const b = await cache.wrap("gallery", "products", { search: "rose", categoryId: "c1", sellerId: undefined }, 30, load);
    await flush();
    const c = await cache.wrap("gallery", "products", { categoryId: "c2", search: "rose" }, 30, load);

    expect(b).toBe(a);
    expect(c).not.toBe(a);
    expect(load).toHaveBeenCalledTimes(2);
    expect(stableParams({ b: "2", a: "x y", c: "" })).toBe("a=x%20y&b=2");
  });

  it("re-loads after the TTL", async () => {
    const { cache } = setup();
    const load = jest.fn().mockResolvedValue(1);
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    await cache.wrap("catalog", "services", {}, 30, load);
    await flush();
    now.mockReturnValue(1_000_000 + 31_000);
    await cache.wrap("catalog", "services", {}, 30, load);
    now.mockRestore();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("invalidation drops the group, so the next read goes to the database", async () => {
    const { cache } = setup();
    const load = jest.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");

    await cache.wrap("catalog", "services", {}, 30, load);
    await flush();
    await cache.invalidate("catalog");
    await expect(cache.wrap("catalog", "services", {}, 30, load)).resolves.toBe("new");
  });

  it("a load that started before an edit never writes the old answer back after it", async () => {
    const { redis, cache } = setup();
    // The edit's invalidation lands between the load reading the generation and the write.
    redis.beforeWrite = () => {
      redis.beforeWrite = undefined;
      void cache.invalidate("catalog");
    };
    await cache.wrap("catalog", "services", {}, 30, async () => "stale");
    await flush();

    const load = jest.fn().mockResolvedValue("fresh");
    await expect(cache.wrap("catalog", "services", {}, 30, load)).resolves.toBe("fresh");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("with Redis down every read is served by the database and nothing throws", async () => {
    const { redis, cache } = setup();
    redis.down = true;
    const load = jest.fn().mockResolvedValue("from-db");

    await expect(cache.wrap("gallery", "categories", {}, 60, load)).resolves.toBe("from-db");
    await expect(cache.wrap("gallery", "categories", {}, 60, load)).resolves.toBe("from-db");
    await expect(cache.invalidate("gallery")).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.localStats().gallery.error).toBe(2);
  });

  it("concurrent misses on one key share a single database load (no stampede)", async () => {
    const { cache } = setup();
    let release!: (v: string) => void;
    const load = jest.fn().mockImplementation(() => new Promise<string>((r) => (release = r)));

    const all = Promise.all(Array.from({ length: 20 }, () => cache.wrap("catalog", "services", {}, 30, load)));
    await flush();
    release("once");

    expect(await all).toEqual(Array(20).fill("once"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never caches a failure: a missing product is looked up again next time", async () => {
    const { cache } = setup();
    const load = jest.fn().mockRejectedValueOnce(new Error("Product not found")).mockResolvedValueOnce({ id: "p1" });

    await expect(cache.wrap("gallery", "product", { id: "p1" }, 60, load)).rejects.toThrow("Product not found");
    await expect(cache.wrap("gallery", "product", { id: "p1" }, 60, load)).resolves.toEqual({ id: "p1" });
  });

  it("keeps cross-node daily hit/miss totals in Redis", async () => {
    const { cache } = setup();
    await cache.wrap("catalog", "services", {}, 30, async () => 1);
    await flush();
    await cache.wrap("catalog", "services", {}, 30, async () => 1);
    await flush();
    const [today] = await cache.dailyStats(1);
    expect(today.groups.catalog).toMatchObject({ miss: 1, hit: 1 });
  });
});

describe("PublicCacheInvalidationInterceptor", () => {
  function build(groups: string[]) {
    const cache = { invalidate: jest.fn().mockResolvedValue(undefined) };
    const reflector = { get: jest.fn().mockReturnValue(groups) };
    const interceptor = new PublicCacheInvalidationInterceptor(reflector as never, cache as never);
    const context = { getHandler: () => () => undefined } as never;
    return { interceptor, cache, context };
  }

  it("invalidates after the edit succeeded, and passes the response through", async () => {
    const { interceptor, cache, context } = build(["gallery"]);
    await expect(lastValueFrom(interceptor.intercept(context, { handle: () => of({ id: "p1" }) }))).resolves.toEqual({
      id: "p1",
    });
    expect(cache.invalidate).toHaveBeenCalledWith("gallery");
  });

  it("does not invalidate when the edit failed", async () => {
    const { interceptor, cache, context } = build(["gallery"]);
    await expect(
      lastValueFrom(interceptor.intercept(context, { handle: () => throwError(() => new Error("nope")) })),
    ).rejects.toThrow("nope");
    expect(cache.invalidate).not.toHaveBeenCalled();
  });
});
