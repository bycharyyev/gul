import { Module } from "@nestjs/common";
import { AdminTelegramBotModule } from "../admin-telegram-bot/admin-telegram-bot.module";
import { SentryAlertsService } from "./sentry-alerts.service";

@Module({
  imports: [AdminTelegramBotModule],
  providers: [SentryAlertsService],
})
export class SentryAlertsModule {}
