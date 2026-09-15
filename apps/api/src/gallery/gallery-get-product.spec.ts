import { NotFoundException } from "@nestjs/common";
import { GalleryService } from "./gallery.service";

function target(prisma: Record<string, unknown>) {
  return new GalleryService(prisma as never, {} as never, {} as never, {} as never, { record: jest.fn() } as never, {} as never);
}

describe("GalleryService.getProduct", () => {
  it("404s for a product that does not exist -- a stale link says gone, not throws", async () => {
    const prisma = { galleryProduct: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(target(prisma).getProduct("missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("only ever looks for an enabled product in an enabled category", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: "p1" });
    const prisma = { galleryProduct: { findFirst } };

    await target(prisma).getProduct("p1");

    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      id: "p1",
      isEnabled: true,
      category: { isEnabled: true },
    });
  });
});
