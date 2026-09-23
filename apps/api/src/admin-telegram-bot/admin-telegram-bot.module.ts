import { Module } from "@nestjs/common";
import { AdminTelegramBotService } from "./admin-telegram-bot.service";

@Module({
  providers: [AdminTelegramBotService],
  exports: [AdminTelegramBotService],
})
export class AdminTelegramBotModule {}
