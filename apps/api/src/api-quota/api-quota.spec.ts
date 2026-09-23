import { Controller, Get, INestApplication, UseGuards } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import request from "supertest";
import { REDIS_CLIENT } from "../queue/queue.module";
import { PrismaService } from "../prisma/prisma.service";
import { ApiQuotaService, DEFAULT_TIER_LIMITS, tierLimitsFromEnv } from "./api-quota.service";
import { ApiQuotaInterceptor, identityOf, isHealthCheck } from "./api-quota.interceptor";

describe("identityOf", () => {
  it("charges a partner to their key, not their address", () => {
    // The bug this whole part fixes: on IP alone, a partner behind NAT shares a bucket with every
    // customer behind the same NAT, and cannot be given a quota of their own at all.
    expect(identityOf({ apiKey: { id: "key_a" }, ip: "1.2.3.4" })).toBe("key:key_a");
  });

  it("charges a signed-in person to their account", () => {
    expect(identityOf({ user: { userId: "usr_1" }, ip: "1.2.3.4" })).toBe("user:usr_1");
  });

  it("falls back to the address only for anonymous traffic", () => {
    expect(identityOf({ ip: "1.2.3.4" })).toBe("ip:1.2.3.4");
    expect(identityOf({ socket: { remoteAddress: "5.6.7.8" } })).toBe("ip:5.6.7.8");
    expect(identityOf({})).toBe("ip:unknown");
  });

  it("prefers the key when both are somehow present", () => {
    expect(identityOf({ apiKey: { id: "key_a" }, user: { userId: "usr_1" } })).toBe("key:key_a");
  });
});

describe("isHealthCheck", () => {
  it("matches both spellings, because the app runs behind a global prefix", () => {
    expect(isHealthCheck("/health")).toBe(true);
    expect(isHealthCheck("/api/health/ready")).toBe(true);
    expect(isHealthCheck("/api/orders/me")).toBe(false);
    expect(isHealthCheck(undefined)).toBe(false);
  });
});

describe("tierLimitsFromEnv", () => {
  it("uses the documented defaults when nothing is configured", () => {
    expect(tierLimitsFromEnv({})).toEqual(DEFAULT_TIER_LIMITS);
  });

  it("lets each tier be overridden", () => {
    expect(tierLimitsFromEnv({ QUOTA_PARTNER_PER_MIN: "500" }).partner).toBe(500);
  });

  it("ignores nonsense rather than locking everyone out", () => {
    // A typo in an env var must not become a limit of zero on production.
    expect(tierLimitsFromEnv({ QUOTA_CUSTOMER_PER_MIN: "abc" }).customer).toBe(
      DEFAULT_TIER_LIMITS.customer,
    );
    expect(tierLimitsFromEnv({ QUOTA_CUSTOMER_PER_MIN: "0" }).customer).toBe(
      DEFAULT_TIER_LIMITS.customer,
    );
    expect(tierLimitsFromEnv({ QUOTA_CUSTOMER_PER_MIN: "-5" }).customer).toBe(
      DEFAULT_TIER_LIMITS.customer,
    );
  });
});

/** Counts INCRs per key, so a window can be driven to its limit. */
class FakeRedis {
  counts = new Map<string, number>();
  fail = false;

  pipeline() {
    const self = this;
    let target = "";
    const chain = {
      incr(key: string) {
        target = key;
        return chain;
      },
      expire() {
        return chain;
      },
      async exec() {
        if (self.fail) throw new Error("redis is down");
        const next = (self.counts.get(target) ?? 0) + 1;
        self.counts.set(target, next);
        return [[null, next]];
      },
    };
    return chain;
  }
}

class FakePrisma {
  rateLimitPerMin: number | null = null;
  throws = false;
  calls = 0;

  apiKey = {
    findUnique: async () => {
      this.calls++;
      if (this.throws) throw new Error("column does not exist");
      return { rateLimitPerMin: this.rateLimitPerMin };
    },
  };
}

describe("ApiQuotaService", () => {
  let redis: FakeRedis;
  let prisma: FakePrisma;
  let service: ApiQuotaService;

  beforeEach(() => {
    redis = new FakeRedis();
    prisma = new FakePrisma();
    service = new ApiQuotaService(redis as never, prisma as never);
  });

  it("allows up to the tier limit and rejects the request after it", async () => {
    const limit = DEFAULT_TIER_LIMITS.partner;
    let last = await service.consume("partner", "key:key_a");
    for (let i = 1; i < limit; i++) last = await service.consume("partner", "key:key_a");

    expect(last.allowed).toBe(true);
    expect(last.used).toBe(limit);

    const over = await service.consume("partner", "key:key_a");
    expect(over.allowed).toBe(false);
    expect(over.limit).toBe(limit);
  });

  it("counts each identity separately", async () => {
    await service.consume("customer", "user:a");
    const other = await service.consume("customer", "user:b");

    // One noisy customer must not spend another customer's allowance.
    expect(other.used).toBe(1);
  });

  it("uses a key's own limit when one is set", async () => {
    prisma.rateLimitPerMin = 2;

    expect((await service.consume("partner", "key:key_a", "key_a")).allowed).toBe(true);
    expect((await service.consume("partner", "key:key_a", "key_a")).allowed).toBe(true);
    expect((await service.consume("partner", "key:key_a", "key_a")).allowed).toBe(false);
  });

  it("treats a key with no limit as the tier default, never as unlimited", async () => {
    prisma.rateLimitPerMin = null;
    const verdict = await service.consume("partner", "key:key_a", "key_a");
    expect(verdict.limit).toBe(DEFAULT_TIER_LIMITS.partner);
  });

  it("reads a key's limit once per window rather than on every request", async () => {
    prisma.rateLimitPerMin = 100;
    for (let i = 0; i < 5; i++) await service.consume("partner", "key:key_a", "key_a");

    expect(prisma.calls).toBe(1);
  });

  it("forgets a cached limit on demand, so an admin change lands immediately", async () => {
    prisma.rateLimitPerMin = 100;
    await service.consume("partner", "key:key_a", "key_a");
    service.forget("key_a");
    await service.consume("partner", "key:key_a", "key_a");

    expect(prisma.calls).toBe(2);
  });

  it("falls back to the tier default when the column is not there yet", async () => {
    // The deploy pipeline starts the new image before running migrations. For a minute or two
    // this column does not exist, and partner traffic must keep flowing rather than 500.
    prisma.throws = true;
    const verdict = await service.consume("partner", "key:key_a", "key_a");

    expect(verdict.allowed).toBe(true);
    expect(verdict.limit).toBe(DEFAULT_TIER_LIMITS.partner);
  });

  it("fails open when Redis is unreachable", async () => {
    // A rate limiter that turns a Redis blip into a site-wide outage has done more damage than
    // the abuse it was guarding against.
    redis.fail = true;
    const verdict = await service.consume("customer", "user:a");

    expect(verdict.allowed).toBe(true);
  });
});

// ---- Wiring ----

/** Stands in for JwtAuthGuard: a route guard that populates `request.user`. */
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = { userId: "usr_1", role: "CUSTOMER" };
    return true;
  }
}

@Controller()
class ProbeController {
  @Get("open")
  open() {
    return { ok: true };
  }

  @UseGuards(FakeAuthGuard)
  @Get("signed-in")
  signedIn() {
    return { ok: true };
  }

  @Get("health/ready")
  health() {
    return { status: "ok" };
  }
}

describe("ApiQuotaInterceptor (wired)", () => {
  let app: INestApplication;
  let redis: FakeRedis;

  // A tiny public limit, so the exhaustion test needs four requests instead of three hundred.
  // Three hundred sequential requests can cross a minute boundary, which resets the window and
  // makes the test flaky -- it failed exactly that way once before this was pinned.
  const LIMIT = 3;
  const previousLimit = process.env.QUOTA_PUBLIC_PER_MIN;

  beforeAll(() => {
    process.env.QUOTA_PUBLIC_PER_MIN = String(LIMIT);
  });

  afterAll(() => {
    if (previousLimit === undefined) delete process.env.QUOTA_PUBLIC_PER_MIN;
    else process.env.QUOTA_PUBLIC_PER_MIN = previousLimit;
  });

  beforeEach(async () => {
    redis = new FakeRedis();

    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        ApiQuotaService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: PrismaService, useValue: new FakePrisma() },
        { provide: APP_INTERCEPTOR, useClass: ApiQuotaInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("sees the signed-in user, which a global guard could not have", async () => {
    // The reason this is an interceptor: a global *guard* runs before the route's own guards, so
    // request.user is still empty and every caller looks anonymous. This asserts the ordering.
    await request(app.getHttpServer()).get("/signed-in").expect(200);

    const keys = [...redis.counts.keys()];
    expect(keys.some((k) => k.includes("customer:user:usr_1"))).toBe(true);
    expect(keys.some((k) => k.includes(":ip:"))).toBe(false);
  });

  it("charges anonymous traffic to its address, under the public tier", async () => {
    await request(app.getHttpServer()).get("/open").expect(200);

    expect([...redis.counts.keys()].some((k) => k.startsWith("apiquota:public:ip:"))).toBe(true);
  });

  it("tells a client its budget without erasing the throttler's own headers", async () => {
    // @nestjs/throttler owns X-RateLimit-*; this quota is a second, independent limiter and says
    // so under its own names. Reusing the standard names would overwrite numbers that are still
    // true and still binding.
    const res = await request(app.getHttpServer()).get("/open").expect(200);

    expect(res.headers["x-quota-limit"]).toBe(String(LIMIT));
    expect(res.headers["x-quota-remaining"]).toBe(String(LIMIT - 1));
    expect(res.headers["x-quota-reset"]).toBeDefined();
  });

  it("answers 429 with Retry-After once the budget is gone", async () => {
    for (let i = 0; i < LIMIT; i++) {
      await request(app.getHttpServer()).get("/open").expect(200);
    }

    const res = await request(app.getHttpServer()).get("/open").expect(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.body.code).toBe("TOO_MANY_REQUESTS");
  });

  it("never limits a health check", async () => {
    // The load balancer and the deploy script use these to decide whether the process is alive.
    // Rate-limiting them can only cause a false failover.
    for (let i = 0; i < LIMIT + 5; i++) {
      await request(app.getHttpServer()).get("/health/ready").expect(200);
    }

    expect([...redis.counts.keys()]).toHaveLength(0);
  });
});
