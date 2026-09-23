import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configureBodyParsing } from "../common/body-parsing";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

describe("payment webhook HTTP boundary", () => {
  let app: NestExpressApplication;
  const receiveWebhook = jest.fn().mockResolvedValue({ received: true, duplicate: false, processed: true });

  beforeEach(async () => {
    receiveWebhook.mockClear();
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: { receiveWebhook } }],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureBodyParsing(app);
    app.setGlobalPrefix("api");
    await app.init();
  });

  afterEach(async () => app.close());

  it("passes the exact request bytes to signature verification", async () => {
    const body = '{ "event" : "evt-1", "spacing" : true }';
    await request(app.getHttpServer())
      .post("/api/payments/webhooks/gateway")
      .set("content-type", "application/json")
      .set("x-signature", "signed")
      .send(body)
      .expect(200);

    expect(receiveWebhook).toHaveBeenCalledTimes(1);
    expect(receiveWebhook.mock.calls[0][0]).toBe("gateway");
    expect(receiveWebhook.mock.calls[0][1]).toEqual(Buffer.from(body));
    expect(receiveWebhook.mock.calls[0][2]["x-signature"]).toBe("signed");
  });

  it("rejects oversized webhook bodies before application processing", async () => {
    await request(app.getHttpServer())
      .post("/api/payments/webhooks/gateway")
      .set("content-type", "application/json")
      .send(JSON.stringify({ payload: "x".repeat(300 * 1024) }))
      .expect(413);

    expect(receiveWebhook).not.toHaveBeenCalled();
  });
});
