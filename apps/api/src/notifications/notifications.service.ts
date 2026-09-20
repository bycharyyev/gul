import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PushPlatform } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FirebasePushGateway } from "./firebase-push.gateway";
import { absoluteImageUrl } from "./image-url";
import { PushMessage, toFcmMessage } from "./push-message";

type OrderPushCopy = { title: string; body: (service: string) => string };

// Lock-screen text: deliberately no phone number, amount or account id -- anyone holding the
// phone can read it. The order screen behind the tap has the details.
const ORDER_PUSH_COPY: Record<"COMPLETED" | "FAILED", Record<string, OrderPushCopy>> = {
  COMPLETED: {
    ru: { title: "Заказ выполнен", body: (s) => `Пополнение «${s}» выполнено.` },
    en: { title: "Order completed", body: (s) => `Your ${s} top-up is complete.` },
    tkm: { title: "Sargyt ýerine ýetirildi", body: (s) => `«${s}» dolduryşy tamamlandy.` },
  },
  FAILED: {
    ru: { title: "Заказ не выполнен", body: (s) => `Не удалось выполнить заказ «${s}». Подробности в приложении.` },
    en: { title: "Order failed", body: (s) => `We could not complete your ${s} order. Details are in the app.` },
    tkm: { title: "Sargyt ýerine ýetirilmedi", body: (s) => `«${s}» sargydy ýerine ýetirilmedi. Jikme-jiklikler programmada.` },
  },
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

// FCM accepts at most 500 tokens per multicast request.
const FCM_BATCH_SIZE = 500;
// A person with more than a handful of live installs is either reinstalling constantly or
// abusing the endpoint; the oldest registrations are the ones FCM has most likely already retired.
const MAX_DEVICES_PER_USER = 10;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebasePushGateway,
  ) {}

  async register(userId: string, token: string, platform: PushPlatform) {
    const device = await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
      select: { id: true, platform: true, createdAt: true, lastSeenAt: true },
    });
    await this.trimOldDevices(userId);
    return device;
  }

  private async trimOldDevices(userId: string) {
    const stale = await this.prisma.pushToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      skip: MAX_DEVICES_PER_USER,
      select: { id: true },
    });
    if (stale.length === 0) return;
    await this.prisma.pushToken.deleteMany({
      where: { id: { in: stale.map((device) => device.id) } },
    });
  }

  async remove(userId: string, token: string) {
    const result = await this.prisma.pushToken.deleteMany({
      where: { userId, token },
    });
    return { removed: result.count > 0 };
  }

  /**
   * Fire-and-forget delivery used by the product code (orders, chat, cargo, ...). Never throws:
   * push is a courtesy on top of the real state change, so a Firebase or database problem must not
   * fail the request or make a retry loop resend an email. `imageUrl` may be any stored picture
   * reference; it is normalised to an absolute https URL here so callers can pass what they have.
   */
  async notify(userId: string | null | undefined, message: PushMessage) {
    if (!userId || !this.firebase.enabled) return;
    try {
      await this.sendToUser(userId, message);
    } catch (err) {
      this.logger.warn(
        `Push (${message.category}) failed: ${err instanceof Error ? err.constructor.name : "error"}`,
      );
    }
  }

  /** Same as {@link notify} for several recipients (a chat room, a shop's staff). */
  async notifyMany(userIds: Iterable<string>, message: PushMessage) {
    for (const userId of new Set(userIds)) await this.notify(userId, message);
  }

  /**
   * Tells the person who placed an order that it finished or failed. Called from the email outbox
   * dispatcher, so every path that completes an order (operator worker, admin override) is
   * covered.
   */
  async notifyOrderStatus(orderId: string) {
    try {
      if (!this.firebase.enabled) return;
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          userId: true,
          service: { select: { name: true, logoUrl: true } },
          user: { select: { locale: true } },
        },
      });
      if (!order?.userId) return;
      if (order.status !== "COMPLETED" && order.status !== "FAILED") return;
      const copies = ORDER_PUSH_COPY[order.status];
      const copy = copies[order.user?.locale ?? "ru"] ?? copies.ru;
      if (!copy) return;
      await this.notify(order.userId, {
        category: "orders",
        title: copy.title,
        body: copy.body(order.service.name),
        route: `/home/orders/detail/${order.id}`,
        imageUrl: order.service.logoUrl ?? undefined,
        tag: `order:${order.id}`,
        data: { orderId: order.id },
      });
    } catch (err) {
      this.logger.warn(`Order push failed for ${orderId}: ${err instanceof Error ? err.constructor.name : "error"}`);
    }
  }

  async sendToUser(userId: string, message: PushMessage, options: { campaignId?: string } = {}) {
    if (!this.firebase.enabled) {
      throw new ServiceUnavailableException(
        "Firebase push delivery is not configured",
      );
    }
    if (!message.route.startsWith("/") || message.route.startsWith("//")) {
      throw new BadRequestException("Push route must be an in-app path");
    }
    if (Object.values(message.data ?? {}).some((value) => typeof value !== "string")) {
      // FCM rejects the whole message when a data value is not a string.
      throw new BadRequestException("Push data values must be strings");
    }
    const devices = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (devices.length === 0) return { requested: 0, delivered: 0, failed: 0 };

    // The row exists before the send so its id can travel inside the push: when the person taps
    // it, the app reports that id back and the statistics know which push was opened.
    const delivery = await this.prisma.pushDelivery.create({
      data: {
        userId,
        campaignId: options.campaignId,
        category: message.category,
        devices: devices.length,
      },
      select: { id: true },
    });
    const payload = toFcmMessage({
      ...message,
      imageUrl: absoluteImageUrl(message.imageUrl),
      data: { ...(message.data ?? {}), deliveryId: delivery.id },
    });

    let delivered = 0;
    let failed = 0;
    const invalid: string[] = [];
    for (let start = 0; start < devices.length; start += FCM_BATCH_SIZE) {
      const batch = devices.slice(start, start + FCM_BATCH_SIZE);
      const response = await this.firebase.send(
        payload,
        batch.map((device) => device.token),
      );
      delivered += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((item, index) => {
        const code = item.error?.code;
        const device = batch[index];
        if (device && code && INVALID_TOKEN_CODES.has(code)) {
          invalid.push(device.token);
        }
      });
    }

    if (invalid.length) {
      await this.prisma.pushToken.deleteMany({
        where: { token: { in: invalid } },
      });
      this.logger.log(`Removed ${invalid.length} invalid push token(s)`);
    }
    await this.prisma.pushDelivery.update({
      where: { id: delivery.id },
      data: { accepted: delivered },
    });
    return { requested: devices.length, delivered, failed, deliveryId: delivery.id };
  }

  /** The person tapped a notification. Only their own delivery counts, and only the first tap. */
  async markOpened(userId: string, deliveryId: string) {
    const result = await this.prisma.pushDelivery.updateMany({
      where: { id: deliveryId, userId, openedAt: null },
      data: { openedAt: new Date() },
    });
    return { opened: result.count > 0 };
  }
}
