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
      findUniqueOrThrow: jest.fn(),
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
    maybeGrantPhoneBonus: jest.fn().mockResolvedValue(false),
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

  describe("updateMe", () => {
    it("rejects a phone change that collides with a different user", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "other-user" });

      await expect(
        service.updateMe("user-1", { fullName: "Me", phone: "+70000000099" }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("allows keeping your own current phone number (self-collision is not a conflict)", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-1", country: "TM" });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
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
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: "user-1",
        phone: "+70000000001",
        fullName: "New Name",
        username: "myuser",
        role: "CUSTOMER",
        avatarPath: "abc.jpg",
      });

      const result = await service.updateMe("user-1", { fullName: "New Name" });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(referrals.maybeGrantPhoneBonus).not.toHaveBeenCalled();
      expect(result.avatarUrl).toBe("/api/avatar/abc.jpg");
      expect(result.phoneBonusTmt).toBe(1);
    });

    it("adding a phone checks the phone bonus and fills in a missing country from the number", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // nobody else holds the number
        .mockResolvedValueOnce({ country: null }); // the account has no country yet
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", avatarPath: null });

      await service.updateMe("user-1", { fullName: "Me", phone: "+99361234567" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { fullName: "Me", phone: "+99361234567", locale: undefined, country: "TM" },
      });
      expect(referrals.maybeGrantPhoneBonus).toHaveBeenCalledWith("user-1");
    });
  });

  describe("login", () => {
    const EMAIL = "aygul@example.com";

    function existingUser(passwordVerifies: boolean) {
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: EMAIL,
        phone: null,
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

      await expect(service.login({ email: EMAIL, password: "x" } as never)).rejects.toMatchObject({
        status: 429,
      });
      // Checked before the lookup and before argon2: a throttled attempt should cost nothing,
      // and hashing is the most expensive thing this endpoint does.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("records a failure when the password is wrong", async () => {
      existingUser(false);

      await expect(service.login({ email: EMAIL, password: "wrong" } as never)).rejects.toThrow();
      expect(loginAttempts.recordFailure).toHaveBeenCalledWith(EMAIL);
      expect(loginAttempts.clear).not.toHaveBeenCalled();
    });

    it("records a failure for an address nobody holds, too", async () => {
      // Otherwise an unknown address answers faster than a known one with a wrong password, and
      // that difference is a way to find out who has an account here.
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: EMAIL, password: "x" } as never)).rejects.toThrow();
      expect(loginAttempts.recordFailure).toHaveBeenCalledWith(EMAIL);
    });

    it("erases the history when the password is right", async () => {
      existingUser(true);

      await service.login({ email: EMAIL, password: "correct" } as never);
      expect(loginAttempts.clear).toHaveBeenCalledWith(EMAIL);
      expect(loginAttempts.recordFailure).not.toHaveBeenCalled();
    });
  });
});
