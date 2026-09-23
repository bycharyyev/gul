import { Controller, Get, Module, Req } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Request } from "express";
import request from "supertest";

@Controller("probe")
class ProbeController {
  @Get()
  who(@Req() req: Request) {
    return { ip: req.ip };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 3 }])],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ProbeModule {}

/**
 * The rate limiter has to be able to tell one visitor from all of them.
 *
 * Production runs behind nginx on the loopback, so without `trust proxy` Express reports the
 * socket peer -- 127.0.0.1 -- as `req.ip` for every request on earth. ThrottlerGuard keys on
 * `req.ip`, so the whole internet shared one bucket: 120 requests a minute for the entire site,
 * and 10 logins. Measured against production before the fix: 130 requests each claiming a
 * different client address, 118 answered and the rest rejected.
 *
 * These tests are about that identity, not about the numbers -- the limit here is 3 purely so a
 * shared bucket overflows within a handful of requests.
 */
describe("trust proxy", () => {
  async function boot(trustProxy: number | boolean | string | null) {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    if (trustProxy !== null) app.set("trust proxy", trustProxy);
    await app.init();
    return app;
  }

  it("tells two clients apart, so one busy visitor cannot exhaust everyone's budget", async () => {
    const app = await boot(1);
    const server = app.getHttpServer();

    // Spend the whole bucket as one client...
    for (let i = 0; i < 3; i++) {
      await request(server).get("/probe").set("X-Forwarded-For", "203.0.113.1").expect(200);
    }
    await request(server).get("/probe").set("X-Forwarded-For", "203.0.113.1").expect(429);

    // ...and a different client still gets served.
    await request(server).get("/probe").set("X-Forwarded-For", "198.51.100.7").expect(200);

    await app.close();
  });

  it("without it, unrelated visitors share a single budget", async () => {
    // The state this shipped in. Kept as a test so the failure is legible if the setting is ever
    // dropped: every address, however distinct, spends from the same allowance.
    const app = await boot(null);
    const server = app.getHttpServer();

    for (let i = 0; i < 3; i++) {
      await request(server).get("/probe").set("X-Forwarded-For", `203.0.113.${i + 1}`).expect(200);
    }
    await request(server).get("/probe").set("X-Forwarded-For", "198.51.100.9").expect(429);

    await app.close();
  });

  it("takes the address nginx saw, not one the client prefilled", async () => {
    // nginx appends the real peer via $proxy_add_x_forwarded_for, so the last entry is the only
    // trustworthy one. `trust proxy: 1` reads exactly that. Trusting `true` would take the
    // leftmost instead and let anyone choose their own rate-limit identity -- and, with it, spend
    // somebody else's budget or evade their own.
    const app = await boot(1);

    const res = await request(app.getHttpServer())
      .get("/probe")
      .set("X-Forwarded-For", "1.2.3.4, 203.0.113.5")
      .expect(200);

    expect(res.body.ip).toBe("203.0.113.5");

    await app.close();
  });
});
