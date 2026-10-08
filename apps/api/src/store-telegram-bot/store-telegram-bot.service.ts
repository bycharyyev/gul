import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Context, Markup, Telegraf } from "telegraf";
import type Redis from "ioredis";
import { runsBackgroundWork } from "../common/app-role";
import { PollingLease, telegrafRunner } from "../common/polling-lease";
import { REDIS_CLIENT } from "../queue/queue.module";

const SITE_URL = "https://gulyaly.com";
const SUPPORT_EMAIL = "support@gulyaly.com";

const MENU = Markup.inlineKeyboard([
  [Markup.button.url("🛍 Открыть Gulyaly", SITE_URL)],
  [Markup.button.url("🔒 Политика конфиденциальности", `${SITE_URL}/privacy`)],
  [Markup.button.url("📄 Пользовательское соглашение", `${SITE_URL}/terms`)],
  [Markup.button.callback("💬 Поддержка", "support")],
]);

@Injectable()
export class StoreTelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StoreTelegramBotService.name);
  private bot: Telegraf | null = null;
  private lease: PollingLease | null = null;

  constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}

  onModuleInit() {
    const token = process.env.TELEGRAM_STORE_BOT_TOKEN;
    if (!token) {
      this.logger.warn(
        "TELEGRAM_STORE_BOT_TOKEN not set — storefront bot disabled",
      );
      return;
    }

    const bot = new Telegraf(token);
    bot.catch((err, ctx) => {
      this.logger.error(
        `Unhandled error in storefront bot (update ${ctx.update.update_id})`,
        err instanceof Error ? err.stack : err,
      );
    });

    const showMenu = (ctx: Context) =>
      ctx.reply(
        "Gulyaly — цифровые товары и услуги.\n\nВыберите нужный раздел. Покупки и оплата проходят на сайте gulyaly.com.",
        MENU,
      );

    bot.start(showMenu);
    bot.command("shop", showMenu);
    bot.command("privacy", (ctx) =>
      ctx.reply(`Политика конфиденциальности:\n${SITE_URL}/privacy`),
    );
    bot.command("terms", (ctx) =>
      ctx.reply(`Пользовательское соглашение и оферта:\n${SITE_URL}/terms`),
    );
    bot.command("support", (ctx) =>
      ctx.reply(
        `Поддержка Gulyaly: ${SUPPORT_EMAIL}\n\nУкажите номер заказа и кратко опишите вопрос.`,
      ),
    );
    bot.action("support", async (ctx) => {
      await ctx.answerCbQuery();
      return ctx.reply(
        `Поддержка Gulyaly: ${SUPPORT_EMAIL}\n\nУкажите номер заказа и кратко опишите вопрос.`,
      );
    });
    bot.command("paysupport", (ctx) =>
      ctx.reply(
        `Вопросы по платежам принимает Gulyaly: ${SUPPORT_EMAIL}\n\nTelegram и Bot Support не обрабатывают вопросы по покупкам. Укажите номер заказа и способ оплаты.`,
      ),
    );

    this.bot = bot;
    if (
      process.env.TELEGRAM_STORE_BOT_POLLING !== "true" ||
      !runsBackgroundWork()
    ) {
      this.logger.log("Storefront bot: outbound-only on this node");
      return;
    }

    // Eligible only; a Redis lease picks the one process that polls (common/polling-lease.ts).
    this.lease = new PollingLease(
      this.redis,
      "lease:telegram-polling:store",
      telegrafRunner(bot, this.logger, "Telegram storefront bot"),
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
}
