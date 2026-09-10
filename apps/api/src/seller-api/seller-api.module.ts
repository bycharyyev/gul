import { Module } from "@nestjs/common";
import { SellerApiController } from "./seller-api.controller";
import { ShopKeyGuard } from "./shop-key.guard";
import { GalleryModule } from "../gallery/gallery.module";
import { ChatModule } from "../chat/chat.module";
import { SellersModule } from "../sellers/sellers.module";
import { PrismaModule } from "../prisma/prisma.module";

/**
 * The Seller API surface.
 *
 * Holds no service of its own: everything here is the cabinet's own logic reached through a key
 * instead of a session. A second implementation would be a second set of rules about SKUs,
 * prices and order transitions, and the two would drift apart within a release.
 */
@Module({
  imports: [PrismaModule, GalleryModule, ChatModule, SellersModule],
  controllers: [SellerApiController],
  providers: [ShopKeyGuard],
})
export class SellerApiModule {}
