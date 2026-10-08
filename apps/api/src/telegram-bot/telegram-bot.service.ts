import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Telegraf, Markup } from "telegraf";
import { PrismaService } from "../prisma/prisma.service";
import type Redis from "ioredis";
import { runsBackgroundWork } from "../common/app-role";
import { PollingLease, telegrafRunner } from "../common/polling-lease";
import { REDIS_CLIENT } from "../queue/queue.module";

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "🟡 Ожидает оплаты",
  PAID: "🔵 Оплачен",
  PROCESSING: "🟣 В доставке",
  DELIVERED: "🟢 Доставлен",
  CANCELLED: "🔴 Отменён",
};

const NOT_LINKED_MSG =
  "Этот чат ещё не привязан к магазину.\nОткройте панель продавца → «Магазин» → «Подключить Telegram», и перейдите по ссылке оттуда.";

const MENU_KEYBOARD = Markup.keyboard([
  ["💰 Баланс", "📦 Товары"],
  ["🧾 Заказы", "💬 Чаты"],
  ["🏪 Магазин"],
]).resize();

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Telegraf | null = null;
  private lease: PollingLease | null = null;

  constructor(
    private prisma: PrismaService,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.logger.warn("TELEGRAM_BOT_TOKEN not set — seller bot disabled");
      return;
    }
    const bot = new Telegraf(token);
    // Without this, an exception thrown inside any handler below (a bad Prisma query, a Telegram
    // API hiccup) is unhandled at the process level -- since this bot runs inside the same
    // process as the whole API, that could take the entire API down over a bug in one bot
    // command, not just this one update. Telegraf routes every handler error here instead of
    // letting it propagate.
    bot.catch((err, ctx) => {
      this.logger.error(`Unhandled error in Telegram handler (update ${ctx.update.update_id})`, err instanceof Error ? err.stack : err);
    });
    this.registerHandlers(bot);
    // Set regardless of whether this node polls below: notifySeller/notifyAdmin just call
    // bot.telegram.sendMessage, a stateless API call that works the same from every replica.
    this.bot = bot;

    // Long-polling (getUpdates) only ever has one live consumer per bot token -- Telegram kills
    // whichever instance asks second with 409 Conflict. api runs active/active (both primary and
    // secondary), so unconditionally calling launch() here meant one node's poller died within
    // seconds of boot every single deploy, and inbound commands (/start shop-linking, /unlink,
    // this /chatid) worked only by accident, on whichever node happened to win that race -- with
    // no retry. TELEGRAM_BOT_POLLING="true" marks a node eligible (both nodes, see deploy.yml); the
    // lease below picks the one process that polls.
    // Never from an APP_ROLE=http process (ADR 0008): there may be several on one node, and the
    // second long-poller on a token is killed by Telegram with 409.
    if (process.env.TELEGRAM_BOT_POLLING !== "true" || !runsBackgroundWork()) {
      this.logger.log("Telegram bot: outbound-only on this node (TELEGRAM_BOT_POLLING unset)");
      return;
    }
    // Eligible only; which eligible process actually polls is a Redis lease (common/polling-lease.ts),
    // so the bots keep answering when the node that was polling goes down.
    this.lease = new PollingLease(
      this.redis,
      "lease:telegram-polling:seller",
      telegrafRunner(bot, this.logger, "Telegram seller bot"),
      this.logger,
    );
    this.lease.begin();
  }

  async onModuleDestroy() {
    await this.lease?.end();
    try {
      this.bot?.stop("shutdown");
    } catch {
      // Never launched on this process.
    }
  }

  /** Sends free-form text to the seller's linked chat, if any. Never throws — notification failures must not break the calling flow. */
  async notifySeller(sellerId: string, text: string) {
    if (!this.bot) return;
    const seller = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller?.telegramChatId) return;
    try {
      await this.bot.telegram.sendMessage(seller.telegramChatId, text);
    } catch (err) {
      this.logger.warn(`Failed to notify seller ${sellerId} via Telegram: ${err}`);
    }
  }

  notifyNewOrder(sellerId: string, order: {
    productName: string;
    sku: string;
    amountTmt: number | string;
    recipientName: string;
    recipientPhone: string;
    deliveryCity: string;
    deliveryAddress: string;
    cardMessage?: string | null;
  }) {
    const text = [
      "🆕 Новый заказ!",
      `${order.productName} (Арт. ${order.sku}) · ${order.amountTmt} TMT`,
      "",
      `Получатель: ${order.recipientName}`,
      `Телефон: ${order.recipientPhone}`,
      `Город: ${order.deliveryCity}`,
      `Адрес: ${order.deliveryAddress}`,
      order.cardMessage ? `Текст открытки: ${order.cardMessage}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return this.notifySeller(sellerId, text);
  }

  private registerHandlers(bot: Telegraf) {
    bot.start(async (ctx) => {
      const code = ctx.startPayload?.trim();
      const chatId = String(ctx.chat.id);

      const alreadyLinked = await this.prisma.seller.findUnique({ where: { telegramChatId: chatId } });
      if (alreadyLinked) {
        return ctx.reply(`Этот чат уже привязан к магазину «${alreadyLinked.shopName}».`, MENU_KEYBOARD);
      }

      if (!code) {
        return ctx.reply(
          "Привет! Чтобы привязать магазин, откройте панель продавца на сайте → «Магазин» → «Подключить Telegram».",
        );
      }

      const seller = await this.prisma.seller.findUnique({ where: { telegramLinkCode: code } });
      if (!seller) {
        return ctx.reply("Код недействителен или уже использован. Сгенерируйте новую ссылку в панели продавца.");
      }

      await this.prisma.seller.update({
        where: { id: seller.id },
        data: { telegramChatId: chatId, telegramLinkCode: null },
      });

      return ctx.reply(
        `✅ Магазин «${seller.shopName}» подключён! Теперь сюда будут приходить уведомления о новых заказах.`,
        MENU_KEYBOARD,
      );
    });

    bot.hears("💰 Баланс", async (ctx) => {
      const seller = await this.getSellerByChatId(ctx.chat.id);
      if (!seller) return ctx.reply(NOT_LINKED_MSG);
      ctx.reply(`💰 Баланс магазина «${seller.shopName}»: ${seller.balanceTmt} TMT`);
    });

    bot.hears("📦 Товары", async (ctx) => {
      const seller = await this.getSellerByChatId(ctx.chat.id);
      if (!seller) return ctx.reply(NOT_LINKED_MSG);
      const products = await this.prisma.galleryProduct.findMany({
        where: { sellerId: seller.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      if (!products.length) return ctx.reply("У вас пока нет товаров.");
      const lines = products.map(
        (p) => `${p.isEnabled ? "🟢" : "⚪"} ${p.name}\nАрт. ${p.sku} · ${p.priceTmt} TMT`,
      );
      ctx.reply(`📦 Ваши товары (последние ${products.length}):\n\n${lines.join("\n\n")}`);
    });

    bot.hears("🧾 Заказы", async (ctx) => {
      const seller = await this.getSellerByChatId(ctx.chat.id);
      if (!seller) return ctx.reply(NOT_LINKED_MSG);
      const orders = await this.prisma.galleryOrder.findMany({
        where: { product: { sellerId: seller.id } },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { product: { select: { name: true, sku: true } } },
      });
      if (!orders.length) return ctx.reply("Заказов пока нет.");
      const lines = orders.map(
        (o) =>
          `${STATUS_LABEL[o.status] ?? o.status}\n${o.product.name} (${o.product.sku}) · ${o.amountTmt} TMT\n${o.recipientName}, ${o.deliveryCity} · ${o.recipientPhone}`,
      );
      ctx.reply(`🧾 Последние заказы:\n\n${lines.join("\n\n")}`);
    });

    bot.hears("💬 Чаты", async (ctx) => {
      const seller = await this.getSellerByChatId(ctx.chat.id);
      if (!seller) return ctx.reply(NOT_LINKED_MSG);

      const threads = await this.prisma.supportThread.findMany({
        where: { sellerId: seller.id },
        orderBy: { lastMessageAt: "desc" },
        take: 5,
        include: {
          user: { select: { fullName: true, phone: true, email: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (!threads.length) return ctx.reply("Сообщений от покупателей пока нет.");

      const unreadCounts = await this.prisma.supportMessage.groupBy({
        by: ["threadId"],
        where: { senderRole: "CUSTOMER", readByStaff: false, thread: { sellerId: seller.id } },
        _count: { _all: true },
      });
      const unreadMap = new Map(unreadCounts.map((u) => [u.threadId, u._count._all]));

      const lines = threads.map((t) => {
        const who = t.user.fullName || t.user.phone || t.user.email || "—";
        const last = t.messages[0];
        const unread = unreadMap.get(t.id) ?? 0;
        const preview = last ? last.body.slice(0, 80) : "";
        return `${unread > 0 ? `🔴 ${unread} новых · ` : ""}${who}\n${preview}`;
      });
      ctx.reply(`💬 Последние чаты:\n\n${lines.join("\n\n")}\n\nОтветить можно в панели продавца → «Чаты».`);
    });

    bot.hears("🏪 Магазин", async (ctx) => {
      const seller = await this.getSellerByChatId(ctx.chat.id);
      if (!seller) return ctx.reply(NOT_LINKED_MSG);
      const base = process.env.WEB_PUBLIC_URL ?? "http://localhost:3001";
      ctx.reply(
        [
          `🏪 ${seller.shopName}`,
          `@${seller.handle}`,
          `Ссылка: ${base}/@${seller.handle}`,
          `Статус: ${seller.isEnabled ? "включён ✅" : "выключен ⛔"}`,
        ].join("\n"),
      );
    });

    // Not seller-facing: the one-time step to find this chat's id for ADMIN_TELEGRAM_CHAT_ID
    // (see notifyAdmin above) -- there's no other way to learn a chat's id without it telling you.
    bot.command("chatid", (ctx) => ctx.reply(`Chat ID: ${ctx.chat.id}`));

    bot.command("unlink", async (ctx) => {
      const seller = await this.getSellerByChatId(ctx.chat.id);
      if (!seller) return ctx.reply(NOT_LINKED_MSG);
      await this.prisma.seller.update({ where: { id: seller.id }, data: { telegramChatId: null } });
      ctx.reply("Магазин отключён от этого чата.", Markup.removeKeyboard());
    });
  }

  private getSellerByChatId(chatId: number) {
    return this.prisma.seller.findUnique({ where: { telegramChatId: String(chatId) } });
  }
}
