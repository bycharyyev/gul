import { Module } from "@nestjs/common";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { SellersModule } from "../sellers/sellers.module";
import { StorageModule } from "../storage/storage.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [SellersModule, StorageModule, NotificationsModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
