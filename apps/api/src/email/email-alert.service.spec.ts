import { EmailAlertService } from "./email-alert.service";

function healthy(overrides: Record<string, unknown> = {}) {
  return {
    smtpConfigured: true,
    smtpReachable: true,
    smtpHost: "mail.hosting.reg.ru",
    smtpError: null,
    quota: { used: 10, limit: 3000, remaining: 2990, usedPercent: 0, resetsAt: new Date() },
    queues: [
      { name: "critical", waiting: 0, active: 0, delayed: 0, failed: 0 },
      { name: "transactional", waiting: 0, active: 0, delayed: 0, failed: 0 },
      { name: "marketing", waiting: 0, active: 0, delayed: 0, failed: 0 },
    ],
    ...overrides,
  };
}

function build(
  health: Record<string, unknown>,
  opts: {
    claimed?: boolean;
    stuckOrders?: number;
    stalePayments?: number;
    staleWebhookEvents?: number;
    ledgerMismatches?: unknown[];
    ledgerError?: Error;
  } = {},
) {
  const redis = { set: jest.fn().mockResolvedValue(opts.claimed === false ? null : "OK") };
  const email = {
    health: jest.fn().mockResolvedValue(health),
    sendAlert: jest.fn().mockResolvedValue(undefined),
  };
  // Defaults to none: every existing case here is about mail, and a stub that invented stuck
  // orders would add a second alert to assertions that count them.
  const prisma = {
    order: { count: jest.fn().mockResolvedValue(opts.stuckOrders ?? 0) },
    payment: {
      count: jest.fn().mockResolvedValue(opts.stalePayments ?? 0),
      findFirst: jest.fn().mockResolvedValue(
        opts.stalePayments ? { updatedAt: new Date("2026-09-06T00:00:00.000Z") } : null,
      ),
    },
    paymentEvent: { count: jest.fn().mockResolvedValue(opts.staleWebhookEvents ?? 0) },
  };
  const sellerLedger = {
    reconcile: opts.ledgerError
      ? jest.fn().mockRejectedValue(opts.ledgerError)
      : jest.fn().mockResolvedValue(opts.ledgerMismatches ?? []),
  };
  const service = new EmailAlertService(
    redis as never,
    {} as never,
    email as never,
    prisma as never,
    sellerLedger as never,
  );
  return { service, redis, email, prisma, sellerLedger };
}

describe("EmailAlertService", () => {
  const originalRecipient = process.env.ALERT_EMAIL;

  beforeEach(() => {
    process.env.ALERT_EMAIL = "ops@example.com";
  });

  afterEach(() => {
    if (originalRecipient === undefined) delete process.env.ALERT_EMAIL;
    else process.env.ALERT_EMAIL = originalRecipient;
  });

  describe("what is worth alerting about", () => {
    it("stays silent when everything is fine", async () => {
      const { service, email } = build(healthy());
      expect(await service.collect()).toEqual([]);
      expect(await service.run()).toBe(0);
      expect(email.sendAlert).not.toHaveBeenCalled();
    });

    it("alerts when SMTP is configured but unreachable", async () => {
      const { service } = build(healthy({ smtpReachable: false, smtpError: "535 Invalid login" }));
      const alerts = await service.collect();
      expect(alerts.map((a) => a.key)).toContain("smtp-unreachable");
      expect(alerts[0].body).toContain("535 Invalid login");
    });

    it("alerts when SMTP is not configured at all", async () => {
      const { service } = build(healthy({ smtpConfigured: false, smtpReachable: null }));
      expect((await service.collect()).map((a) => a.key)).toContain("smtp-unconfigured");
    });

    it("reports only the highest quota threshold crossed, not one alert per threshold", async () => {
      const { service } = build(
        healthy({ quota: { used: 2880, limit: 3000, remaining: 120, usedPercent: 96, resetsAt: new Date() } }),
      );
      const keys = (await service.collect()).map((a) => a.key);
      expect(keys).toContain("quota-95");
      expect(keys).not.toContain("quota-70");
      expect(keys).not.toContain("quota-85");
    });

    it("does not alert below the lowest threshold", async () => {
      const { service } = build(
        healthy({ quota: { used: 1800, limit: 3000, remaining: 1200, usedPercent: 60, resetsAt: new Date() } }),
      );
      expect((await service.collect()).map((a) => a.key)).not.toContain("quota-70");
    });

    it("alerts on a queue with a backlog of failed jobs", async () => {
      const { service } = build(
        healthy({
          queues: [
            { name: "critical", failed: 0 },
            { name: "marketing", failed: 25 },
          ],
        }),
      );
      const keys = (await service.collect()).map((a) => a.key);
      expect(keys).toContain("queue-failed-marketing");
      expect(keys).not.toContain("queue-failed-critical");
    });
  });

  describe("deduplication", () => {
    it("claims with SET NX so only one host sends, and only once per window", async () => {
      const { service, redis } = build(healthy({ smtpReachable: false }));
      await service.run();
      expect(redis.set).toHaveBeenCalledWith(
        "email:alert:smtp-unreachable",
        "1",
        "EX",
        expect.any(Number),
        "NX",
      );
    });

    it("sends nothing when the claim is already held", async () => {
      const { service, email } = build(healthy({ smtpReachable: false }), { claimed: false });
      expect(await service.run()).toBe(0);
      expect(email.sendAlert).not.toHaveBeenCalled();
    });

    it("stays quiet rather than mailing on every poll when Redis is unreachable", async () => {
      const { service, email } = build(healthy({ smtpReachable: false }));
      // Same outage would otherwise repeat the alert every five minutes forever.
      const svc = service as unknown as { redis: { set: jest.Mock } };
      svc.redis.set.mockRejectedValue(new Error("ECONNREFUSED"));
      expect(await service.run()).toBe(0);
      expect(email.sendAlert).not.toHaveBeenCalled();
    });

    it("suppresses a quota alert only until the quota resets", async () => {
      const { service } = build(
        healthy({ quota: { used: 2880, limit: 3000, remaining: 120, usedPercent: 96, resetsAt: new Date() } }),
      );
      const quotaAlert = (await service.collect()).find((a) => a.key === "quota-95")!;
      // Never longer than a day, since the counter itself rolls at UTC midnight.
      expect(quotaAlert.ttlSeconds).toBeGreaterThan(0);
      expect(quotaAlert.ttlSeconds).toBeLessThanOrEqual(24 * 60 * 60);
    });
  });

  describe("delivery", () => {
    it("logs but does not mail when no recipient is configured", async () => {
      delete process.env.ALERT_EMAIL;
      const { service, email } = build(healthy({ smtpReachable: false }));
      expect(await service.run()).toBe(0);
      expect(email.sendAlert).not.toHaveBeenCalled();
    });

    it("mails the configured recipient", async () => {
      const { service, email } = build(healthy({ smtpReachable: false }));
      expect(await service.run()).toBe(1);
      expect(email.sendAlert).toHaveBeenCalledWith(
        "ops@example.com",
        expect.stringContaining("SMTP"),
        expect.any(String),
      );
    });

    it("a failure to deliver one alert does not stop the others", async () => {
      const { service, email } = build(
        healthy({
          smtpReachable: false,
          quota: { used: 2880, limit: 3000, remaining: 120, usedPercent: 96, resetsAt: new Date() },
        }),
      );
      email.sendAlert.mockRejectedValueOnce(new Error("cannot send")).mockResolvedValueOnce(undefined);

      expect(await service.run()).toBe(1);
      expect(email.sendAlert).toHaveBeenCalledTimes(2);
    });
  });

  describe("stuck orders", () => {
    it("reports orders whose top-up went out and never came back", async () => {
      // These are the ones nothing may retry: the request may already have reached the
      // operator. The sweeper recovers every other stranded order silently, so anything that
      // reaches this alert genuinely needs a person.
      const { service, email } = build(healthy(), { stuckOrders: 3 });

      const alerts = await service.collect();
      const stuck = alerts.find((a) => a.key === "orders-stuck-sent");
      expect(stuck).toBeDefined();
      expect(stuck!.subject).toContain("3");
      expect(stuck!.body).toContain("вручную");
      expect(email.sendAlert).not.toHaveBeenCalled();
    });

    it("says nothing when every paid order is moving", async () => {
      const { service } = build(healthy(), { stuckOrders: 0 });

      const alerts = await service.collect();
      expect(alerts.find((a) => a.key === "orders-stuck-sent")).toBeUndefined();
    });
  });

  describe("seller ledger reconciliation", () => {
    it("alerts with a bounded mismatch sample and never repairs balances", async () => {
      const { service, sellerLedger } = build(healthy(), {
        ledgerMismatches: [
          { sellerId: "s1", handle: "flowers", cachedBalance: 125, ledgerBalance: 100, difference: 25 },
        ],
      });

      const alert = (await service.collect()).find((item) => item.key === "seller-ledger-mismatch");
      expect(alert?.subject).toContain("1");
      expect(alert?.body).toContain("@flowers");
      expect(alert?.body).toContain("difference=25.00 TMT");
      expect(sellerLedger.reconcile).toHaveBeenCalledTimes(1);
    });

    it("alerts when reconciliation itself cannot run", async () => {
      const { service } = build(healthy(), { ledgerError: new Error("database unavailable") });

      expect((await service.collect()).map((item) => item.key)).toContain(
        "seller-ledger-reconciliation-unavailable",
      );
    });
  });

  describe("payment reconciliation", () => {
    it("alerts on unresolved payment attempts older than the grace period", async () => {
      const { service } = build(healthy(), { stalePayments: 2 });

      const alert = (await service.collect()).find((item) => item.key === "payments-require-reconciliation");
      expect(alert?.subject).toContain("2");
      expect(alert?.body).toContain("GET /payments/reconciliation");
    });

    it("alerts when verified webhook inbox rows remain unprocessed", async () => {
      const { service } = build(healthy(), { staleWebhookEvents: 3 });

      const alert = (await service.collect()).find((item) => item.key === "payment-webhook-inbox-stuck");
      expect(alert?.subject).toContain("3");
      expect(alert?.body).toContain("PaymentEvent.processingError");
    });
  });
});
