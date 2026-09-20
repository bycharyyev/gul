import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";

describe("NotificationsService", () => {
  const pushToken = {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  };
  const order = { findUnique: jest.fn() };
  const prisma = { pushToken, order } as never;
  const firebase = { enabled: true, send: jest.fn() };
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    pushToken.findMany.mockResolvedValue([]);
    firebase.enabled = true;
    service = new NotificationsService(prisma, firebase as never);
  });

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

  it("sends to every registered device and reports delivery counts", async () => {
    pushToken.findMany.mockResolvedValue([{ token: "a" }, { token: "b" }]);
    firebase.send.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });

    await expect(
      service.sendToUser("user-1", { title: "Test", body: "Hello" }),
    ).resolves.toEqual({
      requested: 2,
      delivered: 2,
      failed: 0,
    });
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

    await service.sendToUser("user-1", { title: "Test", body: "Hello" });
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

    await expect(
      service.sendToUser("user-1", { title: "T", body: "B" }),
    ).resolves.toEqual({ requested: 501, delivered: 501, failed: 0 });
    expect(firebase.send).toHaveBeenCalledTimes(2);
    expect(firebase.send.mock.calls[0][1]).toHaveLength(500);
    expect(firebase.send.mock.calls[1][1]).toHaveLength(1);
  });

  it("rejects non-string data values before calling FCM", async () => {
    pushToken.findMany.mockResolvedValue([{ token: "a" }]);
    await expect(
      service.sendToUser("user-1", { title: "T", body: "B" }, {
        route: 5,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(firebase.send).not.toHaveBeenCalled();
  });

  describe("notifyOrderStatus", () => {
    const completed = {
      id: "order-1",
      status: "COMPLETED",
      userId: "user-1",
      service: { name: "Tmcell" },
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

    it("sends a localized push to the order's own user with a route to the order", async () => {
      order.findUnique.mockResolvedValue(completed);

      await service.notifyOrderStatus("order-1");

      expect(pushToken.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
      const message = firebase.send.mock.calls[0][0];
      expect(message.notification.title).toBe("Order completed");
      expect(message.data).toEqual({ route: "/home/orders/detail/order-1", orderId: "order-1" });
    });

    it("keeps personal details off the lock screen", async () => {
      order.findUnique.mockResolvedValue({ ...completed, user: { locale: "ru" } });
      await service.notifyOrderStatus("order-1");
      const { notification } = firebase.send.mock.calls[0][0];
      expect(JSON.stringify(notification)).not.toMatch(/\d{6,}/);
    });

    it("falls back to Russian for an unknown locale", async () => {
      order.findUnique.mockResolvedValue({ ...completed, user: { locale: "fr" } });
      await service.notifyOrderStatus("order-1");
      expect(firebase.send.mock.calls[0][0].notification.title).toBe("Заказ выполнен");
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

  it("fails closed when Firebase credentials are unavailable", async () => {
    firebase.enabled = false;
    await expect(
      service.sendToUser("user-1", { title: "Test", body: "Hello" }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(pushToken.findMany).not.toHaveBeenCalled();
  });
});
