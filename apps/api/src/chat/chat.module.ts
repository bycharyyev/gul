import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [StorageModule],
  controllers: [ChatController],
  providers: [ChatService],
  // Exported for the Seller API, which reaches a shop's channels and customer threads with it.
  exports: [ChatService],
})
export class ChatModule {}
