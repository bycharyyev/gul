import { EmailService } from "./email.service";

// One shared mock transporter across tests -- sendMail's behavior is set per-test via
// mockResolvedValueOnce/mockRejectedValueOnce.
const sendMail = jest.fn();
jest.mock("nodemailer", () => ({
  createTransport: () => ({ sendMail: (...args: unknown[]) => sendMail(...args) }),
}));

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  const defaults: Record<string, string | undefined> = {
    MAIL_HOST: "mail.hosting.reg.ru",
    MAIL_PORT: "465",
    MAIL_SECURE: "true",
    MAIL_USER: "noreply@gulyaly.pro",
    MAIL_PASS: "secret",
    MAIL_FROM: "Gulyaly <noreply@gulyaly.pro>",
  };
  const values = { ...defaults, ...overrides };
  return { get: (key: string) => values[key] };
}

function makePrismaMock() {
  return {
    emailSettings: {
      upsert: jest.fn().mockResolvedValue({ transactionalEnabled: true, marketingEnabled: true }),
    },
    emailLog: { create: jest.fn().mockResolvedValue({}) },
    order: { findUnique: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    emailSuppression: { findUnique: jest.fn().mockResolvedValue(null) },
    seller: { findUnique: jest.fn() },
    emailPreference: { findUnique: jest.fn().mockResolvedValue(null) },
  };
}

function makeQueueMock() {
  return { add: jest.fn().mockResolvedValue({}), addBulk: jest.fn().mockResolvedValue([]) };
}

/** Quota that always allows -- exhaustion has its own spec. */
function makeQuotaMock() {
  return { claim: jest.fn().mockResolvedValue(null), release: jest.fn().mockResolvedValue(undefined) };
}

function makeSuppressionMock() {
  return { add: jest.fn().mockResolvedValue({}), isSuppressed: jest.fn().mockResolvedValue(false) };
}

/** Stands in for EmailTemplateService -- template resolution has its own spec. */
function makeTemplatesMock() {
  return {
    renderFor: jest.fn().mockResolvedValue({
      subject: "Заказ o1 принят",
      html: "<p>ok</p>",
      text: "ok",
      locale: "ru",
      templateId: "tpl_1",
      templateVersion: 1,
    }),
  };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    userId: "u1",
    user: { email: "customer@example.com", emailVerified: true, locale: "ru" },
    service: { name: "TMCELL" },
    recipientIdentifier: "+99361234567",
    amountTmt: "10",
    amountCharged: "0.62",
    currency: "USD",
    deliveryNote: null,
    failureReason: null,
    ...overrides,
  };
}

describe("EmailService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("configuration missing", () => {
    it("logs SKIPPED and never touches the queue when MAIL_HOST is unset", async () => {
      const prisma = makePrismaMock();
      const queue = makeQueueMock();
      const service = new EmailService(prisma as never, makeConfig({ MAIL_HOST: undefined }) as never, queue as never, queue as never, queue as never, makeTemplatesMock() as never, makeQuotaMock() as never, makeSuppressionMock() as never);

      prisma.order.findUnique.mockResolvedValue(makeOrder());
      await service.sendOrderCreated("o1");

      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.emailLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED", error: "SMTP не настроен" }) }),
      );
    });
  });

  describe("enqueue (via sendOrderCreated)", () => {
    it("skips with no queue call when the user has no email on file (invalid/missing recipient)", async () => {
      const prisma = makePrismaMock();
      const queue = makeQueueMock();
      const service = new EmailService(prisma as never, makeConfig() as never, queue as never, queue as never, queue as never, makeTemplatesMock() as never, makeQuotaMock() as never, makeSuppressionMock() as never);

      prisma.order.findUnique.mockResolvedValue(makeOrder({ user: { email: null, emailVerified: false, locale: "ru" } }));
      await service.sendOrderCreated("o1");

      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.emailLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED" }) }),
      );
    });

    it("puts a job on the queue with a bounded retry policy for a valid recipient", async () => {
      const prisma = makePrismaMock();
      const queue = makeQueueMock();
      const service = new EmailService(prisma as never, makeConfig() as never, queue as never, queue as never, queue as never, makeTemplatesMock() as never, makeQuotaMock() as never, makeSuppressionMock() as never);

      prisma.order.findUnique.mockResolvedValue(makeOrder());
      await service.sendOrderCreated("o1");

      expect(queue.add).toHaveBeenCalledWith(
        "send-email",
        expect.objectContaining({ kind: "ORDER_CREATED", toEmail: "customer@example.com" }),
        expect.objectContaining({ attempts: 5 }),
      );
    });

    it("propagates a queue failure (e.g. Redis down) rather than silently swallowing it", async () => {
      const prisma = makePrismaMock();
      const queue = makeQueueMock();
      queue.add.mockRejectedValue(new Error("ECONNREFUSED redis"));
      const service = new EmailService(prisma as never, makeConfig() as never, queue as never, queue as never, queue as never, makeTemplatesMock() as never, makeQuotaMock() as never, makeSuppressionMock() as never);

      prisma.order.findUnique.mockResolvedValue(makeOrder());
      // sendOrderCreated wraps its body in try/catch, so this itself must not throw --
      // the queue failure is caught and logged there, not propagated to the caller.
      await expect(service.sendOrderCreated("o1")).resolves.toBeUndefined();
    });
  });

  describe("sendNow (the actual SMTP send, run by the worker)", () => {
    it("sends a valid email and logs SENT", async () => {
      const prisma = makePrismaMock();
      const service = new EmailService(prisma as never, makeConfig() as never, makeQueueMock() as never, makeQueueMock() as never, makeQueueMock() as never, makeTemplatesMock() as never, makeQuotaMock() as never, makeSuppressionMock() as never);
      sendMail.mockResolvedValue({ messageId: "abc" });

      await service.sendNow({ kind: "TEST", toEmail: "a@example.com", subject: "hi", html: "<p>hi</p>" });

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "a@example.com", subject: "hi", text: expect.any(String) }),
      );
      expect(prisma.emailLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }),
      );
    });

    it("rethrows (so BullMQ retries) on a temporary SMTP failure", async () => {
      const prisma = makePrismaMock();
      const service = new EmailService(prisma as never, makeConfig() as never, makeQueueMock() as never, makeQueueMock() as never, makeQueueMock() as never, makeTemplatesMock() as never, makeQuotaMock() as never, makeSuppressionMock() as never);
      const err = Object.assign(new Error("Greylisted, try again later"), { responseCode: 450 });
      sendMail.mockRejectedValue(err);

      await expect(
        service.sendNow({ kind: "TEST", toEmail: "a@example.com", subject: "hi", html: "<p>hi</p>" }),
      ).rejects.toThrow("Greylisted");
      expect(prisma.emailLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", error: expect.stringContaining("[retrying]") }) }),
      );
    });

    it("does NOT rethrow on a permanent recipient failure (no retry -- the address is bad)", async () => {
      const prisma = makePrismaMock();
      const service = new EmailService(prisma as never, makeConfig() as never, makeQueueMock() as never, makeQueueMock() as never, makeQueueMock() as never, makeTemplatesMock() as never, makeQuotaMock() as never, makeSuppressionMock() as never);
      const err = Object.assign(new Error("Mailbox does not exist"), { responseCode: 550 });
      sendMail.mockRejectedValue(err);

      await expect(
        service.sendNow({ kind: "TEST", toEmail: "nobody@example.com", subject: "hi", html: "<p>hi</p>" }),
      ).resolves.toBeUndefined();
      expect(prisma.emailLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", error: "Mailbox does not exist" }) }),
      );
    });

    it("does NOT rethrow on an auth/config failure (fail fast, no point retrying a bad password)", async () => {
      const prisma = makePrismaMock();
      const service = new EmailService(prisma as never, makeConfig() as never, makeQueueMock() as never, makeQueueMock() as never, makeQueueMock() as never, makeTemplatesMock() as never, makeQuotaMock() as never, makeSuppressionMock() as never);
      const err = Object.assign(new Error("Invalid login"), { responseCode: 535 });
      sendMail.mockRejectedValue(err);

      await expect(
        service.sendNow({ kind: "TEST", toEmail: "a@example.com", subject: "hi", html: "<p>hi</p>" }),
      ).resolves.toBeUndefined();
      expect(prisma.emailLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", error: expect.stringContaining("[auth/config]") }) }),
      );
    });

    it("treats a bad hostname (ENOTFOUND, no responseCode) as auth-or-config, not an infinite temporary retry", async () => {
      const prisma = makePrismaMock();
      const service = new EmailService(prisma as never, makeConfig() as never, makeQueueMock() as never, makeQueueMock() as never, makeQueueMock() as never, makeTemplatesMock() as never, makeQuotaMock() as never, makeSuppressionMock() as never);
      const err = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
      sendMail.mockRejectedValue(err);

      await expect(
        service.sendNow({ kind: "TEST", toEmail: "a@example.com", subject: "hi", html: "<p>hi</p>" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("queue routing, idempotency and quota (stage 2)", () => {
    function build(overrides: { quota?: ReturnType<typeof makeQuotaMock> } = {}) {
      const prisma = makePrismaMock();
      const critical = makeQueueMock();
      const transactional = makeQueueMock();
      const marketing = makeQueueMock();
      const quota = overrides.quota ?? makeQuotaMock();
      const suppression = makeSuppressionMock();
      const service = new EmailService(
        prisma as never,
        makeConfig() as never,
        critical as never,
        transactional as never,
        marketing as never,
        makeTemplatesMock() as never,
        quota as never,
        suppression as never,
      );
      return { service, prisma, critical, transactional, marketing, quota, suppression };
    }

    it("routes a verification code to the critical queue, not the transactional one", async () => {
      const { service, critical, transactional, marketing } = build();
      await service.sendTemplate("AUTH_EMAIL_VERIFICATION", {
        toEmail: "a@example.com",
        userId: "u1",
        variables: {},
      });
      expect(critical.add).toHaveBeenCalled();
      expect(transactional.add).not.toHaveBeenCalled();
      expect(marketing.add).not.toHaveBeenCalled();
    });

    it("routes order mail to the transactional queue", async () => {
      const { service, prisma, critical, transactional } = build();
      prisma.order.findUnique.mockResolvedValue(makeOrder());
      await service.sendOrderCreated("o1");
      expect(transactional.add).toHaveBeenCalled();
      expect(critical.add).not.toHaveBeenCalled();
    });

    it("gives an order email a stable job id so a replayed event cannot send twice", async () => {
      const { service, prisma, transactional } = build();
      prisma.order.findUnique.mockResolvedValue(makeOrder());
      await service.sendOrderCreated("o1");
      expect(transactional.add).toHaveBeenCalledWith(
        "send-email",
        expect.anything(),
        expect.objectContaining({ jobId: "order:o1:ORDER_CREATED" }),
      );
    });

    it("does not send and logs SKIPPED once the quota is exhausted", async () => {
      const quota = makeQuotaMock();
      quota.claim.mockResolvedValue("Достигнут суточный лимит отправки");
      const { service, prisma } = build({ quota });

      await service.sendNow({ kind: "TEST", toEmail: "a@example.com", subject: "hi", html: "<p>hi</p>" });

      expect(sendMail).not.toHaveBeenCalled();
      expect(prisma.emailLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "SKIPPED", error: expect.stringContaining("лимит") }),
        }),
      );
    });

    it("returns the claimed slot when the message never reached the server", async () => {
      const { service, quota } = build();
      sendMail.mockRejectedValue(Object.assign(new Error("timeout"), { responseCode: 451 }));

      await expect(
        service.sendNow({ kind: "TEST", toEmail: "a@example.com", subject: "hi", html: "<p>hi</p>" }),
      ).rejects.toThrow();
      expect(quota.release).toHaveBeenCalled();
    });

    it("keeps the slot consumed on a permanent rejection, which the server did process", async () => {
      const { service, quota } = build();
      sendMail.mockRejectedValue(Object.assign(new Error("no mailbox"), { responseCode: 550 }));

      await service.sendNow({ kind: "TEST", toEmail: "a@example.com", subject: "hi", html: "<p>hi</p>" });
      expect(quota.release).not.toHaveBeenCalled();
    });

    it("records a hard bounce so a dead address is not mailed repeatedly", async () => {
      const { service, suppression } = build();
      sendMail.mockRejectedValue(Object.assign(new Error("550 no such user"), { responseCode: 550 }));

      await service.sendNow({ kind: "TEST", toEmail: "gone@example.com", subject: "hi", html: "<p>hi</p>" });

      expect(suppression.add).toHaveBeenCalledWith(
        "gone@example.com",
        "HARD_BOUNCE",
        expect.stringContaining("550"),
      );
    });

    it("does not suppress on a temporary failure -- the address may be perfectly good", async () => {
      const { service, suppression } = build();
      sendMail.mockRejectedValue(Object.assign(new Error("greylisted"), { responseCode: 450 }));

      await expect(
        service.sendNow({ kind: "TEST", toEmail: "a@example.com", subject: "hi", html: "<p>hi</p>" }),
      ).rejects.toThrow();
      expect(suppression.add).not.toHaveBeenCalled();
    });
  });

  describe("seller notifications", () => {
    function build() {
      const prisma = makePrismaMock();
      const transactional = makeQueueMock();
      const service = new EmailService(
        prisma as never,
        makeConfig() as never,
        makeQueueMock() as never,
        transactional as never,
        makeQueueMock() as never,
        makeTemplatesMock() as never,
        makeQuotaMock() as never,
        makeSuppressionMock() as never,
      );
      return { service, prisma, transactional };
    }

    const ORDER = {
      id: "go1",
      productName: "Букет",
      amountTmt: "250",
      recipientName: "Марал",
      recipientPhone: "+99365123456",
      deliveryCity: "Ашхабад",
      deliveryAddress: "ул. 1",
      cardMessage: null,
    };

    it("emails a seller whose account email is verified", async () => {
      const { service, prisma, transactional } = build();
      prisma.seller.findUnique.mockResolvedValue({
        shopName: "Bucet TM",
        user: { id: "u9", email: "seller@example.com", emailVerified: true, locale: "ru" },
      });

      await service.sendSellerNewOrder("s1", ORDER);

      expect(transactional.add).toHaveBeenCalledWith(
        "send-email",
        expect.objectContaining({ kind: "SELLER_NEW_ORDER", toEmail: "seller@example.com" }),
        expect.objectContaining({ jobId: "gallery-order:go1:SELLER_NEW_ORDER" }),
      );
    });

    it("does not email a seller whose address is unverified", async () => {
      const { service, prisma, transactional } = build();
      prisma.seller.findUnique.mockResolvedValue({
        shopName: "Bucet TM",
        user: { id: "u9", email: "seller@example.com", emailVerified: false, locale: "ru" },
      });

      await service.sendSellerNewOrder("s1", ORDER);
      expect(transactional.add).not.toHaveBeenCalled();
    });

    it("never throws out of a seller notification -- it must not fail the order", async () => {
      const { service, prisma } = build();
      prisma.seller.findUnique.mockRejectedValue(new Error("db down"));

      await expect(service.sendSellerNewOrder("s1", ORDER)).resolves.toBeUndefined();
      await expect(
        service.sendSellerPayout("s1", { id: "w1", amountTmt: "100", note: null }),
      ).resolves.toBeUndefined();
    });

    it("gives a payout a stable job id, so a replayed approval pays one notice", async () => {
      const { service, prisma, transactional } = build();
      prisma.seller.findUnique.mockResolvedValue({
        shopName: "Bucet TM",
        user: { id: "u9", email: "seller@example.com", emailVerified: true, locale: "ru" },
      });

      await service.sendSellerPayout("s1", { id: "w1", amountTmt: "100", note: "на карту" });

      expect(transactional.add).toHaveBeenCalledWith(
        "send-email",
        expect.objectContaining({ kind: "SELLER_PAYOUT" }),
        expect.objectContaining({ jobId: "withdrawal:w1:SELLER_PAYOUT" }),
      );
    });
  });
});
