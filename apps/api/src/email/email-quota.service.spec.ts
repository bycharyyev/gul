import { EmailQuotaService } from "./email-quota.service";

/** Minimal in-memory stand-in for the Redis counter, with the same INCR/DECR semantics. */
function fakeRedis(initial = 0) {
  const store = new Map<string, number>();
  return {
    counts: store,
    seed(key: string, value: number) {
      store.set(key, value);
    },
    incr: jest.fn(async (key: string) => {
      const next = (store.get(key) ?? initial) + 1;
      store.set(key, next);
      return next;
    }),
    decr: jest.fn(async (key: string) => {
      const next = (store.get(key) ?? 0) - 1;
      store.set(key, next);
      return next;
    }),
    expire: jest.fn(async () => 1),
    get: jest.fn(async (key: string) => (store.has(key) ? String(store.get(key)) : null)),
  };
}

function todayKey() {
  return `email:quota:${new Date().toISOString().slice(0, 10)}`;
}

describe("EmailQuotaService", () => {
  const originalLimit = process.env.EMAIL_DAILY_LIMIT;

  afterEach(() => {
    if (originalLimit === undefined) delete process.env.EMAIL_DAILY_LIMIT;
    else process.env.EMAIL_DAILY_LIMIT = originalLimit;
  });

  it("allows a send while under the limit", async () => {
    process.env.EMAIL_DAILY_LIMIT = "100";
    const redis = fakeRedis();
    const service = new EmailQuotaService(redis as never);
    expect(await service.claim("critical")).toBeNull();
  });

  it("sets the key TTL only when it creates the counter, so a restart can't extend the window", async () => {
    process.env.EMAIL_DAILY_LIMIT = "100";
    const redis = fakeRedis();
    const service = new EmailQuotaService(redis as never);

    await service.claim("critical");
    expect(redis.expire).toHaveBeenCalledTimes(1);
    await service.claim("critical");
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it("refuses and gives the slot back once the daily limit is reached", async () => {
    process.env.EMAIL_DAILY_LIMIT = "10";
    const redis = fakeRedis();
    redis.seed(todayKey(), 10);
    const service = new EmailQuotaService(redis as never);

    expect(await service.claim("critical")).toMatch(/лимит/i);
    // The refused INCR must be rolled back, or a rejected send would still consume budget.
    expect(redis.counts.get(todayKey())).toBe(10);
  });

  describe("reserving headroom for critical mail", () => {
    it("stops marketing at its lower ceiling while critical still has room", async () => {
      process.env.EMAIL_DAILY_LIMIT = "100";
      const redis = fakeRedis();
      redis.seed(todayKey(), 60); // marketing ceiling is 60%
      const service = new EmailQuotaService(redis as never);

      expect(await service.claim("marketing")).toMatch(/лимит/i);
      expect(await service.claim("critical")).toBeNull();
    });

    it("stops ordinary transactional mail before critical, so an OTP still gets through", async () => {
      process.env.EMAIL_DAILY_LIMIT = "100";
      const redis = fakeRedis();
      redis.seed(todayKey(), 85); // transactional ceiling is 85%
      const service = new EmailQuotaService(redis as never);

      expect(await service.claim("transactional")).toMatch(/лимит/i);
      expect(await service.claim("critical")).toBeNull();
    });
  });

  it("allows the send rather than blocking all mail when Redis is unreachable", async () => {
    const redis = fakeRedis();
    redis.incr.mockRejectedValue(new Error("ECONNREFUSED"));
    const service = new EmailQuotaService(redis as never);
    expect(await service.claim("transactional")).toBeNull();
  });

  it("reports usage for the dashboard", async () => {
    process.env.EMAIL_DAILY_LIMIT = "200";
    const redis = fakeRedis();
    redis.seed(todayKey(), 50);
    const service = new EmailQuotaService(redis as never);

    const usage = await service.usage();
    expect(usage).toMatchObject({ used: 50, limit: 200, remaining: 150, usedPercent: 25 });
    expect(usage.resetsAt.getTime()).toBeGreaterThan(Date.now());
  });
});
