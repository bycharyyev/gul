import { ConflictException, NotFoundException } from "@nestjs/common";
import { SellersService } from "./sellers.service";

function target(prisma: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const referrals = { isUsernameTaken: jest.fn().mockResolvedValue(false), ...(extra.referrals ?? {}) };
  const auditLog = { record: jest.fn() };
  const email = { sendSellerApplicationMail: jest.fn() };
  return {
    service: new SellersService(prisma as never, referrals as never, auditLog as never, email as never),
    referrals,
    auditLog,
    email,
  };
}

const customer = {
  id: "u1",
  phone: "+99361000000",
  email: "a@b.c",
  fullName: "Aman",
  passwordHash: "argon2-hash",
  role: "CUSTOMER",
};

describe("applying from inside the app", () => {
  it("takes the phone from the session and never from the body", async () => {
    // The public form has to ask for a phone; this one must not. A signed-in person naming
    // somebody else's phone would have an approval land on that stranger's account.
    const create = jest.fn().mockResolvedValue({ id: "app1", status: "PENDING" });
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(customer) },
      seller: { findUnique: jest.fn().mockResolvedValue(null) },
      sellerApplication: { findFirst: jest.fn().mockResolvedValue(null), create },
    };

    await target(prisma).service.applyAsCurrentUser("u1", {
      handle: "gulbahar",
      shopName: "Гульбахар",
    });

    expect(create.mock.calls[0][0].data.phone).toBe(customer.phone);
  });

  it("refuses somebody who already has a shop", async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ ...customer, role: "SELLER" }) },
      sellerApplication: { create: jest.fn() },
    };

    await expect(
      target(prisma).service.applyAsCurrentUser("u1", { handle: "x", shopName: "X" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a staff account", async () => {
    // A staff account running a shop it also moderates is a conflict of interest, not a
    // convenience.
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ ...customer, role: "MANAGER" }) },
      sellerApplication: { create: jest.fn() },
    };

    await expect(
      target(prisma).service.applyAsCurrentUser("u1", { handle: "x", shopName: "X" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a handle somebody already uses as a referral username", async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(customer) },
      seller: { findUnique: jest.fn().mockResolvedValue(null) },
      sellerApplication: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    };
    const { service } = target(prisma, {
      referrals: { isUsernameTaken: jest.fn().mockResolvedValue(true) },
    });

    await expect(
      service.applyAsCurrentUser("u1", { handle: "taken", shopName: "X" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses when an application is already waiting", async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(customer) },
      seller: { findUnique: jest.fn().mockResolvedValue(null) },
      sellerApplication: {
        findFirst: jest.fn().mockResolvedValue({ id: "pending" }),
        create: jest.fn(),
      },
    };

    await expect(
      target(prisma).service.applyAsCurrentUser("u1", { handle: "x", shopName: "X" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("answers a missing account as missing", async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };

    await expect(
      target(prisma).service.applyAsCurrentUser("ghost", { handle: "x", shopName: "X" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("approving an application for an account that already exists", () => {
  const application = {
    id: "app1",
    phone: customer.phone,
    email: customer.email,
    fullName: customer.fullName,
    handle: "gulbahar",
    shopName: "Гульбахар",
    description: null,
    passwordHash: "hash-from-the-form",
    status: "PENDING",
  };

  function prismaFor(existingUser: Record<string, unknown> | null) {
    const update = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({ id: "s1", shopName: application.shopName });
    return {
      prisma: {
        sellerApplication: {
          findUnique: jest.fn().mockResolvedValue(application),
          update: jest.fn().mockResolvedValue({}),
        },
        user: { findUnique: jest.fn().mockResolvedValue(existingUser), update, create: jest.fn() },
        seller: { findUnique: jest.fn().mockResolvedValue(null), create },
        $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      },
      update,
      create,
    };
  }

  it("promotes the account instead of refusing", async () => {
    // Before this, approval called assertPhoneAndHandleFree and threw "Phone already registered"
    // — so a customer could never become a seller by any route at all.
    const { prisma, update, create } = prismaFor({ id: "u1", role: "CUSTOMER" });

    await target(prisma).service.approveApplication("app1", {}, "admin1");

    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "SELLER" } });
    expect(create.mock.calls[0][0].data.userId).toBe("u1");
  });

  it("leaves the account's password alone", async () => {
    // The form collects a password because a stranger applying has no account. Writing it onto an
    // existing account would let whoever filed the application take that account over.
    const { prisma, update } = prismaFor({ id: "u1", role: "CUSTOMER" });

    await target(prisma).service.approveApplication("app1", {}, "admin1");

    expect(update.mock.calls[0][0].data).toEqual({ role: "SELLER" });
    expect(JSON.stringify(update.mock.calls[0][0])).not.toContain("hash-from-the-form");
  });

  it("refuses when that account is already a seller", async () => {
    const { prisma, create } = prismaFor({ id: "u1", role: "SELLER" });

    await expect(
      target(prisma).service.approveApplication("app1", {}, "admin1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses to turn a staff account into a shop", async () => {
    const { prisma, create } = prismaFor({ id: "u1", role: "ADMIN" });

    await expect(
      target(prisma).service.approveApplication("app1", {}, "admin1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it("still creates a fresh account when the phone belongs to nobody", async () => {
    const { prisma } = prismaFor(null);
    prisma.user.create = jest.fn().mockResolvedValue({ id: "new" });

    await target(prisma).service.approveApplication("app1", {}, "admin1");

    expect(prisma.user.create).toHaveBeenCalled();
  });
});
