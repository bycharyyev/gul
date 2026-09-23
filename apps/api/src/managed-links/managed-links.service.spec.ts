import { ConflictException, NotFoundException } from "@nestjs/common";
import { ManagedLinksService } from "./managed-links.service";

function target(prisma: Record<string, unknown>) {
  return new ManagedLinksService(prisma as never);
}

describe("ManagedLinksService.resolve", () => {
  it("404s for a slug nobody made, and for a disabled one, alike", async () => {
    const missing = { managedLink: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(target(missing).resolve("nope")).rejects.toBeInstanceOf(NotFoundException);

    const disabled = {
      managedLink: {
        findUnique: jest.fn().mockResolvedValue({ id: "l1", isEnabled: false }),
      },
    };
    await expect(target(disabled).resolve("paused")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("counts the visit, and returns where it points", async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      managedLink: {
        findUnique: jest.fn().mockResolvedValue({
          id: "l1",
          slug: "leto2026",
          targetUrl: "https://gulyaly.com/gallery/product/p1",
          isEnabled: true,
        }),
        update,
      },
    };

    const link = await target(prisma).resolve("leto2026");

    expect(link.targetUrl).toBe("https://gulyaly.com/gallery/product/p1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { clickCount: { increment: 1 } },
    });
  });
});

describe("ManagedLinksService.create", () => {
  it("refuses a slug that is already taken", async () => {
    const prisma = {
      managedLink: {
        findUnique: jest.fn().mockResolvedValue({ id: "existing" }),
      },
    };
    await expect(
      target(prisma).create({
        slug: "leto2026",
        targetUrl: "https://gulyaly.com/gallery",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("ManagedLinksService.update", () => {
  it("lets a link keep its own slug without tripping the taken-slug check", async () => {
    const prisma = {
      managedLink: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "l1", slug: "leto2026", isEnabled: true }),
        update: jest.fn().mockResolvedValue({ id: "l1" }),
      },
    };

    await target(prisma).update("l1", { slug: "leto2026" });

    // Only the one lookup this test set up -- getById's -- ran; the "is this slug free"
    // check never fired because the slug did not actually change.
    expect(prisma.managedLink.findUnique).toHaveBeenCalledTimes(1);
  });

  it("refuses to rename a link onto a slug another one already owns", async () => {
    const prisma = {
      managedLink: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: "l1", slug: "leto2026" })
          .mockResolvedValueOnce({ id: "l2", slug: "zima2026" }),
      },
    };

    await expect(
      target(prisma).update("l1", { slug: "zima2026" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
