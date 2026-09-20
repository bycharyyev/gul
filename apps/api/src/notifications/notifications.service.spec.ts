import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import type { PushMessage } from "./push-message";

const message: PushMessage = {
  category: "orders",
  title: "Test",
  body: "Hello",
  route: "/home",
};

describe("NotificationsService", () => {
  const pushToken = {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  };
  const order = { findUnique: jest.fn() };
  const pushDelivery = { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() };
  const prisma = { pushToken, order, pushDelivery } as never;
  const firebase = { enabled: true, send: jest.fn() };
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    pushToken.findMany.mockResolvedValue([]);
    pushDelivery.create.mockResolvedValue({ id: "delivery-1" });
    pushDelivery.update.mockResolvedValue({});
    firebase.enabled = true;
    service = new NotificationsService(prisma, firebase as never);
  });

  describe("device registration", () => {
    it("upserts a device so repeated registration stays idempotent", async () => {
      pushToken.upsert.mockResolvedValue({ id: "device-1" });

      await service.register("user-1", "token-token-token-token", "ANDROID");
      await service.register("user-1", "token-token-token-token", "ANDROID");

      expect(pushToken.upsert).toHaveBeenCalledTimes(2);
      expect(pushToken.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { token: "token-token-token-token" } }),
      );
    });

    it("re-binds a token to the user who registers it on this device", async () => {
      pushToken.upsert.mockResolvedValue({ id: "device-1" });

      await service.register("user-2", "token-token-token-token", "IOS");

      expect(pushToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ userId: "user-2" }),
          update: expect.objectContaining({ userId: "user-2", platform: "IOS" }),
        }),
      );
    });

    it("drops the oldest registrations beyond ten devices per user", async () => {
      pushToken.upsert.mockResolvedValue({ id: "device-11" });
      pushToken.findMany.mockResolvedValue([{ id: "old-1" }, { id: "old-2" }]);
      pushToken.deleteMany.mockResolvedValue({ count: 2 });

      await service.register("user-1", "token-token-token-token", "ANDROID");

      expect(pushToken.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, orderBy: { lastSeenAt: "desc" } }),
      );
      expect(pushToken.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["old-1", "old-2"] } },
      });
    });

    it("only removes a token owned by the current user", async () => {
      pushToken.deleteMany.mockResolvedValue({ count: 1 });
      await expect(
        service.remove("user-1", "token-token-token-token"),
      ).resolves.toEqual({ removed: true });
      expect(pushToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1", token: "token-token-token-token" },
      });
    });
  });

  describe("sendToUser", () => {
    it("sends to every registered device and reports delivery counts", async () => {
      pushToken.findMany.mockResolvedValue([{ token: "a" }, { token: "b" }]);
      firebase.send.mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        responses: [{ success: true }, { success: true }],
      });

      await expect(service.sendToUser("user-1", message)).resolves.toMatchObject({
        requested: 2,
        delivered: 2,
        failed: 0,
      });
    });

    it("sends Android a data-only message the app can draw itself", async () => {
      pushToken.findMany.mockResolvedValue([{ token: "a" }]);
      firebase.send.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      await service.sendToUser("user-1", {
        ...message,
        category: "chat",
        imageUrl: "/api/avatar/a.jpg",
        tag: "room:1",
      });

      const payload = firebase.send.mock.calls[0][0];
      expect(payload.notification).toBeUndefined();
      expect(payload.data).toMatchObject({
        category: "chat",
        title: "Test",
        route: "/home",
        tag: "room:1",
        imageUrl: "https://api.gulyaly.com/api/avatar/a.jpg",
      });
      expect(payload.apns.payload.aps.mutableContent).toBe(true);
    });

    it("records every push and puts its id inside the message so a tap can be counted", async () => {
      pushToken.findMany.mockResolvedValue([{ token: "a" }, { token: "b" }]);
      firebase.send.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        responses: [{ success: true }, { success: false, error: { code: "messaging/internal-error" } }],
      });

      const result = await service.sendToUser("user-1", message, { campaignId: "camp-1" });

      expect(pushDelivery.create).toHaveBeenCalledWith({
        data: { userId: "user-1", campaignId: "camp-1", category: "orders", devices: 2 },
        select: { id: true },
      });
      expect(firebase.send.mock.calls[0][0].data.deliveryId).toBe("delivery-1");
      expect(pushDelivery.update).toHaveBeenCalledWith({ where: { id: "delivery-1" }, data: { accepted: 1 } });
      expect(result).toMatchObject({ requested: 2, delivered: 1, failed: 1, deliveryId: "delivery-1" });
    });

    it("writes nothing for a person with no devices", async () => {
      pushToken.findMany.mockResolvedValue([]);
      await service.sendToUser("user-1", message);
      expect(pushDelivery.create).not.toHaveBeenCalled();
    });

    it("refuses a route that leaves the app", async () => {
      pushToken.findMany.mockResolvedValue([{ token: "a" }]);
      for (const route of ["https://evil.example", "//evil.example", "orders"]) {
        await expect(
          service.sendToUser("user-1", { ...message, route }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(firebase.send).not.toHaveBeenCalled();
    });

    it("removes tokens rejected by FCM without logging token values", async () => {
      pushToken.findMany.mockResolvedValue([
        { token: "expired" },
        { token: "healthy" },
      ]);
      pushToken.deleteMany.mockResolvedValue({ count: 1 });
      firebase.send.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        responses: [
          {
            success: false,
            error: { code: "messaging/registration-token-not-registered" },
          },
          { success: true },
        ],
      });

      await service.sendToUser("user-1", message);
      expect(pushToken.deleteMany).toHaveBeenCalledWith({
        where: { token: { in: ["expired"] } },
      });
    });

    it("sends in batches of 500 tokens", async () => {
      const many = Array.from({ length: 501 }, (_, i) => ({ token: `t${i}` }));
      pushToken.findMany.mockResolvedValue(many);
      firebase.send.mockImplementation((_message: unknown, tokens: string[]) =>
        Promise.resolve({
          successCount: tokens.length,
          failureCount: 0,
          responses: tokens.map(() => ({ success: true })),
        }),
      );

      await expect(service.sendToUser("user-1", message)).resolves.toMatchObject({
        requested: 501,
        delivered: 501,
        failed: 0,
      });
      expect(firebase.send).toHaveBeenCalledTimes(2);
      expect(firebase.send.mock.calls[0][1]).toHaveLength(500);
      expect(firebase.send.mock.calls[1][1]).toHaveLength(1);
    });

    it("rejects non-string data values before calling FCM", async () => {
      pushToken.findMany.mockResolvedValue([{ token: "a" }]);
      await expect(
        service.sendToUser("user-1", { ...message, data: { orderId: 5 } as never }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(firebase.send).not.toHaveBeenCalled();
    });

    it("fails closed when Firebase credentials are unavailable", async () => {
      firebase.enabled = false;
      await expect(
        service.sendToUser("user-1", message),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(pushToken.findMany).not.toHaveBeenCalled();
    });
  });

  describe("markOpened", () => {
    it("counts only the person's own delivery, and only the first tap", async () => {
      pushDelivery.updateMany.mockResolvedValue({ count: 1 });
      await expect(service.markOpened("user-1", "delivery-1")).resolves.toEqual({ opened: true });
      expect(pushDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: "delivery-1", userId: "user-1", openedAt: null },
        data: { openedAt: expect.any(Date) },
      });

      pushDelivery.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.markOpened("user-1", "delivery-1")).resolves.toEqual({ opened: false });
    });
  });

  describe("notify", () => {
    it("never throws when Firebase fails", async () => {
      pushToken.findMany.mockResolvedValue([{ token: "a" }]);
      firebase.send.mockRejectedValue(new Error("fcm down"));
      await expect(service.notify("user-1", message)).resolves.toBeUndefined();
    });

    it("ignores a missing recipient and a disabled gateway", async () => {
      await service.notify(null, message);
      firebase.enabled = false;
      await service.notify("user-1", message);
      expect(pushToken.findMany).not.toHaveBeenCalled();
    });

    it("notifyMany reaches each person once", async () => {
      pushToken.findMany.mockResolvedValue([{ token: "a" }]);
      firebase.send.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });
      await service.notifyMany(["u1", "u2", "u1"], message);
      expect(firebase.send).toHaveBeenCalledTimes(2);
    });
  });

  describe("notifyOrderStatus", () => {
    const completed = {
      id: "order-1",
      status: "COMPLETED",
      userId: "user-1",
      service: { name: "PUBG Mobile UC", logoUrl: "https://cdn.example/pubg.png" },
      user: { locale: "en" },
    };

    beforeEach(() => {
      pushToken.findMany.mockResolvedValue([{ token: "a" }]);
      firebase.send.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });
    });

    it("sends a localized push with the service logo and a route to the order", async () => {
      order.findUnique.mockResolvedValue(completed);

      await service.notifyOrderStatus("order-1");

      expect(pushToken.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
      const { data } = firebase.send.mock.calls[0][0];
      expect(data).toMatchObject({
        category: "orders",
        title: "Order completed",
        route: "/home/orders/detail/order-1",
        orderId: "order-1",
        imageUrl: "https://cdn.example/pubg.png",
        tag: "order:order-1",
      });
    });

    it("keeps personal details off the lock screen", async () => {
      order.findUnique.mockResolvedValue({ ...completed, user: { locale: "ru" } });
      await service.notifyOrderStatus("order-1");
      const { data } = firebase.send.mock.calls[0][0];
      expect(`${data.title} ${data.body}`).not.toMatch(/\d{6,}/);
    });

    it("falls back to Russian for an unknown locale", async () => {
      order.findUnique.mockResolvedValue({ ...completed, user: { locale: "fr" } });
      await service.notifyOrderStatus("order-1");
      expect(firebase.send.mock.calls[0][0].data.title).toBe("Заказ выполнен");
    });

    it("does nothing for an order without an account or a final status", async () => {
      order.findUnique.mockResolvedValueOnce({ ...completed, userId: null });
      await service.notifyOrderStatus("order-1");
      order.findUnique.mockResolvedValueOnce({ ...completed, status: "PROCESSING" });
      await service.notifyOrderStatus("order-1");
      expect(firebase.send).not.toHaveBeenCalled();
    });

    it("never throws when Firebase fails", async () => {
      order.findUnique.mockResolvedValue(completed);
      firebase.send.mockRejectedValue(new Error("fcm down"));
      await expect(service.notifyOrderStatus("order-1")).resolves.toBeUndefined();
    });

    it("does nothing while Firebase is not configured", async () => {
      firebase.enabled = false;
      await service.notifyOrderStatus("order-1");
      expect(order.findUnique).not.toHaveBeenCalled();
    });
  });
});
