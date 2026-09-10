import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { GalleryService } from "./gallery.service";
import { slugify, uniqueSlug } from "./storefront-slug";

function target(prisma: Record<string, unknown>) {
  // Only prisma is exercised here; the notification, mail, audit and ledger collaborators are
  // not reached by any storefront path.
  return new GalleryService(
    prisma as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
}

describe("storefront slugs", () => {
  it("transliterates rather than dropping Cyrillic", () => {
    // A section called "Свадебные" must not resolve to an empty address. Most of these names
    // are Russian, so dropping what it cannot map would empty nearly all of them.
    expect(slugify("Свадебные букеты")).toBe("svadebnye-bukety");
    expect(slugify("Новинки")).toBe("novinki");
  });

  it("maps the Turkmen letters the Latin alphabet does not already cover", () => {
    expect(slugify("Güller ýygyndysy")).toBe("guller-yygyndysy");
  });

  it("collapses separators and never ends on one", () => {
    expect(slugify("  Скидки — 50%!!  ")).toBe("skidki-50");
  });

  it("stays inside the column", () => {
    const long = slugify("новинки ".repeat(40));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
  });

  it("suffixes a name the shop already uses instead of refusing it", () => {
    // Two sections called "Новинки" is something somebody may genuinely want, and an error
    // saying the word is taken -- by themselves -- would be a puzzle.
    expect(uniqueSlug("novinki", new Set())).toBe("novinki");
    expect(uniqueSlug("novinki", new Set(["novinki"]))).toBe("novinki-2");
    expect(uniqueSlug("novinki", new Set(["novinki", "novinki-2"]))).toBe("novinki-3");
  });

  it("keeps the suffixed slug inside the column too", () => {
    const base = "a".repeat(60);
    expect(uniqueSlug(base, new Set([base])).length).toBeLessThanOrEqual(60);
  });

  it("falls back to a word when a name transliterates to nothing", () => {
    expect(uniqueSlug(slugify("!!!"), new Set())).toBe("section");
  });
});

describe("GalleryService storefronts", () => {
  it("derives the address from the name and puts the section last in the shop's order", async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      storefront: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([{ slug: "svadebnye" }]),
        create,
      },
    };

    await target(prisma).createMyStorefront("s1", { name: "  Новинки  " });

    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({ sellerId: "s1", name: "Новинки", slug: "novinki", sortOrder: 2 });
  });

  it("stops a shop from filling its page with empty shelves", async () => {
    const prisma = { storefront: { count: jest.fn().mockResolvedValue(30), create: jest.fn() } };

    await expect(
      target(prisma).createMyStorefront("s1", { name: "Ещё одна" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("moves the address when the name changes, and leaves it alone otherwise", async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      storefront: {
        findUnique: jest.fn().mockResolvedValue({ id: "f1", sellerId: "s1", name: "Новинки" }),
        findMany: jest.fn().mockResolvedValue([]),
        update,
      },
    };
    const service = target(prisma);

    await service.updateMyStorefront("s1", "f1", { name: "Скидки" });
    expect(update.mock.calls[0][0].data).toMatchObject({ name: "Скидки", slug: "skidki" });

    await service.updateMyStorefront("s1", "f1", { isEnabled: false });
    // The address came from the name; nothing about the name changed, so nothing published
    // earlier stops resolving.
    expect(update.mock.calls[1][0].data).not.toHaveProperty("slug");
  });

  it("says how many products fell back to the general list when a section is removed", async () => {
    // The database already does this (ON DELETE SET NULL). Reporting it is what stops the seller
    // discovering it by noticing.
    const prisma = {
      storefront: {
        findUnique: jest.fn().mockResolvedValue({ id: "f1", sellerId: "s1" }),
        delete: jest.fn().mockResolvedValue({}),
      },
      galleryProduct: { count: jest.fn().mockResolvedValue(7) },
    };

    await expect(target(prisma).deleteMyStorefront("s1", "f1")).resolves.toEqual({
      deleted: true,
      movedToGeneral: 7,
    });
  });

  it("refuses to touch another shop's section", async () => {
    const prisma = {
      storefront: {
        findUnique: jest.fn().mockResolvedValue({ id: "f1", sellerId: "other" }),
        update: jest.fn(),
        delete: jest.fn(),
      },
      galleryProduct: { count: jest.fn() },
    };
    const service = target(prisma);

    await expect(service.updateMyStorefront("s1", "f1", { name: "X" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.deleteMyStorefront("s1", "f1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.storefront.update).not.toHaveBeenCalled();
    expect(prisma.storefront.delete).not.toHaveBeenCalled();
  });

  it("will not put a product on a shelf belonging to somebody else", async () => {
    // The dto is spread straight into the write, and Prisma would take the foreign key without
    // ever asking whose it was. This check is the only thing standing between the two shops.
    const create = jest.fn();
    const prisma = {
      galleryProduct: { findUnique: jest.fn().mockResolvedValue(null), create },
      storefront: { findUnique: jest.fn().mockResolvedValue({ id: "f9", sellerId: "other" }) },
    };

    await expect(
      target(prisma).createMyProduct("s1", {
        categoryId: "c1",
        sku: "SKU-1",
        name: "Букет",
        imageUrl: "/api/uploads/x.jpg",
        priceTmt: 100,
        storefrontId: "f9",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts the shop's own shelf, and takes null as a move back to the general list", async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      galleryProduct: {
        findUnique: jest.fn().mockResolvedValue({ id: "p1", sellerId: "s1" }),
        update,
      },
      storefront: { findUnique: jest.fn().mockResolvedValue({ id: "f1", sellerId: "s1" }) },
    };
    const service = target(prisma);

    await service.updateMyProduct("s1", "p1", { storefrontId: "f1" });
    expect(update.mock.calls[0][0].data.storefrontId).toBe("f1");

    await service.updateMyProduct("s1", "p1", { storefrontId: null });
    expect(update.mock.calls[1][0].data.storefrontId).toBeNull();
  });

  it("leaves the shelf alone on an edit that never mentions it", async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      galleryProduct: {
        findUnique: jest.fn().mockResolvedValue({ id: "p1", sellerId: "s1" }),
        update,
      },
      storefront: { findUnique: jest.fn() },
    };

    await target(prisma).updateMyProduct("s1", "p1", { name: "Другое имя" });

    // Editing a price must not silently sweep the product off its shelf.
    expect(update.mock.calls[0][0].data).not.toHaveProperty("storefrontId");
    expect(prisma.storefront.findUnique).not.toHaveBeenCalled();
  });

  it("hides a section's products when the section itself is off", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { galleryProduct: { findMany } };

    target(prisma).listProducts({ storefrontId: "f1" });

    // The seller turned the shelf off. The products on it did not individually go out of stock,
    // so the rule has to live on the filter rather than on each product.
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      storefrontId: "f1",
      storefront: { isEnabled: true },
    });
  });

  it("answers a missing section the same way as any missing thing", async () => {
    const prisma = { storefront: { findUnique: jest.fn().mockResolvedValue(null) } };

    await expect(target(prisma).updateMyStorefront("s1", "gone", {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
