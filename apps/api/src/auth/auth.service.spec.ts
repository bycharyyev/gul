import { ConflictException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";

jest.mock("argon2", () => ({
  hash: jest.fn().mockResolvedValue("hashed"),
  verify: jest.fn().mockResolvedValue(true),
}));

function makePrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function makeJwtMock() {
  return { sign: jest.fn().mockReturnValue("signed-jwt") };
}

function makeReferralsMock() {
  return {
    generateUsername: jest.fn().mockResolvedValue("autogenusr"),
    recordReferral: jest.fn().mockResolvedValue(undefined),
  };
}

/** Allows by default: these cases are about registration and sign-in, not about being throttled. */
function makeLoginAttemptsMock() {
  return {
    check: jest.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    recordFailure: jest.fn().mockResolvedValue(0),
    clear: jest.fn().mockResolvedValue(undefined),
  };
}

describe("AuthService", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let jwt: ReturnType<typeof makeJwtMock>;
  let referrals: ReturnType<typeof makeReferralsMock>;
  let loginAttempts: ReturnType<typeof makeLoginAttemptsMock>;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    jwt = makeJwtMock();
    referrals = makeReferralsMock();
    loginAttempts = makeLoginAttemptsMock();
    service = new AuthService(prisma as never, jwt as never, referrals as never, loginAttempts as never);
  });

  describe("refresh", () => {
    const user = { id: "u1", role: "CUSTOMER" };
    const future = new Date(Date.now() + 86_400_000);

    it("rotates a live token and retires it", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "t1",
        userId: "u1",
        expiresAt: future,
        revokedAt: null,
        graceUsedAt: null,
        user,
      });

      await expect(service.refresh("plain")).resolves.toMatchObject({
        accessToken: "signed-jwt",
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: "t1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("honours a token consumed moments ago, which is a lost response and not a theft", async () => {
      // The client received the replacement and died before storing it. Refusing here is what
      // signed a live session out permanently.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "t1",
        userId: "u1",
        expiresAt: future,
        revokedAt: new Date(Date.now() - 2_000),
        graceUsedAt: null,
        user,
      });

      await expect(service.refresh("plain")).resolves.toMatchObject({
        accessToken: "signed-jwt",
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: "t1", graceUsedAt: null },
        data: { graceUsedAt: expect.any(Date) },
      });
    });

    it("refuses a second attempt on the same consumed token", async () => {
      // Racing replays claim the grace atomically; the loser gets nothing, exactly as with the
      // single-use claim on the normal path.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "t1",
        userId: "u1",
        expiresAt: future,
        revokedAt: new Date(Date.now() - 2_000),
        graceUsedAt: null,
        user,
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh("plain")).rejects.toThrow();
    });

    it("refuses a token consumed long ago, which is what a replayed token looks like", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "t1",
        userId: "u1",
        expiresAt: future,
        revokedAt: new Date(Date.now() - 120_000),
        graceUsedAt: null,
        user,
      });

      await expect(service.refresh("plain")).rejects.toThrow();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it("refuses an expired token however recently it was consumed", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "t1",
        userId: "u1",
        expiresAt: new Date(Date.now() - 1_000),
        revokedAt: new Date(Date.now() - 1_000),
        graceUsedAt: null,
        user,
      });

      await expect(service.refresh("plain")).rejects.toThrow();
    });

    it("refuses a token it has never seen", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh("plain")).rejects.toThrow();
    });
  });

  describe("register", () => {
    it("generates a username via ReferralsService and stores it on the new user", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: "user-1",
        phone: "+70000000001",
        fullName: "New User",
        username: "autogenusr",
        role: "CUSTOMER",
      });

      const result = await service.register({ phone: "+70000000001", password: "password123", fullName: "New User" });

      expect(referrals.generateUsername).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          phone: "+70000000001",
          passwordHash: "hashed",
          fullName: "New User",
          username: "autogenusr",
          locale: "ru",
        },
      });
      expect(result.user.username).toBe("autogenusr");
      expect(result.user.avatarUrl).toBeNull();
    });

    it("records the referral when a referredByUsername is supplied, without blocking on failure", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: "user-2",
        phone: "+70000000002",
        fullName: null,
        username: "autogenusr",
        role: "CUSTOMER",
      });
      referrals.recordReferral.mockRejectedValue(new Error("garbage code"));

      const result = await service.register({
        phone: "+70000000002",
        password: "password123",
        referredByUsername: "someone",
      });

      expect(referrals.recordReferral).toHaveBeenCalledWith("user-2", "someone", {
        utmSource: undefined,
        utmMedium: undefined,
        utmCampaign: undefined,
        referrerUrl: undefined,
      });
      expect(result.user.id).toBe("user-2"); // did not throw despite recordReferral rejecting
    });

    it("forwards attribution captured on the /r/<code> link through to recordReferral", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: "user-3",
        phone: "+70000000003",
        fullName: null,
        username: "autogenusr2",
        role: "CUSTOMER",
      });
      referrals.recordReferral.mockResolvedValue(undefined);

      await service.register({
        phone: "+70000000003",
        password: "password123",
        referredByUsername: "someone",
        utmSource: "instagram",
        utmMedium: "social",
        utmCampaign: "launch2026",
        referrerUrl: "https://instagram.com/gulyaly",
      });

      expect(referrals.recordReferral).toHaveBeenCalledWith("user-3", "someone", {
        utmSource: "instagram",
        utmMedium: "social",
        utmCampaign: "launch2026",
        referrerUrl: "https://instagram.com/gulyaly",
      });
    });

    it("rejects registration with an already-used phone before touching ReferralsService", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "existing" });

      await expect(
        service.register({ phone: "+70000000001", password: "password123" }),
      ).rejects.toThrow("PHONE_ALREADY_REGISTERED");
      expect(referrals.generateUsername).not.toHaveBeenCalled();
    });
  });

  describe("updateMe", () => {
    it("rejects a phone change that collides with a different user", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "other-user" });

      await expect(
        service.updateMe("user-1", { fullName: "Me", phone: "+70000000099" }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("allows keeping your own current phone number (self-collision is not a conflict)", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-1" });
      prisma.user.update.mockResolvedValue({
        id: "user-1",
        phone: "+70000000099",
        fullName: "Me",
        username: "myuser",
        role: "CUSTOMER",
        avatarPath: null,
      });

      const result = await service.updateMe("user-1", { fullName: "Me", phone: "+70000000099" });
      expect(result.avatarUrl).toBeNull();
    });

    it("does not check phone uniqueness when phone is omitted from the update", async () => {
      prisma.user.update.mockResolvedValue({
        id: "user-1",
        phone: "+70000000001",
        fullName: "New Name",
        username: "myuser",
        role: "CUSTOMER",
        avatarPath: "abc.jpg",
      });

      const result = await service.updateMe("user-1", { fullName: "New Name" });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(result.avatarUrl).toBe("/api/avatar/abc.jpg");
    });
  });

  describe("login", () => {
    const PHONE = "+99361234567";

    function existingUser(passwordVerifies: boolean) {
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        phone: PHONE,
        passwordHash: "hash",
        fullName: "Aygul",
        username: "1001",
        role: "CUSTOMER",
        isBlocked: false,
        locale: "ru",
        avatarPath: null,
      });
      jest.spyOn(argon2, "verify").mockResolvedValue(passwordVerifies);
    }

    afterEach(() => jest.restoreAllMocks());

    it("turns a guess away while the wait is running, without touching the database", async () => {
      loginAttempts.check.mockResolvedValue({ allowed: false, retryAfterSeconds: 8 });

      await expect(service.login({ phone: PHONE, password: "x" } as never)).rejects.toMatchObject({
        status: 429,
      });
      // Checked before the lookup and before argon2: a throttled attempt should cost nothing,
      // and hashing is the most expensive thing this endpoint does.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("records a failure when the password is wrong", async () => {
      existingUser(false);

      await expect(service.login({ phone: PHONE, password: "wrong" } as never)).rejects.toThrow();
      expect(loginAttempts.recordFailure).toHaveBeenCalledWith(PHONE);
      expect(loginAttempts.clear).not.toHaveBeenCalled();
    });

    it("records a failure for a number nobody holds, too", async () => {
      // Otherwise an unknown number answers faster than a known one with a wrong password, and
      // that difference is a way to find out who has an account here.
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ phone: PHONE, password: "x" } as never)).rejects.toThrow();
      expect(loginAttempts.recordFailure).toHaveBeenCalledWith(PHONE);
    });

    it("erases the history when the password is right", async () => {
      existingUser(true);

      await service.login({ phone: PHONE, password: "correct" } as never);
      expect(loginAttempts.clear).toHaveBeenCalledWith(PHONE);
      expect(loginAttempts.recordFailure).not.toHaveBeenCalled();
    });
  });
});
