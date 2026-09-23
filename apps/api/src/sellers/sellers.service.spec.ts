import { NotFoundException } from "@nestjs/common";
import { SellersService } from "./sellers.service";

function target(prisma: Record<string, unknown>) {
  return new SellersService(
    prisma as never,
    {} as never,
    { record: jest.fn() } as never,
    {} as never,
  );
}

describe("SellersService.getPublicByHandle", () => {
  it("404s for a handle nobody owns, and for a disabled shop alike", async () => {
    const missing = { seller: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(target(missing).getPublicByHandle("nope")).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const disabled = {
      seller: {
        findUnique: jest.fn().mockResolvedValue({ id: "s1", isEnabled: false }),
      },
    };
    await expect(
      target(disabled).getPublicByHandle("closed"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("carries the shop's post and product counts, for the profile header", async () => {
    // A shop page needs to say how much is there before either list has loaded -- the same reason
    // the storefront sections travel with the profile rather than behind a second request.
    const prisma = {
      seller: {
        findUnique: jest.fn().mockResolvedValue({
          id: "s1",
          userId: "u1",
          handle: "altyn",
          shopName: "Altyn Ay",
          description: null,
          logoUrl: null,
          isEnabled: true,
        }),
      },
      storefront: { findMany: jest.fn().mockResolvedValue([]) },
      galleryProduct: { count: jest.fn().mockResolvedValue(7) },
      socialPost: { count: jest.fn().mockResolvedValue(3) },
    };

    const profile = await target(prisma).getPublicByHandle("altyn");

    expect(profile.productCount).toBe(7);
    expect(profile.postCount).toBe(3);
    // Only what a visitor could actually see counts toward the number on the profile.
    expect(prisma.socialPost.count).toHaveBeenCalledWith({
      where: { authorId: "u1", status: "PUBLISHED" },
    });
    expect(prisma.galleryProduct.count).toHaveBeenCalledWith({
      where: { sellerId: "s1", isEnabled: true },
    });
  });
});
