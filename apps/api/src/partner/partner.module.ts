import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { PartnerController } from "./partner.controller";
import { ApiKeyGuard } from "./api-key.guard";
import { CatalogModule } from "../catalog/catalog.module";
import { OrdersModule } from "../orders/orders.module";
import { deprecatedVersionHeaders } from "../common/deprecated-version.middleware";
import { PARTNER_UNVERSIONED_SUNSET } from "./partner-sunset";

@Module({
  imports: [CatalogModule, OrdersModule],
  controllers: [PartnerController],
  providers: [ApiKeyGuard],
})
export class PartnerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Bound to the controller rather than a path string, so both the versioned and the
    // unversioned routes are covered and neither can be missed by a typo. Which of the two a
    // request arrived on is decided inside the middleware, from the URL.
    consumer
      .apply(deprecatedVersionHeaders("/api/v1/partner", PARTNER_UNVERSIONED_SUNSET))
      .forRoutes(PartnerController);
  }
}
