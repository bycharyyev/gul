import { Logger } from "@nestjs/common";
import { MockOperatorGateway } from "./mock-operator.gateway";
import { UnconfiguredOperatorGateway } from "./unconfigured-operator.gateway";
import { HttpOperatorGateway } from "./http-operator.gateway";

const logger = new Logger("OperatorGateway");

/**
 * Picks the top-up fulfilment adapter. Fails closed: with nothing configured, orders settle as
 * UNKNOWN and stay in PROCESSING for a human rather than being reported as delivered.
 *
 * `mock` reports every order COMPLETED without contacting any operator. That is a defensible
 * setting only while the platform has no real customers -- true today, and it will stop being
 * true without this file changing. So production additionally demands
 * TOPUP_ALLOW_MOCK_IN_PRODUCTION=true: an explicit, greppable line in the server .env that is
 * meant to be deleted the day a real operator is wired up. Every start logs which one is live.
 */
export function selectOperatorGateway(
  mock: MockOperatorGateway,
  unconfigured: UnconfiguredOperatorGateway,
): MockOperatorGateway | UnconfiguredOperatorGateway | HttpOperatorGateway {
  const selected = process.env.TOPUP_GATEWAY?.trim().toLowerCase();

  if (selected === "http") {
    logger.log("Top-up fulfilment: http bridge (TOPUP_HTTP_BASE_URL)");
    return new HttpOperatorGateway();
  }

  if (selected === "mock") {
    const isProduction = process.env.NODE_ENV === "production";
    if (!isProduction || process.env.TOPUP_ALLOW_MOCK_IN_PRODUCTION === "true") {
      logger.warn(
        isProduction
          ? "Top-up fulfilment: MOCK, in production, via TOPUP_ALLOW_MOCK_IN_PRODUCTION. Orders are marked COMPLETED without any operator being contacted. Remove this before real customers."
          : "Top-up fulfilment: mock (non-production)",
      );
      return mock;
    }
    logger.error(
      'TOPUP_GATEWAY="mock" is ignored in production without TOPUP_ALLOW_MOCK_IN_PRODUCTION=true -- falling back to fail-closed. Paid orders will stay in PROCESSING.',
    );
  }

  logger.warn(
    "Top-up fulfilment: NOT CONFIGURED (fail-closed). Paid orders will stay in PROCESSING until TOPUP_GATEWAY is set; the orders-stuck-sent alert fires after 30 minutes.",
  );
  return unconfigured;
}
