import { PushEventsService } from "./push-events.service";

function setup() {
  const prisma = {
    chatRoom: { findUnique: jest.fn() },
    supportThread: { findUnique: jest.fn() },
    galleryOrder: { findUnique: jest.fn() },
    shipment: { findUnique: jest.fn() },
    socialPost: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined), notifyMany: jest.fn().mockResolvedValue(undefined) };
  const service = new PushEventsService(prisma as never, notifications as never);
  return { prisma, notifications, service };
}

describe("PushEventsService", () => {
  describe("roomMessage", () => {
    it("tells every other member, with the group name, sender and the group picture", async () => {
      const { prisma, notifications, service } = setup();
      prisma.chatRoom.findUnique.mockResolvedValue({
        title: "Friends",
        kind: "GROUP",
        imageUrl: "https://cdn.example/group.png",
        members: [{ userId: "u2" }, { userId: "u3" }],
      });
      prisma.user.findUnique.mockResolvedValue({ fullName: "Aygul", username: "aygul", avatarPath: "a.jpg" });

      await service.roomMessage("room1", "u1", "Hello there", null);

      expect(prisma.chatRoom.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ members: { where: { userId: { not: "u1" } }, select: { userId: true } } }),
        }),
      );
      const [ids, message] = notifications.notifyMany.mock.calls[0];
      expect(ids).toEqual(["u2", "u3"]);
      expect(message).toMatchObject({
        category: "chat",
        title: "Friends",
        body: "Aygul: Hello there",
        route: "/chats/c/room%3Aroom1",
        imageUrl: "https://cdn.example/group.png",
        tag: "room:room1",
      });
    });

    it("reads a channel post as the channel's own voice and falls back to the author's avatar", async () => {
      const { prisma, notifications, service } = setup();
      prisma.chatRoom.findUnique.mockResolvedValue({ title: "News", kind: "CHANNEL", imageUrl: null, members: [{ userId: "u2" }] });
      prisma.user.findUnique.mockResolvedValue({ fullName: null, username: "shop", avatarPath: "s.jpg" });

      await service.roomMessage("room2", "u1", "Sale today", null);

      expect(notifications.notifyMany.mock.calls[0][1]).toMatchObject({ body: "Sale today", imageUrl: "s.jpg" });
    });

    it("does nothing when nobody else is in the room", async () => {
      const { prisma, notifications, service } = setup();
      prisma.chatRoom.findUnique.mockResolvedValue({ title: "Solo", kind: "GROUP", imageUrl: null, members: [] });
      await service.roomMessage("room3", "u1", "hi", null);
      expect(notifications.notifyMany).not.toHaveBeenCalled();
    });

    it("shows a paperclip for an attachment without a caption", async () => {
      const { prisma, notifications, service } = setup();
      prisma.chatRoom.findUnique.mockResolvedValue({ title: "Friends", kind: "GROUP", imageUrl: null, members: [{ userId: "u2" }] });
      prisma.user.findUnique.mockResolvedValue({ fullName: "Aygul", username: null, avatarPath: null });
      await service.roomMessage("r", "u1", "", "https://cdn.example/photo.jpg");
      expect(notifications.notifyMany.mock.calls[0][1].body).toBe("Aygul: 📎");
    });
  });

  describe("threadMessage", () => {
    const thread = {
      userId: "customer",
      sellerId: "s1",
      user: { fullName: "Aygul", username: "aygul", avatarPath: "a.jpg" },
      seller: { shopName: "Flowers", logoUrl: "https://cdn.example/shop.png", userId: "owner" },
    };

    it("a customer's message reaches the shop owner with the customer's avatar", async () => {
      const { prisma, notifications, service } = setup();
      prisma.supportThread.findUnique.mockResolvedValue(thread);
      await service.threadMessage("t1", true, "Is it in stock?");
      expect(notifications.notify).toHaveBeenCalledWith(
        "owner",
        expect.objectContaining({ category: "chat", title: "Aygul", imageUrl: "a.jpg", route: "/chats/c/thread%3At1" }),
      );
    });

    it("a shop's reply reaches the customer with the shop logo", async () => {
      const { prisma, notifications, service } = setup();
      prisma.supportThread.findUnique.mockResolvedValue(thread);
      await service.threadMessage("t1", false, "Yes!");
      expect(notifications.notify).toHaveBeenCalledWith(
        "customer",
        expect.objectContaining({ category: "chat", title: "Flowers", imageUrl: "https://cdn.example/shop.png" }),
      );
    });

    it("platform support replies use the support channel and the Gulyaly logo", async () => {
      const { prisma, notifications, service } = setup();
      prisma.supportThread.findUnique.mockResolvedValue({ ...thread, sellerId: null, seller: null });
      await service.threadMessage("t2", false, "We are looking into it");
      expect(notifications.notify).toHaveBeenCalledWith(
        "customer",
        expect.objectContaining({ category: "support", title: "Gulyaly", imageUrl: expect.stringContaining("gulyaly-logo") }),
      );
    });

    it("a customer writing to platform support notifies nobody", async () => {
      const { prisma, notifications, service } = setup();
      prisma.supportThread.findUnique.mockResolvedValue({ ...thread, sellerId: null, seller: null });
      await service.threadMessage("t2", true, "Help");
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe("galleryOrderStatus", () => {
    it("tells the buyer with the product picture, in their language", async () => {
      const { prisma, notifications, service } = setup();
      prisma.galleryOrder.findUnique.mockResolvedValue({
        id: "g1",
        status: "DELIVERED",
        userId: "buyer",
        user: { locale: "en" },
        product: { name: "Red roses", imageUrl: "https://cdn.example/roses.png" },
      });
      await service.galleryOrderStatus("g1");
      expect(notifications.notify).toHaveBeenCalledWith(
        "buyer",
        expect.objectContaining({
          category: "gallery",
          title: "Order delivered",
          imageUrl: "https://cdn.example/roses.png",
          tag: "gallery:g1",
        }),
      );
    });

    it("stays quiet for statuses the buyer caused themselves", async () => {
      const { prisma, notifications, service } = setup();
      prisma.galleryOrder.findUnique.mockResolvedValue({ id: "g1", status: "PENDING_PAYMENT", userId: "b", user: null, product: { name: "x", imageUrl: "y" } });
      await service.galleryOrderStatus("g1");
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe("shipmentStatus", () => {
    it("pushes meaningful transitions and routes to the shipment", async () => {
      const { prisma, notifications, service } = setup();
      prisma.shipment.findUnique.mockResolvedValue({ id: "sh1", status: "IN_TRANSIT", userId: "u1", user: { locale: "ru" } });
      await service.shipmentStatus("sh1");
      expect(notifications.notify).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({ category: "cargo", title: "Посылка в пути", route: "/home/cargo/shipments/sh1" }),
      );
    });

    it("ignores internal statuses", async () => {
      const { prisma, notifications, service } = setup();
      prisma.shipment.findUnique.mockResolvedValue({ id: "sh1", status: "QUOTE_CREATED", userId: "u1", user: null });
      await service.shipmentStatus("sh1");
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe("feed", () => {
    it("never notifies a person about their own like or comment", async () => {
      const { prisma, notifications, service } = setup();
      prisma.socialPost.findUnique.mockResolvedValue({ authorId: "u1", author: { locale: "ru" }, thumbnailUrl: null });
      await service.feedLike("p1", "u1");
      await service.feedComment("p1", "u1", "nice");
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it("tells the author who commented, with the commenter's avatar", async () => {
      const { prisma, notifications, service } = setup();
      prisma.socialPost.findUnique.mockResolvedValue({ authorId: "author", thumbnailUrl: "thumb.jpg" });
      prisma.user.findUnique.mockResolvedValue({ fullName: "Aygul", username: null, avatarPath: "a.jpg" });
      await service.feedComment("p1", "u2", "Great post");
      expect(notifications.notify).toHaveBeenCalledWith(
        "author",
        expect.objectContaining({ category: "feed", title: "Aygul", body: "💬 Great post", imageUrl: "a.jpg" }),
      );
    });
  });

  it("never throws, whatever goes wrong underneath", async () => {
    const { prisma, service } = setup();
    prisma.chatRoom.findUnique.mockRejectedValue(new Error("db down"));
    prisma.supportThread.findUnique.mockRejectedValue(new Error("db down"));
    await expect(service.roomMessage("r", "u", "x")).resolves.toBeUndefined();
    await expect(service.threadMessage("t", true, "x")).resolves.toBeUndefined();
  });
});
