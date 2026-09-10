import { Module } from "@nestjs/common";
import { GalleryController } from "./gallery.controller";
import { GalleryService } from "./gallery.service";
import { SellersModule } from "../sellers/sellers.module";
import { TelegramBotModule } from "../telegram-bot/telegram-bot.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [SellersModule, TelegramBotModule, EmailModule],
  controllers: [GalleryController],
  providers: [GalleryService],
  // The Seller API reaches a shop's products through the same service the cabinet uses.
  exports: [GalleryService],
})
export class GalleryModule {}
