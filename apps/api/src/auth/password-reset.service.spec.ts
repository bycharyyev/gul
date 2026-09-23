import { PasswordResetService } from "./password-reset.service";

jest.mock("argon2", () => ({ hash: jest.fn().mockResolvedValue("hashed") }));

const VERIFIED_USER = {
  id: "u1",
  fullName: "Aman Amanov",
  locale: "ru",
  emailVerified: true,
  isBlocked: false,
};

function makePrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(VERIFIED_USER), update: jest.fn() },
    passwordReset: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn(),
    ...overrides,
  };
  if (!(overrides as { $transaction?: unknown }).$transaction) {
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
  }
  return prisma;
}

function makeEmail() {
  return { sendTemplate: jest.fn().mockResolvedValue(undefined) };
}

describe("PasswordResetService", () => {
  describe("not leaking which addresses are registered", () => {
    /**
     * This endpoint is unauthenticated, so any observable difference between "account exists"
     * and "it doesn't" turns it into a membership oracle -- and for a top-up service, confirming
     * someone is a customer is itself a disclosure.
     */
    it("answers identically for an unknown address", async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      const email = makeEmail();
      const service = new PasswordResetService(prisma as never, email as never);

      const known = await new PasswordResetService(makePrisma() as never, makeEmail() as never).request(
        "real@example.com",
      );
      const unknown = await service.request("nobody@example.com");

      expect(unknown).toEqual(known);
      expect(email.sendTemplate).not.toHaveBeenCalled();
    });

    it("answers identically for an unverified address, and sends nothing", async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ ...VERIFIED_USER, emailVerified: false });
      const email = makeEmail();
      const service = new PasswordResetService(prisma as never, email as never);

      expect(await service.request("unverified@example.com")).toEqual({ sent: true, expiresInMinutes: 15 });
      // An unverified address is not proof of control -- it must not be a route into the account.
      expect(email.sendTemplate).not.toHaveBeenCalled();
    });

    it("answers identically for a blocked account", async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ ...VERIFIED_USER, isBlocked: true });
      const email = makeEmail();
      const service = new PasswordResetService(prisma as never, email as never);

      expect(await service.request("blocked@example.com")).toEqual({ sent: true, expiresInMinutes: 15 });
      expect(email.sendTemplate).not.toHaveBeenCalled();
    });

    it("answers identically when rate-limited, rather than admitting the limit", async () => {
      const prisma = makePrisma();
      prisma.passwordReset.findFirst.mockResolvedValue({ createdAt: new Date() }); // inside cooldown
      const email = makeEmail();
      const service = new PasswordResetService(prisma as never, email as never);

      expect(await service.request("real@example.com")).toEqual({ sent: true, expiresInMinutes: 15 });
      expect(email.sendTemplate).not.toHaveBeenCalled();
    });
  });

  describe("issuing a code", () => {
    it("sends AUTH_PASSWORD_RESET and stores only a hash", async () => {
      const prisma = makePrisma();
      const email = makeEmail();
      const service = new PasswordResetService(prisma as never, email as never);

      await service.request("real@example.com");

      expect(email.sendTemplate).toHaveBeenCalledWith("AUTH_PASSWORD_RESET", expect.anything());
      const stored = prisma.passwordReset.create.mock.calls[0][0].data;
      const sentCode = email.sendTemplate.mock.calls[0][1].variables.otp.code;
      expect(sentCode).toMatch(/^\d{6}$/);
      // The plaintext code must never reach the database.
      expect(stored.codeHash).not.toBe(sentCode);
      expect(stored.codeHash).toHaveLength(64);
    });

    it("voids any earlier outstanding code, so only one is live at a time", async () => {
      const prisma = makePrisma();
      const service = new PasswordResetService(prisma as never, makeEmail() as never);

      await service.request("real@example.com");

      expect(prisma.passwordReset.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1", consumedAt: null } }),
      );
    });
  });

  describe("confirming", () => {
    const hashOf = (code: string) =>
      require("crypto").createHash("sha256").update(code).digest("hex");

    function pending(overrides: Record<string, unknown> = {}) {
      return {
        id: "pr1",
        codeHash: hashOf("123456"),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        ...overrides,
      };
    }

    it("rejects a wrong code and counts the attempt", async () => {
      const prisma = makePrisma();
      prisma.passwordReset.findFirst.mockResolvedValue(pending());
      const service = new PasswordResetService(prisma as never, makeEmail() as never);

      await expect(service.confirm("real@example.com", "000000", "newpassword")).rejects.toThrow("Неверный код");
      expect(prisma.passwordReset.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: { increment: 1 } } }),
      );
    });

    it("rejects an expired code", async () => {
      const prisma = makePrisma();
      prisma.passwordReset.findFirst.mockResolvedValue(pending({ expiresAt: new Date(Date.now() - 1000) }));
      const service = new PasswordResetService(prisma as never, makeEmail() as never);

      await expect(service.confirm("real@example.com", "123456", "newpassword")).rejects.toThrow(/истёк/);
    });

    it("stops accepting guesses once attempts are exhausted", async () => {
      const prisma = makePrisma();
      prisma.passwordReset.findFirst.mockResolvedValue(pending({ attempts: 5 }));
      const service = new PasswordResetService(prisma as never, makeEmail() as never);

      // Even the correct code must not work -- otherwise the cap only slows guessing down.
      await expect(service.confirm("real@example.com", "123456", "newpassword")).rejects.toThrow(/попыток/);
    });

    it("sets the password and revokes every session", async () => {
      const prisma = makePrisma();
      prisma.passwordReset.findFirst.mockResolvedValue(pending());
      const service = new PasswordResetService(prisma as never, makeEmail() as never);

      expect(await service.confirm("real@example.com", "123456", "newpassword")).toEqual({ reset: true });

      // A reset is the one moment where the old password must be assumed compromised; leaving
      // refresh tokens alive would preserve the attacker's access.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1", revokedAt: null } }),
      );
    });

    it("still completes the reset when the notification email fails", async () => {
      const prisma = makePrisma();
      prisma.passwordReset.findFirst.mockResolvedValue(pending());
      const email = makeEmail();
      email.sendTemplate.mockRejectedValue(new Error("smtp down"));
      const service = new PasswordResetService(prisma as never, email as never);

      await expect(service.confirm("real@example.com", "123456", "newpassword")).resolves.toEqual({ reset: true });
    });

    it("atomically limits a burst of concurrent wrong guesses to five attempts", async () => {
      const prisma = makePrisma();
      prisma.passwordReset.findFirst.mockResolvedValue(pending());
      let attempts = 0;
      prisma.passwordReset.updateMany.mockImplementation(async ({ data }: { data: { attempts?: unknown } }) => {
        if (!data.attempts || attempts >= 5) return { count: 0 };
        attempts++;
        return { count: 1 };
      });
      const service = new PasswordResetService(prisma as never, makeEmail() as never);

      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, index) => service.confirm("real@example.com", String(index).padStart(6, "0"), "newpassword")),
      );

      expect(attempts).toBe(5);
      expect(results.filter((result) => result.status === "rejected" && result.reason.message === "Неверный код")).toHaveLength(5);
      expect(results.filter((result) => result.status === "rejected" && /попыток/.test(result.reason.message))).toHaveLength(7);
    });

    it("allows only one concurrent consumer of the same valid code", async () => {
      const prisma = makePrisma();
      prisma.passwordReset.findFirst.mockResolvedValue(pending());
      let consumed = false;
      prisma.passwordReset.updateMany.mockImplementation(async ({ data }: { data: { consumedAt?: Date } }) => {
        if (!data.consumedAt || consumed) return { count: 0 };
        consumed = true;
        return { count: 1 };
      });
      const service = new PasswordResetService(prisma as never, makeEmail() as never);

      const results = await Promise.allSettled([
        service.confirm("real@example.com", "123456", "first-password"),
        service.confirm("real@example.com", "123456", "second-password"),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    });
  });
});
