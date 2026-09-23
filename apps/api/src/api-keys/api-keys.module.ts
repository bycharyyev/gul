import { Module } from "@nestjs/common";
import { ApiKeysController } from "./api-keys.controller";
import { ApiKeysService } from "./api-keys.service";
import { ApiQuotaModule } from "../api-quota/api-quota.module";
import { SellerKeysController } from "./seller-keys.controller";
import { SellersModule } from "../sellers/sellers.module";

@Module({
  // For ApiQuotaService.forget, so an admin's limit change takes effect without waiting out the
  // per-key cache.
  imports: [ApiQuotaModule, SellersModule],
  controllers: [ApiKeysController, SellerKeysController],
  providers: [ApiKeysService],
})
export class ApiKeysModule {}
