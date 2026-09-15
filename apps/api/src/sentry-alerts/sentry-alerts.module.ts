import { Module } from "@nestjs/common";
import { TelegramBotModule } from "../telegram-bot/telegram-bot.module";
import { SentryAlertsService } from "./sentry-alerts.service";

@Module({
  imports: [TelegramBotModule],
  providers: [SentryAlertsService],
})
export class SentryAlertsModule {}
