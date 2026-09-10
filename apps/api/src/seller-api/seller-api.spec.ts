import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ChatService } from "../chat/chat.service";
import { ApiKeysService } from "../api-keys/api-keys.service";
import { ShopKeyGuard } from "./shop-key.guard";
import { SHOP_SCOPES } from "../partner/api-key-scopes";

const chatFor = (prisma: Record<string, unknown>) => new ChatService(prisma as never);
const keysFor = (prisma: Record<string, unknown>, quota: Record<string, unknown> = { forget: jest.fn() }) =>
  new ApiKeysService(prisma as never, quota as never);

describe("a key acting for a shop", () => {
  describe("channels", () => {
    it("posts as the account that owns the shop, not as the key", async () => {
      // A key has no person of its own. Recording the owner is the honest answer, and it is what
      // makes the message render with an author in every client that already exists.
      const create = jest.fn().mockResolvedValue({ id: "m1" });
      const prisma = {
        chatRoom: {
          findUnique: jest.fn().mockResolvedValue({ id: "c1", kind: "CHANNEL", sellerId: "s1" }),
          update: jest.fn(),
        },
        seller: { findUnique: jest.fn().mockResolvedValue({ userId: "owner1" }) },
        chatMessage: { create },
        $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => [await ops[0]]),
      };

      await chatFor(prisma).postToShopChannel("s1", "c1", "Новая коллекция");

      expect(create.mock.calls[0][0].data).toMatchObject({
        roomId: "c1",
        authorId: "owner1",
        body: "Новая коллекция",
      });
    });

    it("answers another shop's channel exactly as a missing one", async () => {
      // Otherwise a key could discover which channel ids are real by trying them.
      const prisma = {
        chatRoom: {
          findUnique: jest.fn().mockResolvedValue({ id: "c1", kind: "CHANNEL", sellerId: "other" }),
        },
      };

      await expect(chatFor(prisma).shopChannelMessages("s1", "c1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("refuses a group id handed to a channel route", async () => {
      const prisma = {
        chatRoom: {
          findUnique: jest.fn().mockResolvedValue({ id: "g1", kind: "GROUP", sellerId: "s1" }),
        },
      };

      await expect(chatFor(prisma).shopChannelMessages("s1", "g1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("caps how much history one call can pull", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = {
        chatRoom: {
          findUnique: jest.fn().mockResolvedValue({ id: "c1", kind: "CHANNEL", sellerId: "s1" }),
        },
        chatMessage: { findMany },
      };

      await chatFor(prisma).shopChannelMessages("s1", "c1", 100000);

      expect(findMany.mock.calls[0][0].take).toBe(200);
    });
  });

  describe("customer conversations", () => {
    it("reads only threads belonging to this shop", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = { supportThread: { findMany } };

      await chatFor(prisma).shopThreads("s1");

      // Never the owner's own inbox: that holds their groups, their support thread and every
      // conversation they are in as a customer, none of which a shop's automation may read.
      expect(findMany.mock.calls[0][0].where).toEqual({ sellerId: "s1" });
    });

    it("records a reply as coming from the shop", async () => {
      const create = jest.fn().mockResolvedValue({ id: "m1" });
      const prisma = {
        supportThread: {
          findUnique: jest.fn().mockResolvedValue({ id: "t1", sellerId: "s1" }),
          update: jest.fn(),
        },
        seller: { findUnique: jest.fn().mockResolvedValue({ userId: "owner1" }) },
        supportMessage: { create },
        $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => [await ops[0]]),
      };

      await chatFor(prisma).shopReplyToThread("s1", "t1", "Уже собираем");

      // The customer's app renders the two sides from senderRole, so it is taken from who the key
      // belongs to and never from the request body.
      expect(create.mock.calls[0][0].data).toMatchObject({
        senderRole: "SELLER",
        authorId: "owner1",
        readByCustomer: false,
      });
    });

    it("refuses a thread that belongs to another shop", async () => {
      const prisma = {
        supportThread: { findUnique: jest.fn().mockResolvedValue({ id: "t1", sellerId: "other" }) },
      };

      await expect(chatFor(prisma).shopReplyToThread("s1", "t1", "привет")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

describe("ShopKeyGuard", () => {
  const guard = new ShopKeyGuard();
  const contextWith = (apiKey: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ apiKey }) }) }) as never;

  it("passes a key that belongs to a shop", () => {
    expect(guard.canActivate(contextWith({ id: "k1", sellerId: "s1" }))).toBe(true);
  });

  it("refuses a partner key", () => {
    // A partner key reaching sellerId null would make every query below mean "products with no
    // shop" -- the house stock.
    expect(() => guard.canActivate(contextWith({ id: "k1", sellerId: null }))).toThrow(
      ForbiddenException,
    );
  });
});

describe("a shop issuing its own keys", () => {
  it("fixes the key to the caller's shop and labels it with the shop's real name", async () => {
    const create = jest.fn().mockResolvedValue({ id: "k1" });
    const prisma = {
      apiKey: { count: jest.fn().mockResolvedValue(0), create },
      seller: { findUnique: jest.fn().mockResolvedValue({ shopName: "Гульбахар" }) },
    };

    const made = await keysFor(prisma).createForSeller("s1", "owner1", { name: "Мой сайт" });

    const data = create.mock.calls[0][0].data;
    expect(data.sellerId).toBe("s1");
    // Not the seller's to write: this label sits beside their traffic in the admin console, and a
    // free-text field there would let a shop label itself as somebody else.
    expect(data.ownerLabel).toBe("Гульбахар");
    expect(made.rawKey).toMatch(/^sk_shop_[0-9a-f]{48}$/);
  });

  it("issues a read-only key when nobody said otherwise", async () => {
    const create = jest.fn().mockResolvedValue({ id: "k1" });
    const prisma = {
      apiKey: { count: jest.fn().mockResolvedValue(0), create },
      seller: { findUnique: jest.fn().mockResolvedValue({ shopName: "X" }) },
    };

    await keysFor(prisma).createForSeller("s1", "owner1", { name: "Сайт" });

    expect(create.mock.calls[0][0].data.scopes).toEqual(["products:read"]);
  });

  it("will not let a shop mint itself a partner key", async () => {
    // The dto rejects these too. Twice on purpose: this is the boundary deciding what a token
    // issued by a customer of ours can reach.
    const create = jest.fn().mockResolvedValue({ id: "k1" });
    const prisma = {
      apiKey: { count: jest.fn().mockResolvedValue(0), create },
      seller: { findUnique: jest.fn().mockResolvedValue({ shopName: "X" }) },
    };

    await keysFor(prisma).createForSeller("s1", "owner1", {
      name: "Сайт",
      scopes: ["catalog:read", "orders:write", "products:write"],
    });

    expect(create.mock.calls[0][0].data.scopes).toEqual(["products:write"]);
  });

  it("caps how many a shop may hold", async () => {
    const prisma = { apiKey: { count: jest.fn().mockResolvedValue(10), create: jest.fn() } };

    await expect(
      keysFor(prisma).createForSeller("s1", "owner1", { name: "Ещё один" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("answers another shop's key exactly as a missing one", async () => {
    const prisma = { apiKey: { findUnique: jest.fn().mockResolvedValue({ id: "k1", sellerId: "other" }) } };

    await expect(keysFor(prisma).setEnabledForSeller("s1", "k1", false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(keysFor(prisma).removeForSeller("s1", "k1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("drops the cached quota when a key is disabled, so it stops working now", async () => {
    const forget = jest.fn();
    const prisma = {
      apiKey: {
        findUnique: jest.fn().mockResolvedValue({ id: "k1", sellerId: "s1" }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    await keysFor(prisma, { forget }).setEnabledForSeller("s1", "k1", false);

    expect(forget).toHaveBeenCalledWith("k1");
  });

  it("offers a seller only the shop scopes", () => {
    // If this list ever gains a scope reaching outside the shop, the cap above stops meaning
    // what its comment says.
    expect([...SHOP_SCOPES]).toEqual([
      "products:read",
      "products:write",
      "shop-orders:read",
      "shop-orders:write",
      "chat:read",
      "chat:write",
    ]);
  });
});
