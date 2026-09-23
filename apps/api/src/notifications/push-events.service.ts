import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";
import { PushMessage } from "./push-message";

type Copy = { ru: string; en: string; tkm: string };
type Locale = keyof Copy;

const BRAND_LOGO = "https://gulyaly.com/brand/gulyaly-logo-512.png";
const PREVIEW_MAX = 120;

function pick(copy: Copy, locale: string | null | undefined): string {
  return copy[(locale as Locale) in copy ? (locale as Locale) : "ru"];
}

function preview(text: string | null | undefined, attachment?: string | null): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean) return clean.length > PREVIEW_MAX ? `${clean.slice(0, PREVIEW_MAX - 1)}…` : clean;
  return attachment ? "📎" : "";
}

function displayName(user: { fullName: string | null; username: string | null } | null | undefined): string {
  return user?.fullName?.trim() || user?.username || "Gulyaly";
}

const conversationRoute = (kind: "room" | "thread", id: string) =>
  `/chats/c/${encodeURIComponent(`${kind}:${id}`)}`;

// Statuses worth interrupting someone for. Intermediate ones (DRAFT, QUOTE_CREATED, PAID ...) are
// things the person just did themselves, so a push for them is noise.
const SHIPMENT_COPY: Record<string, { title: Copy; body: Copy }> = {
  PICKED_UP: {
    title: { ru: "Посылка забрана", en: "Parcel picked up", tkm: "Bukja alyndy" },
    body: { ru: "Курьер забрал вашу посылку.", en: "The courier has collected your parcel.", tkm: "Kurýer bukjaňyzy aldy." },
  },
  IN_TRANSIT: {
    title: { ru: "Посылка в пути", en: "Parcel in transit", tkm: "Bukja ýolda" },
    body: { ru: "Ваша посылка отправлена и в пути.", en: "Your parcel is on its way.", tkm: "Bukjaňyz ugradyldy we ýolda." },
  },
  ARRIVED_DESTINATION: {
    title: { ru: "Посылка прибыла", en: "Parcel arrived", tkm: "Bukja geldi" },
    body: { ru: "Посылка прибыла в пункт назначения.", en: "Your parcel reached its destination.", tkm: "Bukja barmaly ýerine geldi." },
  },
  READY_FOR_PICKUP: {
    title: { ru: "Можно забирать", en: "Ready for pickup", tkm: "Almaga taýyn" },
    body: { ru: "Посылку можно забрать в пункте выдачи.", en: "Your parcel is ready to be collected.", tkm: "Bukjany berlýän ýerden alyp bolýar." },
  },
  OUT_FOR_DELIVERY: {
    title: { ru: "Курьер уже едет", en: "Out for delivery", tkm: "Kurýer ýolda" },
    body: { ru: "Курьер везёт вашу посылку.", en: "A courier is delivering your parcel.", tkm: "Kurýer bukjaňyzy getirýär." },
  },
  DELIVERED: {
    title: { ru: "Посылка доставлена", en: "Parcel delivered", tkm: "Bukja gowşuryldy" },
    body: { ru: "Доставка завершена. Спасибо!", en: "Delivery complete. Thank you!", tkm: "Eltip bermek tamamlandy. Sag boluň!" },
  },
  ON_HOLD: {
    title: { ru: "Доставка приостановлена", en: "Delivery on hold", tkm: "Eltip bermek togtadyldy" },
    body: { ru: "Подробности в приложении.", en: "Details are in the app.", tkm: "Jikme-jiklikler programmada." },
  },
  EXCEPTION: {
    title: { ru: "Проблема с доставкой", en: "Delivery problem", tkm: "Eltip bermekde päsgelçilik" },
    body: { ru: "Нужно ваше внимание. Откройте приложение.", en: "It needs your attention. Open the app.", tkm: "Siziň üns bermegiňiz gerek. Programmany açyň." },
  },
};

const GALLERY_COPY: Record<string, { title: Copy; body: (product: string) => Copy }> = {
  PROCESSING: {
    title: { ru: "Заказ принят в работу", en: "Order in progress", tkm: "Sargyt işe alyndy" },
    body: (p) => ({ ru: `«${p}» готовится к доставке.`, en: `“${p}” is being prepared.`, tkm: `«${p}» eltmäge taýýarlanýar.` }),
  },
  DELIVERED: {
    title: { ru: "Заказ доставлен", en: "Order delivered", tkm: "Sargyt gowşuryldy" },
    body: (p) => ({ ru: `«${p}» доставлен получателю.`, en: `“${p}” was delivered.`, tkm: `«${p}» alyja gowşuryldy.` }),
  },
  CANCELLED: {
    title: { ru: "Заказ отменён", en: "Order cancelled", tkm: "Sargyt ýatyryldy" },
    body: (p) => ({ ru: `Заказ «${p}» отменён.`, en: `Your order “${p}” was cancelled.`, tkm: `«${p}» sargydy ýatyryldy.` }),
  },
};

/**
 * Every "something happened to you" push in one place: the recipient, the wording, the picture
 * and the in-app route for each part of the product. Product code calls a single method after its
 * own write succeeds; nothing here throws, so a push problem can never fail the request.
 */
@Injectable()
export class PushEventsService {
  private readonly logger = new Logger(PushEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async safely(label: string, work: () => Promise<void>) {
    try {
      await work();
    } catch (err) {
      this.logger.warn(`Push event ${label} failed: ${err instanceof Error ? err.constructor.name : "error"}`);
    }
  }

  // ---- Chat: groups and channels ----

  /** A new message in a group or channel goes to every other member. */
  async roomMessage(roomId: string, authorId: string, body: string | null, attachmentUrl?: string | null) {
    await this.safely("room", async () => {
      const room = await this.prisma.chatRoom.findUnique({
        where: { id: roomId },
        select: {
          title: true,
          kind: true,
          imageUrl: true,
          members: { where: { userId: { not: authorId } }, select: { userId: true } },
        },
      });
      if (!room || room.members.length === 0) return;
      const author = await this.prisma.user.findUnique({
        where: { id: authorId },
        select: { fullName: true, username: true, avatarPath: true },
      });
      const text = preview(body, attachmentUrl);
      const message: PushMessage = {
        category: "chat",
        title: room.title,
        // A channel has one voice, so its posts read as the channel's own; in a group the reader
        // needs to know who is speaking.
        body: room.kind === "CHANNEL" ? text : `${displayName(author)}: ${text}`,
        route: conversationRoute("room", roomId),
        imageUrl: room.imageUrl ?? author?.avatarPath ?? undefined,
        tag: `room:${roomId}`,
      };
      await this.notifications.notifyMany(
        room.members.map((m) => m.userId),
        message,
      );
    });
  }

  // ---- Chat: one-to-one with a shop, and platform support ----

  /**
   * A message in a support thread reaches the other side. `fromCustomer` says who wrote:
   * customer -> the shop's owner (a thread with no shop is platform support and has no one to push
   * to; staff read those in the admin console); shop or staff -> the customer.
   */
  async threadMessage(threadId: string, fromCustomer: boolean, body: string | null, attachmentUrl?: string | null) {
    await this.safely("thread", async () => {
      const thread = await this.prisma.supportThread.findUnique({
        where: { id: threadId },
        select: {
          userId: true,
          sellerId: true,
          user: { select: { fullName: true, username: true, avatarPath: true } },
          seller: { select: { shopName: true, logoUrl: true, userId: true } },
        },
      });
      if (!thread) return;
      const text = preview(body, attachmentUrl);
      const route = conversationRoute("thread", threadId);

      if (fromCustomer) {
        if (!thread.seller) return;
        await this.notifications.notify(thread.seller.userId, {
          category: "chat",
          title: displayName(thread.user),
          body: text,
          route,
          imageUrl: thread.user.avatarPath ?? undefined,
          tag: `thread:${threadId}`,
        });
        return;
      }

      if (thread.seller) {
        await this.notifications.notify(thread.userId, {
          category: "chat",
          title: thread.seller.shopName,
          body: text,
          route,
          imageUrl: thread.seller.logoUrl ?? undefined,
          tag: `thread:${threadId}`,
        });
      } else {
        await this.notifications.notify(thread.userId, {
          category: "support",
          title: "Gulyaly",
          body: text,
          route,
          imageUrl: BRAND_LOGO,
          tag: `thread:${threadId}`,
        });
      }
    });
  }

  // ---- Bouquets / gallery ----

  /** The buyer's order moved on. */
  async galleryOrderStatus(orderId: string) {
    await this.safely("gallery-status", async () => {
      const order = await this.prisma.galleryOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          userId: true,
          user: { select: { locale: true } },
          product: { select: { name: true, imageUrl: true } },
        },
      });
      const copy = order && GALLERY_COPY[order.status];
      if (!order || !copy) return;
      const locale = order.user?.locale;
      await this.notifications.notify(order.userId, {
        category: "gallery",
        title: pick(copy.title, locale),
        body: pick(copy.body(order.product.name), locale),
        route: "/gallery",
        imageUrl: order.product.imageUrl,
        tag: `gallery:${order.id}`,
        data: { galleryOrderId: order.id },
      });
    });
  }

  /** A new order for a shop's product goes to the shop's owner. */
  async galleryOrderCreated(orderId: string) {
    await this.safely("gallery-new", async () => {
      const order = await this.prisma.galleryOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          product: { select: { name: true, imageUrl: true, seller: { select: { userId: true } } } },
        },
      });
      const ownerId = order?.product.seller?.userId;
      if (!order || !ownerId) return;
      await this.notifications.notify(ownerId, {
        category: "gallery",
        title: "Новый заказ",
        body: `«${order.product.name}»`,
        route: "/home",
        imageUrl: order.product.imageUrl,
        tag: `gallery-new:${order.id}`,
      });
    });
  }

  // ---- Cargo ----

  async shipmentStatus(shipmentId: string) {
    await this.safely("shipment", async () => {
      const shipment = await this.prisma.shipment.findUnique({
        where: { id: shipmentId },
        select: { id: true, status: true, userId: true, user: { select: { locale: true } } },
      });
      const copy = shipment && SHIPMENT_COPY[shipment.status];
      if (!shipment || !copy) return;
      await this.notifications.notify(shipment.userId, {
        category: "cargo",
        title: pick(copy.title, shipment.user?.locale),
        body: pick(copy.body, shipment.user?.locale),
        route: `/home/cargo/shipments/${shipment.id}`,
        imageUrl: BRAND_LOGO,
        tag: `shipment:${shipment.id}`,
      });
    });
  }

  // ---- Feed ----

  /** Someone commented on a post: tell its author (never about their own comment). */
  async feedComment(postId: string, commenterId: string, body: string) {
    await this.safely("feed-comment", async () => {
      const post = await this.prisma.socialPost.findUnique({
        where: { id: postId },
        select: { authorId: true, thumbnailUrl: true },
      });
      if (!post || post.authorId === commenterId) return;
      const commenter = await this.prisma.user.findUnique({
        where: { id: commenterId },
        select: { fullName: true, username: true, avatarPath: true },
      });
      await this.notifications.notify(post.authorId, {
        category: "feed",
        title: displayName(commenter),
        body: `💬 ${preview(body)}`,
        route: "/feed",
        imageUrl: commenter?.avatarPath ?? post.thumbnailUrl ?? undefined,
        tag: `feed:${postId}`,
        data: { postId },
      });
    });
  }

  /** Someone liked a post. */
  async feedLike(postId: string, likerId: string) {
    await this.safely("feed-like", async () => {
      const post = await this.prisma.socialPost.findUnique({
        where: { id: postId },
        select: { authorId: true, author: { select: { locale: true } } },
      });
      if (!post || post.authorId === likerId) return;
      const liker = await this.prisma.user.findUnique({
        where: { id: likerId },
        select: { fullName: true, username: true, avatarPath: true },
      });
      await this.notifications.notify(post.authorId, {
        category: "feed",
        title: displayName(liker),
        body: pick(
          { ru: "❤️ Нравится ваша публикация", en: "❤️ Likes your post", tkm: "❤️ Paýlaşygyňyz ýaraýar" },
          post.author?.locale,
        ),
        route: "/feed",
        imageUrl: liker?.avatarPath ?? undefined,
        tag: `feed-like:${postId}`,
        data: { postId },
      });
    });
  }
}
