import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { MarketplacePurchaseService } from "./marketplace-purchase.service";
import { ManualReviewMarketplaceAdapter } from "./marketplace-source.adapter";

function service(prisma: Record<string, unknown>) {
  return new MarketplacePurchaseService(prisma as never, { record: jest.fn() } as never, new ManualReviewMarketplaceAdapter());
}

describe("MarketplacePurchaseService security and money invariants", () => {
  it.each([
    ["OZON", "http://ozon.ru/product/1"],
    ["OZON", "https://ozon.ru.evil.test/product/1"],
    ["OZON", "https://user:pass@ozon.ru/product/1"],
    ["TAOBAO", "https://127.0.0.1/item/1"],
  ])("rejects unsafe/mismatched URLs", async (sourceCode, url) => {
    const prisma = {
      marketplacePurchaseOrder: { findUnique: jest.fn() },
      marketplacePurchaseSource: { findMany: jest.fn().mockResolvedValue([{ code: sourceCode }]) },
    };
    await expect(service(prisma).create("u1", { items: [{ sourceCode, url, quantity: 1 }], currency: "RUB", deliveryAddress: "valid address", idempotencyKey: "request-123" } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts a quote once and does not mint authorization before funding", async () => {
    const order = { id: "o1", userId: "u1", status: "QUOTED", acceptedQuoteVersion: null, quotes: [{ version: 1, totalTmt: 90, expiresAt: new Date(Date.now() + 60_000) }] };
    let accepted = false;
    const tx = {
      marketplacePurchaseOrder: {
        findUnique: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn().mockImplementation(async () => accepted ? { count: 0 } : (accepted = true, { count: 1 })),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: "AUTHORIZATION_PENDING", authorizedTmt: 0 }),
      },
      marketplacePurchaseAccount: { upsert: jest.fn().mockResolvedValue({ balanceTmt: 0 }), updateMany: jest.fn() },
      marketplacePurchaseLedger: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const target = service(prisma);
    const input = { quoteVersion: 1, maxAuthorizedTmt: 100, consentAccepted: true, consentVersion: "v1" };

    await expect(target.accept("o1", "u1", input)).resolves.toMatchObject({ status: "AUTHORIZATION_PENDING", authorizedTmt: 0 });
    await expect(target.accept("o1", "u1", input)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.marketplacePurchaseLedger.create).not.toHaveBeenCalled();
  });

  it("returns an existing exact-weight settlement on retry without another credit", async () => {
    const exact = { version: 2, totalTmt: 80, weightConfidence: "EXACT" };
    const tx = {
      $executeRaw: jest.fn(),
      marketplacePurchaseOrder: { findUnique: jest.fn().mockResolvedValue({ id: "o1", status: "READY_TO_SHIP", settledTmt: 80, refundedTmt: 20, quotes: [exact] }) },
      marketplacePurchaseAccount: { upsert: jest.fn() },
      marketplacePurchaseLedger: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };

    await expect(service(prisma).actualWeight("o1", { actualWeightKg: 2 }, "a1")).resolves.toEqual({ version: 2, totalTmt: 80, settledTmt: 80, refundedTmt: 20 });
    expect(tx.marketplacePurchaseAccount.upsert).not.toHaveBeenCalled();
    expect(tx.marketplacePurchaseLedger.create).not.toHaveBeenCalled();
  });

  it("routes a partially wallet-funded authorization through REFUND_PENDING, never direct cancellation", async () => {
    const prisma = {
      marketplacePurchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({ id: "o1", status: "AUTHORIZATION_PENDING", authorizedTmt: 25, reviewReason: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "o1", status: "REFUND_PENDING" }),
      },
    };
    const target = service(prisma);

    await expect(target.updateStatus("o1", "CANCELLED", undefined, "a1")).rejects.toBeInstanceOf(BadRequestException);
    await expect(target.updateStatus("o1", "REFUND_PENDING", "customer cancellation", "a1")).resolves.toMatchObject({ status: "REFUND_PENDING" });
  });

  it("settles against collected funds, not the consented cap -- a partly funded order cannot mint a refund", async () => {
    // 25 TMT actually collected from the wallet against a 100 TMT consented cap. Pricing the
    // parcel at 80 must NOT credit 20 back: the customer never paid 100, so there is no 20 to
    // return. Settling on the cap is how this created money out of nothing.
    const order = {
      id: "o1", userId: "u1", status: "AT_WAREHOUSE", maxAuthorizedTmt: 100, authorizedTmt: 25,
      settledTmt: 0, refundedTmt: 0, fundingReference: "ext-1",
      quotes: [{ version: 1, productSubtotalTmt: 60, serviceFeeTmt: 10, shippingTmt: 10, totalTmt: 80, fxSnapshot: {}, weightConfidence: "ESTIMATED" }],
    };
    const tx = {
      $executeRaw: jest.fn(),
      marketplacePurchaseOrder: { findUnique: jest.fn().mockResolvedValue(order), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      marketplacePurchaseSettings: { findUniqueOrThrow: jest.fn().mockResolvedValue({ shippingPerKgTmt: 5, quoteTtlMinutes: 60 }) },
      marketplacePurchaseQuote: { create: jest.fn() },
      marketplacePurchaseAccount: { upsert: jest.fn() },
      marketplacePurchaseLedger: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };

    // 2kg x 5 TMT/kg = 10 shipping, so total = 60 + 10 + 10 = 80.
    const result = await service(prisma).actualWeight("o1", { actualWeightKg: 2 }, "a1");

    expect(result).toMatchObject({ settledTmt: 25, refundedTmt: 0 });
    expect(tx.marketplacePurchaseAccount.upsert).not.toHaveBeenCalled();
    expect(tx.marketplacePurchaseOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FINAL_PAYMENT_DUE" }) }),
    );
  });

  it("refunds only the unspent part of what was actually collected", async () => {
    const order = {
      id: "o1", userId: "u1", status: "AT_WAREHOUSE", maxAuthorizedTmt: 100, authorizedTmt: 100,
      settledTmt: 0, refundedTmt: 0, fundingReference: "ext-1",
      quotes: [{ version: 1, productSubtotalTmt: 60, serviceFeeTmt: 10, shippingTmt: 30, totalTmt: 100, fxSnapshot: {}, weightConfidence: "ESTIMATED" }],
    };
    const tx = {
      $executeRaw: jest.fn(),
      marketplacePurchaseOrder: { findUnique: jest.fn().mockResolvedValue(order), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      marketplacePurchaseSettings: { findUniqueOrThrow: jest.fn().mockResolvedValue({ shippingPerKgTmt: 5, quoteTtlMinutes: 60 }) },
      marketplacePurchaseQuote: { create: jest.fn() },
      marketplacePurchaseAccount: { upsert: jest.fn() },
      marketplacePurchaseLedger: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };

    // 2kg -> 10 shipping, total 80 against 100 fully collected: 20 is genuinely owed back.
    const result = await service(prisma).actualWeight("o1", { actualWeightKg: 2 }, "a1");

    expect(result).toMatchObject({ settledTmt: 80, refundedTmt: 20 });
    expect(tx.marketplacePurchaseAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { balanceTmt: { increment: 20 } } }),
    );
    expect(tx.marketplacePurchaseOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "READY_TO_SHIP" }) }),
    );
  });

  it("refuses to reach AUTHORIZED by a status change -- only confirmed funding may assert it", async () => {
    const prisma = {
      marketplacePurchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({ id: "o1", status: "AUTHORIZATION_PENDING", authorizedTmt: 25, reviewReason: null }),
        updateMany: jest.fn(),
      },
    };

    await expect(service(prisma).updateStatus("o1", "AUTHORIZED", "looks fine", "a1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.marketplacePurchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it("hides another customer's order behind a 404, not a 403 that would confirm it exists", async () => {
    const prisma = {
      marketplacePurchaseOrder: { findUnique: jest.fn().mockResolvedValue({ id: "o1", userId: "someone-else" }) },
    };
    const target = service(prisma);

    await expect(target.one("o1", { userId: "u1", role: "CUSTOMER" })).rejects.toBeInstanceOf(NotFoundException);
    // Staff legitimately read any order.
    await expect(target.one("o1", { userId: "admin", role: "ADMIN" })).resolves.toMatchObject({ id: "o1" });
  });

  describe("what the customer's browser reported", () => {
    it("stores it under reported*, never under the verified snapshot columns", async () => {
      // The two must stay distinguishable forever: a snapshot is what an adapter verified, a
      // reported value is what an app on somebody's phone said. Merging them would quietly turn
      // an unchecked figure into one the pricing screen presents as known.
      const create = jest.fn().mockResolvedValue({ id: "o1", items: [], quotes: [] });
      const prisma = {
        marketplacePurchaseOrder: { findUnique: jest.fn().mockResolvedValue(null), create },
        marketplacePurchaseSource: {
          findMany: jest.fn().mockResolvedValue([{ code: "OZON" }]),
        },
      };
      await service(prisma as never).create("u1", {
        currency: "TMT",
        deliveryAddress: "Asgabat",
        idempotencyKey: "key-1",
        items: [
          {
            sourceCode: "OZON",
            url: "https://www.ozon.ru/product/x-5188439881/",
            quantity: 1,
            reportedTitle: "Магнитный аккумулятор",
            reportedPrice: 954,
            reportedCurrency: "RUB",
            reportedSource: "json-ld",
          },
        ],
      } as never);

      const written = create.mock.calls[0][0].data.items.create[0];
      expect(written).toMatchObject({
        reportedTitle: "Магнитный аккумулятор",
        reportedPrice: 954,
        reportedCurrency: "RUB",
        reportedSource: "json-ld",
      });
      // The adapter returned nothing, and a reported value must not have filled these in.
      expect(written.titleSnapshot).toBeUndefined();
      expect(written.unitPriceSnapshot).toBeUndefined();
    });
  });

  describe("resolveLink and search history", () => {
    const SOURCES = [
      { code: "OZON", name: "Ozon", allowedHosts: ["ozon.ru", "www.ozon.ru"], requiresManualReview: true },
      { code: "TAOBAO", name: "Taobao", allowedHosts: ["item.taobao.com"], requiresManualReview: true },
    ];

    function prismaWith(tx: Record<string, unknown>) {
      return {
        marketplacePurchaseSource: { findMany: jest.fn().mockResolvedValue(SOURCES) },
        marketplaceSearchHistory: tx.marketplaceSearchHistory,
        $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
      };
    }

    it("names the marketplace from the host and the article number from the URL, with no network call", async () => {
      const tx = {
        marketplaceSearchHistory: {
          upsert: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn(),
        },
      };
      const result = await service(prismaWith(tx)).resolveLink(
        "u1",
        "https://www.ozon.ru/product/ssd-1000-gb-1798256734/?utm_source=telegram",
      );

      expect(result).toMatchObject({
        sourceCode: "OZON",
        sourceName: "Ozon",
        externalId: "1798256734",
        isProductPage: true,
        requiresManualReview: true,
      });
      // Tracking parameters are not part of product identity, so the stored form drops them.
      expect(result.canonicalUrl).toBe("https://www.ozon.ru/product/ssd-1000-gb-1798256734/");
    });

    it("refuses a host we do not support instead of accepting a link nobody can buy from", async () => {
      const tx = { marketplaceSearchHistory: { upsert: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() } };
      await expect(service(prismaWith(tx)).resolveLink("u1", "https://example.com/item/1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("does not remember a category page -- it is not something an order can be placed against", async () => {
      const tx = {
        marketplaceSearchHistory: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
      };
      const result = await service(prismaWith(tx)).resolveLink("u1", "https://www.ozon.ru/category/smartfony-15502/");

      expect(result).toMatchObject({ isProductPage: false, externalId: null });
      expect(tx.marketplaceSearchHistory.upsert).not.toHaveBeenCalled();
    });

    it("keeps at most five entries, dropping the oldest", async () => {
      const overflow = [{ id: "old-1" }, { id: "old-2" }];
      const tx = {
        marketplaceSearchHistory: {
          upsert: jest.fn(),
          // Two different findMany calls now: the article-dedup lookup, then everything past the
          // fifth row. Answer by the query, so the prune assertion cannot pass on the other one.
          findMany: jest.fn().mockImplementation((args) => Promise.resolve(args.skip === 5 ? overflow : [])),
          deleteMany: jest.fn(),
        },
      };
      await service(prismaWith(tx)).resolveLink("u1", "https://item.taobao.com/item.htm?id=654321987");

      expect(tx.marketplaceSearchHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, orderBy: { createdAt: "desc" } }),
      );
      expect(tx.marketplaceSearchHistory.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["old-1", "old-2"] } },
      });
    });

    it("collapses two shares of one product onto a single row", async () => {
      // Ozon's share button appends a fresh `sh`/`short` pair every time, so the second share of
      // the same phone case is a different URL carrying the same article. Before this, the list
      // showed 5188439881 twice and the customer had two chips that did the same thing.
      const twin = [{ id: "earlier-share" }];
      const tx = {
        marketplaceSearchHistory: {
          upsert: jest.fn(),
          findMany: jest.fn().mockImplementation((args) => Promise.resolve(args.skip === 5 ? [] : twin)),
          deleteMany: jest.fn(),
        },
      };
      await service(prismaWith(tx)).resolveLink("u1", "https://www.ozon.ru/product/ssd-1798256734/?sh=abc&short=xyz");

      expect(tx.marketplaceSearchHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "u1", sourceCode: "OZON", externalId: "1798256734" }),
        }),
      );
      expect(tx.marketplaceSearchHistory.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["earlier-share"] } } });
    });

    it("does not go looking for twins when the URL carried no article number", async () => {
      const tx = {
        marketplaceSearchHistory: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
      };
      await service(prismaWith(tx)).resolveLink("u1", "https://www.ozon.ru/category/smartfony-15502/");

      expect(tx.marketplaceSearchHistory.findMany).not.toHaveBeenCalled();
    });

    it("moves a repeated link to the top rather than storing it twice", async () => {
      const tx = {
        marketplaceSearchHistory: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
      };
      await service(prismaWith(tx)).resolveLink("u1", "https://www.ozon.ru/product/ssd-1798256734/");

      expect(tx.marketplaceSearchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_canonicalUrl: { userId: "u1", canonicalUrl: "https://www.ozon.ru/product/ssd-1798256734/" } },
        }),
      );
    });
  });
});
