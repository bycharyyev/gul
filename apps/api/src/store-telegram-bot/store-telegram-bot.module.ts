import { Module } from "@nestjs/common";
import { StoreTelegramBotService } from "./store-telegram-bot.service";

@Module({ providers: [StoreTelegramBotService] })
export class StoreTelegramBotModule {}
