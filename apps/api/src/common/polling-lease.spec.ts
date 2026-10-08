import { PollingLease, type LeasedRunner } from "./polling-lease";

/** Just enough of Redis for the lease: SET NX PX, and the two compare-and-act scripts. */
class FakeRedis {
  store = new Map<string, { v: string; until: number }>();
  down = false;
  constructor(private clock: () => number) {}
  private live(k: string) {
    const e = this.store.get(k);
    if (e && e.until <= this.clock()) this.store.delete(k);
    return this.store.get(k);
  }
  async set(k: string, v: string, _px: string, ms: number, _nx: string) {
    if (this.down) throw new Error("ECONNREFUSED");
    if (this.live(k)) return null;
    this.store.set(k, { v, until: this.clock() + ms });
    return "OK";
  }
  async eval(script: string, _n: number, k: string, owner: string, ms?: string) {
    if (this.down) throw new Error("ECONNREFUSED");
    const e = this.live(k);
    if (!e || e.v !== owner) return 0;
    if (script.includes("pexpire")) e.until = this.clock() + Number(ms);
    else this.store.delete(k);
    return 1;
  }
}

function runner() {
  let on = false;
  const r: LeasedRunner & { starts: number } = {
    starts: 0,
    start: () => {
      on = true;
      r.starts++;
    },
    stop: () => {
      on = false;
    },
    isRunning: () => on,
  };
  return r;
}

const quiet = { log: () => undefined, warn: () => undefined };

describe("PollingLease", () => {
  let t: number;
  const clock = () => t;
  beforeEach(() => {
    t = 1_000_000;
  });

  it("lets exactly one of two eligible processes poll", async () => {
    const redis = new FakeRedis(clock);
    const a = runner();
    const b = runner();
    const la = new PollingLease(redis as never, "lease:bot", a, quiet, 30_000, clock);
    const lb = new PollingLease(redis as never, "lease:bot", b, quiet, 30_000, clock);
    await la.tick();
    await lb.tick();
    expect(a.isRunning()).toBe(true);
    expect(b.isRunning()).toBe(false);
  });

  it("hands polling to the other process once the holder stops renewing (it died)", async () => {
    const redis = new FakeRedis(clock);
    const a = runner();
    const b = runner();
    const la = new PollingLease(redis as never, "lease:bot", a, quiet, 30_000, clock);
    const lb = new PollingLease(redis as never, "lease:bot", b, quiet, 30_000, clock);
    await la.tick();
    t += 31_000; // a is gone: no renewals for longer than the TTL
    await lb.tick();
    expect(b.isRunning()).toBe(true);
  });

  it("stops polling when the lease was taken over, before polling twice", async () => {
    const redis = new FakeRedis(clock);
    const a = runner();
    const la = new PollingLease(redis as never, "lease:bot", a, quiet, 30_000, clock);
    await la.tick();
    redis.store.set("lease:bot", { v: "someone-else", until: t + 30_000 });
    await la.tick();
    expect(a.isRunning()).toBe(false);
    expect(la.isHeld()).toBe(false);
  });

  it("rides out a short Redis blip but stops before the lease could have expired", async () => {
    const redis = new FakeRedis(clock);
    const a = runner();
    const la = new PollingLease(redis as never, "lease:bot", a, quiet, 30_000, clock);
    await la.tick();
    redis.down = true;
    t += 10_000;
    await la.tick();
    expect(a.isRunning()).toBe(true);
    t += 15_000; // 25 s since the last confirmation: past TTL - TTL/3
    await la.tick();
    expect(a.isRunning()).toBe(false);
  });

  it("restarts a poller that died while the lease is still held", async () => {
    const redis = new FakeRedis(clock);
    const a = runner();
    const la = new PollingLease(redis as never, "lease:bot", a, quiet, 30_000, clock);
    await la.tick();
    a.stop(); // e.g. a 409 during a handover
    await la.tick();
    expect(a.isRunning()).toBe(true);
    expect(a.starts).toBe(2);
  });

  it("releases the lease on shutdown so the other node takes over at once", async () => {
    const redis = new FakeRedis(clock);
    const a = runner();
    const b = runner();
    const la = new PollingLease(redis as never, "lease:bot", a, quiet, 30_000, clock);
    const lb = new PollingLease(redis as never, "lease:bot", b, quiet, 30_000, clock);
    await la.tick();
    await la.end();
    await lb.tick();
    expect(b.isRunning()).toBe(true);
  });
});
