import { Controller, Get, INestApplication, NotFoundException, Param } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { REDIS_CLIENT } from "../queue/queue.module";
import { ApiMetricsInterceptor } from "./api-metrics.interceptor";
import { ApiMetricsService } from "./api-metrics.service";

/**
 * A Redis stand-in that records what the pipeline was asked to do.
 *
 * The unit tests cover the aggregation maths; this covers the wiring, which they cannot: that the
 * interceptor is actually installed, that it sees the route *template* rather than the resolved
 * path, and that a thrown exception is still counted.
 */
class FakeRedis {
  readonly increments: { key: string; field: string; by: number }[] = [];
  readonly expiries: string[] = [];
  failNext = false;

  pipeline() {
    const self = this;
    const ops: (() => void)[] = [];
    const chain = {
      hincrby(key: string, field: string, by: number) {
        ops.push(() => self.increments.push({ key, field, by }));
        return chain;
      },
      expire(key: string, _ttl: number) {
        ops.push(() => self.expiries.push(key));
        return chain;
      },
      hgetall() {
        return chain;
      },
      async exec() {
        if (self.failNext) throw new Error("redis is down");
        for (const op of ops) op();
        return [];
      },
    };
    return chain;
  }
}

@Controller("things")
class ThingsController {
  @Get(":id")
  find(@Param("id") id: string) {
    if (id === "missing") throw new NotFoundException("no such thing");
    return { id };
  }
}

describe("ApiMetricsInterceptor (wired)", () => {
  let app: INestApplication;
  let redis: FakeRedis;

  beforeEach(async () => {
    redis = new FakeRedis();

    const moduleRef = await Test.createTestingModule({
      controllers: [ThingsController],
      providers: [
        ApiMetricsService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: APP_INTERCEPTOR, useClass: ApiMetricsInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  /** The write is fire-and-forget, so give the microtask queue a turn before asserting. */
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it("records the route template, not the id that was requested", async () => {
    await request(app.getHttpServer()).get("/things/cmt0b0y020000oe10uducp2n1").expect(200);
    await settle();

    const fields = redis.increments.map((i) => i.field);

    // This is the whole privacy and cardinality argument in one assertion.
    expect(fields).toContain("public|GET /things/:id|2xx");
    expect(fields.join(" ")).not.toContain("cmt0b0y020000oe10uducp2n1");
  });

  it("counts a failed request, which is the traffic most worth counting", async () => {
    await request(app.getHttpServer()).get("/things/missing").expect(404);
    await settle();

    expect(redis.increments.map((i) => i.field)).toContain("public|GET /things/:id|4xx");
  });

  it("records latency as a sum and a count", async () => {
    await request(app.getHttpServer()).get("/things/abc").expect(200);
    await settle();

    const latency = redis.increments.filter((i) => i.key.startsWith("apiusage:latency:"));
    expect(latency.map((i) => i.field).sort()).toEqual(["GET /things/:id|n", "GET /things/:id|sum"]);
    expect(latency.find((i) => i.field.endsWith("|n"))?.by).toBe(1);
  });

  it("sets a TTL on every hash it touches, so counters expire on their own", async () => {
    await request(app.getHttpServer()).get("/things/abc").expect(200);
    await settle();

    expect(redis.expiries.length).toBeGreaterThan(0);
    expect(redis.expiries.every((k) => k.startsWith("apiusage:"))).toBe(true);
  });

  it("keeps serving when Redis is down", async () => {
    // The point of the whole design: metrics are diagnostics, and an observability layer that
    // can take the product down is worse than none.
    redis.failNext = true;

    await request(app.getHttpServer()).get("/things/abc").expect(200).expect({ id: "abc" });
    await settle();

    expect(redis.increments).toHaveLength(0);
  });

  it("does not count a path that matched no route at all", async () => {
    // Nest answers an unrouted request before any interceptor runs, so these never reach the
    // counter. That is the honest behaviour and an acceptable one: a scanner probing random URLs
    // is exactly the traffic not worth spending Redis cardinality on. Every 4xx and 5xx on a
    // *real* endpoint is counted -- see the test above.
    await request(app.getHttpServer()).get("/no/such/route").expect(404);
    await settle();

    expect(redis.increments).toHaveLength(0);
  });
});
