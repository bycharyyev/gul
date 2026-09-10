import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { HealthController } from "./health.controller";
import { PrismaService } from "../prisma/prisma.service";
import { TOPUP_QUEUE } from "../queue/queue.module";

describe("HealthController (HTTP)", () => {
  let app: INestApplication;
  const prisma = { $queryRaw: jest.fn() };
  const redisClient = { ping: jest.fn() };
  const topupQueue = { client: Promise.resolve(redisClient) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: TOPUP_QUEUE, useValue: topupQueue },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    prisma.$queryRaw.mockReset();
    redisClient.ping.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it("/health/live returns 200 with no dependency checks", async () => {
    const res = await request(app.getHttpServer()).get("/health/live");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns 200 with status ok when the database and redis both respond", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    redisClient.ping.mockResolvedValue("PONG");

    const res = await request(app.getHttpServer()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("returns 503 when the database is unreachable", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error("connection refused"));
    redisClient.ping.mockResolvedValue("PONG");

    const res = await request(app.getHttpServer()).get("/health");

    expect(res.status).toBe(503);
  });

  it("returns 503 when redis is unreachable", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    redisClient.ping.mockRejectedValue(new Error("connection refused"));

    const res = await request(app.getHttpServer()).get("/health/ready");

    expect(res.status).toBe(503);
  });
});
