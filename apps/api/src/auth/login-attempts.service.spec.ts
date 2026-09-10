import { LoginAttemptsService } from "./login-attempts.service";

/** A Redis stand-in with just enough behaviour: counters, TTLs, and the ability to break. */
function makeRedis() {
  const counters = new Map<string, number>();
  const blocks = new Map<string, number>();
  return {
    counters,
    blocks,
    broken: false,
    async incr(key: string) {
      if (this.broken) throw new Error("connection lost");
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async expire() {
      if (this.broken) throw new Error("connection lost");
      return 1;
    },
    async set(key: string, _v: string, _ex: string, seconds: number) {
      if (this.broken) throw new Error("connection lost");
      blocks.set(key, seconds);
      return "OK";
    },
    async ttl(key: string) {
      if (this.broken) throw new Error("connection lost");
      return blocks.get(key) ?? -2;
    },
    async del(...keys: string[]) {
      if (this.broken) throw new Error("connection lost");
      keys.forEach((k) => {
        counters.delete(k);
        blocks.delete(k);
      });
      return keys.length;
    },
  };
}

const PHONE = "+99361234567";

describe("LoginAttemptsService", () => {
  let redis: ReturnType<typeof makeRedis>;
  let service: LoginAttemptsService;

  beforeEach(() => {
    redis = makeRedis();
    service = new LoginAttemptsService(redis as never);
  });

  it("costs nothing to fumble a password a few times", async () => {
    for (let i = 0; i < 4; i++) {
      expect(await service.recordFailure(PHONE)).toBe(0);
    }
    expect((await service.check(PHONE)).allowed).toBe(true);
  });

  it("starts asking the fifth guess to wait, and doubles from there", async () => {
    const penalties: number[] = [];
    for (let i = 0; i < 8; i++) penalties.push(await service.recordFailure(PHONE));

    expect(penalties).toEqual([0, 0, 0, 0, 1, 2, 4, 8]);
  });

  it("caps the wait instead of growing without limit", async () => {
    // Past a point the attacker is already beaten and only the account's real owner is being
    // punished -- an hour-long wait protects nothing that five minutes does not.
    let last = 0;
    for (let i = 0; i < 40; i++) last = await service.recordFailure(PHONE);

    expect(last).toBe(300);
  });

  it("refuses while the wait is running, and says how long is left", async () => {
    for (let i = 0; i < 6; i++) await service.recordFailure(PHONE);

    const verdict = await service.check(PHONE);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBe(2);
  });

  it("a correct password erases the history", async () => {
    // The property that keeps this off ordinary people entirely: signing in successfully costs
    // nothing and clears whatever came before, however often it happens.
    for (let i = 0; i < 6; i++) await service.recordFailure(PHONE);
    expect((await service.check(PHONE)).allowed).toBe(false);

    await service.clear(PHONE);

    expect((await service.check(PHONE)).allowed).toBe(true);
    expect(await service.recordFailure(PHONE)).toBe(0);
  });

  it("holds one account's failures against that account alone", async () => {
    // The whole reason this is keyed on the number rather than the address: thousands of people
    // behind one carrier NAT must not share a budget.
    for (let i = 0; i < 8; i++) await service.recordFailure(PHONE);

    expect((await service.check("+99361119999")).allowed).toBe(true);
  });

  it("lets people in when Redis is down rather than locking everyone out", async () => {
    // Failing closed would mean nobody in the country can sign in because a cache is unwell, and
    // the per-IP throttle in front is still standing. The smaller harm is chosen deliberately.
    for (let i = 0; i < 6; i++) await service.recordFailure(PHONE);
    redis.broken = true;

    expect((await service.check(PHONE)).allowed).toBe(true);
    expect(await service.recordFailure(PHONE)).toBe(0);
    await expect(service.clear(PHONE)).resolves.toBeUndefined();
  });

  it("does not put the phone number itself in the key", async () => {
    await service.recordFailure(PHONE);

    const keys = [...redis.counters.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(PHONE);
    expect(keys[0]).toMatch(/^login:fail:[0-9a-f]{32}$/);
  });
});
