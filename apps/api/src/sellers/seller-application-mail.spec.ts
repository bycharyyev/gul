import { SellersService } from "./sellers.service";

jest.mock("argon2", () => ({ hash: jest.fn().mockResolvedValue("hashed") }));

const APPLICATION = {
  id: "app1",
  phone: "+99361234567",
  email: "shop@example.com",
  passwordHash: "hashed",
  fullName: "Aman Amanov",
  handle: "bucet",
  shopName: "Bucet TM",
  description: null,
  status: "PENDING" as const,
};

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "u1" }),
    },
    seller: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "s1", shopName: APPLICATION.shopName }),
    },
    sellerApplication: {
      findUnique: jest.fn().mockResolvedValue(APPLICATION),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(APPLICATION),
      update: jest.fn().mockResolvedValue({ ...APPLICATION, status: "REJECTED" }),
    },
    ...overrides,
  };
}

function build(prisma: ReturnType<typeof makePrisma>) {
  const email = { sendSellerApplicationMail: jest.fn().mockResolvedValue(undefined) };
  const referrals = { isUsernameTaken: jest.fn().mockResolvedValue(false) };
  const auditLog = { record: jest.fn() };
  const service = new SellersService(prisma as never, referrals as never, auditLog as never, email as never);
  return { service, email };
}

describe("seller application email", () => {
  it("acknowledges a submitted application", async () => {
    const prisma = makePrisma();
    const { service, email } = build(prisma);

    await service.applyForSeller({
      phone: APPLICATION.phone,
      email: APPLICATION.email,
      password: "password123",
      fullName: APPLICATION.fullName,
      handle: APPLICATION.handle,
      shopName: APPLICATION.shopName,
    } as never);

    expect(email.sendSellerApplicationMail).toHaveBeenCalledWith(
      "SELLER_APPLICATION_RECEIVED",
      expect.objectContaining({ email: APPLICATION.email }),
    );
  });

  it("mails the decision on approval, with the shop name", async () => {
    const prisma = makePrisma();
    const { service, email } = build(prisma);

    await service.approveApplication("app1", { note: undefined } as never, "admin1");

    expect(email.sendSellerApplicationMail).toHaveBeenCalledWith(
      "SELLER_APPROVED",
      expect.objectContaining({ email: APPLICATION.email, shopName: APPLICATION.shopName }),
    );
  });

  it("carries the address onto the account as UNVERIFIED", async () => {
    const prisma = makePrisma();
    const { service } = build(prisma);

    await service.approveApplication("app1", { note: undefined } as never, "admin1");

    const created = prisma.user.create.mock.calls[0][0].data;
    expect(created.email).toBe(APPLICATION.email);
    // Typing an address into a form is not proof of control, so order/payout mail stays gated
    // until they confirm it.
    expect(created.emailVerified).toBeUndefined();
  });

  it("still approves when the address already belongs to another account", async () => {
    const prisma = makePrisma();
    // `email` is unique on User -- approval must not fail because of it.
    prisma.user.findUnique.mockImplementation(({ where }: { where: { email?: string; phone?: string } }) =>
      Promise.resolve(where.email ? { id: "someone-else" } : null),
    );
    const { service } = build(prisma);

    await expect(service.approveApplication("app1", { note: undefined } as never, "admin1")).resolves.toBeDefined();
    expect(prisma.user.create.mock.calls[0][0].data.email).toBeNull();
  });

  it("mails the rejection reason, which is what makes it actionable", async () => {
    const prisma = makePrisma();
    const { service, email } = build(prisma);

    await service.rejectApplication("app1", { note: "Не хватает документов" } as never, "admin1");

    expect(email.sendSellerApplicationMail).toHaveBeenCalledWith(
      "SELLER_REJECTED",
      expect.objectContaining({ email: APPLICATION.email, reason: "Не хватает документов" }),
    );
  });
});
