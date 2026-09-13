import { BadRequestException, NotFoundException } from "@nestjs/common";
import { GalleryService } from "./gallery.service";

function target(prisma: Record<string, unknown>) {
  return new GalleryService(
    prisma as never,
    {} as never,
    {} as never,
    { record: jest.fn() } as never,
    {} as never,
  );
}

describe("GalleryService.updateOrderDetails", () => {
  it("404s for an order that does not exist", async () => {
    const prisma = { galleryOrder: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(
      target(prisma).updateOrderDetails("missing", {}, "admin-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(["DELIVERED", "CANCELLED"])(
    "refuses to edit a %s order -- there is nothing left to correct",
    async (status) => {
      const prisma = {
        galleryOrder: {
          findUnique: jest.fn().mockResolvedValue({ id: "o1", status }),
        },
      };
      await expect(
        target(prisma).updateOrderDetails("o1", { recipientName: "New" }, "admin-1"),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it("corrects only what was sent, never the product or the amount paid", async () => {
    const update = jest.fn().mockResolvedValue({ id: "o1" });
    const prisma = {
      galleryOrder: {
        findUnique: jest.fn().mockResolvedValue({ id: "o1", status: "PAID" }),
        update,
      },
    };

    await target(prisma).updateOrderDetails(
      "o1",
      { deliveryAddress: "New street 5", cardMessage: undefined },
      "admin-1",
    );

    const data = update.mock.calls[0][0].data;
    expect(data.deliveryAddress).toBe("New street 5");
    // Fields the admin did not send stay `undefined` in the payload, which Prisma's `update`
    // treats as "leave untouched" rather than "clear it" -- the same distinction the seller's own
    // profile edit relies on elsewhere in this codebase.
    expect(data.recipientName).toBeUndefined();
    expect(data.cardMessage).toBeUndefined();
    expect(data).not.toHaveProperty("productId");
    expect(data).not.toHaveProperty("amountTmt");
  });
});
