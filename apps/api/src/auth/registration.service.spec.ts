import { createHash } from "crypto";
import { RegistrationService } from "./registration.service";

jest.mock("argon2", () => ({ hash: jest.fn().mockResolvedValue("hashed") }));

const sha = (code: string) => createHash("sha256").update(code).digest("hex");

function setup() {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "u1", role: "CUSTOMER", ...data })),
    },
    pendingRegistration: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const email = { sendTemplate: jest.fn().mockResolvedValue(undefined) };
  const referrals = {
    generateUsername: jest.fn().mockResolvedValue("1001"),
    recordReferral: jest.fn().mockResolvedValue(undefined),
  };
  const auth = { startSession: jest.fn().mockResolvedValue({ accessToken: "a", refreshToken: "r", user: {} }) };
  const service = new RegistrationService(prisma as never, email as never, referrals as never, auth as never);
  return { service, prisma, email, referrals, auth };
}

const pending = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  email: "new@example.com",
  passwordHash: "hashed",
  fullName: "Aygul",
  locale: "tkm",
  attribution: null,
  codeHash: sha("123456"),
  expiresAt: new Date(Date.now() + 60_000),
  attempts: 0,
  ...over,
});

describe("RegistrationService.request", () => {
  it("creates no account yet: stores a pending sign-up and mails the code", async () => {
    const { service, prisma, email } = setup();

    await expect(
      service.request({ email: "new@example.com", password: "password123", fullName: "Aygul Hanym", locale: "tkm" }),
    ).resolves.toEqual({ email: "new@example.com", expiresInMinutes: 15 });

    expect(prisma.user.create).not.toHaveBeenCalled();
    const created = prisma.pendingRegistration.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ email: "new@example.com", passwordHash: "hashed", fullName: "Aygul Hanym", locale: "tkm" });
    // The mailed code is the one whose hash was stored.
    const mailed = email.sendTemplate.mock.calls[0];
    expect(mailed[0]).toBe("AUTH_EMAIL_VERIFICATION");
    expect(mailed[1]).toMatchObject({ toEmail: "new@example.com", variables: { user: { firstName: "Aygul" } } });
    expect(created.codeHash).toBe(sha(mailed[1].variables.otp.code));
  });

  it("refuses an address that already has an account", async () => {
    const { service, prisma, email } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: "existing" });

    await expect(service.request({ email: "taken@example.com", password: "password123" })).rejects.toThrow(
      "EMAIL_ALREADY_REGISTERED",
    );
    expect(email.sendTemplate).not.toHaveBeenCalled();
  });

  it("will not resend within a minute, so the form cannot be used to flood an inbox", async () => {
    const { service, prisma, email } = setup();
    prisma.pendingRegistration.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 10_000) });

    await expect(service.request({ email: "new@example.com", password: "password123" })).rejects.toThrow(
      "CODE_RECENTLY_SENT",
    );
    expect(email.sendTemplate).not.toHaveBeenCalled();
  });
});

describe("RegistrationService.confirm", () => {
  it("creates a verified account from the right code and signs it in", async () => {
    const { service, prisma, auth } = setup();
    prisma.pendingRegistration.findFirst.mockResolvedValue(pending());

    await service.confirm({ email: "new@example.com", code: "123456" });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "new@example.com",
        emailVerified: true,
        passwordHash: "hashed",
        fullName: "Aygul",
        username: "1001",
        locale: "tkm",
      }),
    });
    expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty("phone");
    expect(auth.startSession).toHaveBeenCalled();
  });

  it("counts a wrong code against the pending sign-up and creates nothing", async () => {
    const { service, prisma } = setup();
    prisma.pendingRegistration.findFirst.mockResolvedValue(pending());

    await expect(service.confirm({ email: "new@example.com", code: "000000" })).rejects.toThrow("INVALID_CODE");
    expect(prisma.pendingRegistration.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { attempts: { increment: 1 } },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects an expired code and a burned one", async () => {
    const { service, prisma } = setup();
    prisma.pendingRegistration.findFirst.mockResolvedValueOnce(pending({ expiresAt: new Date(Date.now() - 1) }));
    await expect(service.confirm({ email: "new@example.com", code: "123456" })).rejects.toThrow("CODE_EXPIRED");

    prisma.pendingRegistration.findFirst.mockResolvedValueOnce(pending({ attempts: 5 }));
    await expect(service.confirm({ email: "new@example.com", code: "123456" })).rejects.toThrow("TOO_MANY_CODE_ATTEMPTS");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("creates one account when two confirms race on the same code", async () => {
    const { service, prisma } = setup();
    prisma.pendingRegistration.findFirst.mockResolvedValue(pending());
    prisma.pendingRegistration.updateMany.mockResolvedValue({ count: 0 }); // the other request claimed it

    await expect(service.confirm({ email: "new@example.com", code: "123456" })).rejects.toThrow(
      "NO_PENDING_REGISTRATION",
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("applies the referral captured at sign-up, and a bad code never blocks the account", async () => {
    const { service, prisma, referrals, auth } = setup();
    prisma.pendingRegistration.findFirst.mockResolvedValue(
      pending({ attribution: { referredByUsername: "friend", utmSource: "instagram" } }),
    );
    referrals.recordReferral.mockRejectedValue(new Error("unknown code"));

    await service.confirm({ email: "new@example.com", code: "123456" });

    expect(referrals.recordReferral).toHaveBeenCalledWith("u1", "friend", {
      utmSource: "instagram",
      utmMedium: undefined,
      utmCampaign: undefined,
      referrerUrl: undefined,
    });
    expect(auth.startSession).toHaveBeenCalled();
  });
});
