import express from "express";
import type { NestExpressApplication } from "@nestjs/platform-express";

export const PAYMENT_WEBHOOK_BODY_LIMIT = "256kb";

export function configureBodyParsing(app: NestExpressApplication) {
  app.use(
    "/api/payments/webhooks",
    express.raw({ type: () => true, limit: PAYMENT_WEBHOOK_BODY_LIMIT }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
}
