import { ForbiddenException } from "@nestjs/common";
import { OrdersService } from "./orders.service";

describe("OrdersService detail authorization", () => {
  function build() {
    const prisma = {
      order: { findFirst: jest.fn().mockResolvedValue({ id: "o1", userId: "customer1" }) },
    };
    const service = new OrdersService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    return service;
  }

  it("does not let a seller read another customer's top-up order", async () => {
    await expect(build().findOne("o1", { userId: "seller1", role: "SELLER" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each(["ADMIN", "MANAGER", "SUPPORT"])("allows %s to inspect customer orders", async (role) => {
    await expect(build().findOne("o1", { userId: "staff1", role })).resolves.toMatchObject({ id: "o1" });
  });
});
