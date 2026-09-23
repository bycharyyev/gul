import { Module } from "@nestjs/common";
import { GalleryController } from "./gallery.controller";
import { GalleryService } from "./gallery.service";
import { SellersModule } from "../sellers/sellers.module";
import { TelegramBotModule } from "../telegram-bot/telegram-bot.module";
import { AdminTelegramBotModule } from "../admin-telegram-bot/admin-telegram-bot.module";
import { EmailModule } from "../email/email.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [SellersModule, TelegramBotModule, AdminTelegramBotModule, EmailModule, NotificationsModule],
  controllers: [GalleryController],
  providers: [GalleryService],
  // The Seller API reaches a shop's products through the same service the cabinet uses.
  exports: [GalleryService],
})
export class GalleryModule {}
