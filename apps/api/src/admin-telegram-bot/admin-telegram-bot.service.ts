import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Telegraf } from "telegraf";
import { PrismaService } from "../prisma/prisma.service";

/**
 * A second, dedicated bot (@gulyalybot) for platform-ops notifications -- new orders, Sentry
 * alerts -- kept separate from the seller bot (TelegramBotService, @sellergulyalybot) on purpose.
 * They were briefly the same bot, distinguished only by an "admin_" prefix on the /start payload;
 * that got mixed up once already (a fix meant for this bot's username landed on the seller bot's
 * instead, silently breaking every admin deep link since nothing was polling for @gulyalybot).
 * Two real bots with two real tokens make that class of mistake structurally impossible.
 */
@Injectable()
export class AdminTelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminTelegramBotService.name);
  private bot: Telegraf | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
    if (!token) {
      this.logger.warn("TELEGRAM_ADMIN_BOT_TOKEN not set — admin bot disabled");
      return;
    }
    const bot = new Telegraf(token);
    bot.catch((err, ctx) => {
      this.logger.error(`Unhandled error in admin bot handler (update ${ctx.update.update_id})`, err instanceof Error ? err.stack : err);
    });
    this.registerHandlers(bot);
    // Set regardless of polling below: notifyAdmin is a stateless sendMessage call, identical
    // from either active/active node.
    this.bot = bot;

    // Same active/active constraint as the seller bot: getUpdates long-polling allows exactly one
    // live consumer per token, so only the node with TELEGRAM_ADMIN_BOT_POLLING="true" (primary,
    // see deploy.yml) may call launch().
    if (process.env.TELEGRAM_ADMIN_BOT_POLLING !== "true") {
      this.logger.log("Admin bot: outbound-only on this node (TELEGRAM_ADMIN_BOT_POLLING unset)");
      return;
    }
    bot
      .launch(() => this.logger.log("Telegram admin bot started (long polling)"))
      .catch((err) => this.logger.error("Telegram admin bot stopped unexpectedly", err));
  }

  onModuleDestroy() {
    this.bot?.stop("shutdown");
  }

  /**
   * Sends free-form text to the platform owner's chat. Never throws -- a notification failure
   * must not break whatever triggered it (an order being placed, an error being reported).
   *
   * PlatformSettings.adminTelegramChatId (set via the admin panel's "Connect Telegram") takes
   * priority; ADMIN_TELEGRAM_CHAT_ID is only the bootstrap fallback from before that existed.
   */
  async notifyAdmin(text: string) {
    if (!this.bot) return;
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    const chatId = settings?.adminTelegramChatId ?? process.env.ADMIN_TELEGRAM_CHAT_ID;
    if (!chatId) return;
    try {
      await this.bot.telegram.sendMessage(chatId, text, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    } catch (err) {
      this.logger.warn(`Failed to notify admin via Telegram: ${err}`);
    }
  }

  private registerHandlers(bot: Telegraf) {
    bot.start(async (ctx) => {
      const code = ctx.startPayload?.trim();
      const chatId = String(ctx.chat.id);

      if (!code) {
        return ctx.reply("Привет! Эта ссылка должна прийти из админ-панели → «Уведомления» → «Подключить Telegram».");
      }

      const settings = await this.prisma.platformSettings.findUnique({ where: { id: "singleton" } });
      if (settings?.adminTelegramLinkCode !== code) {
        return ctx.reply("Код недействителен или уже использован. Сгенерируйте новую ссылку в админ-панели.");
      }

      await this.prisma.platformSettings.update({
        where: { id: "singleton" },
        data: { adminTelegramChatId: chatId, adminTelegramLinkCode: null },
      });
      return ctx.reply("✅ Этот чат подключён к уведомлениям платформы (заказы, ошибки в Sentry).");
    });

    // The one-time step to find this chat's id for ADMIN_TELEGRAM_CHAT_ID (the bootstrap
    // fallback above) -- there's no other way to learn a chat's id without it telling you.
    bot.command("chatid", (ctx) => ctx.reply(`Chat ID: ${ctx.chat.id}`));
  }
}
