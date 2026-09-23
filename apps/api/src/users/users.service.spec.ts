import { UsersService } from "./users.service";

describe("UsersService customer detail", () => {
  it("returns device activity as an aggregate and never exposes device tokens", async () => {
    const lastSeenAt = new Date("2026-09-23T10:00:00.000Z");
    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: "customer-1", phone: "+99360000000" }),
      },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      pushToken: {
        findMany: jest.fn().mockResolvedValue([
          { platform: "ANDROID", lastSeenAt },
          { platform: "IOS", lastSeenAt: new Date("2026-09-22T10:00:00.000Z") },
          {
            platform: "ANDROID",
            lastSeenAt: new Date("2026-09-21T10:00:00.000Z"),
          },
        ]),
      },
    };
    const service = new UsersService(prisma as never, {} as never, {} as never);

    await expect(service.getCustomerDetail("customer-1")).resolves.toEqual({
      user: { id: "customer-1", phone: "+99360000000" },
      orders: [],
      devices: { count: 3, lastAppSeenAt: lastSeenAt, android: 2, ios: 1 },
    });
    expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
      where: { userId: "customer-1" },
      select: { platform: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
    });
  });
});
