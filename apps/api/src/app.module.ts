import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { RequestIdMiddleware, RequestLoggingInterceptor } from "./common/request-context";
import { PrismaModule } from "./prisma/prisma.module";
import { StorageModule } from "./storage/storage.module";
import { AuditLogModule } from "./audit-log/audit-log.module";
import { QueueModule } from "./queue/queue.module";
import { AuthModule } from "./auth/auth.module";
import { CatalogModule } from "./catalog/catalog.module";
import { OrdersModule } from "./orders/orders.module";
import { PaymentsModule } from "./payments/payments.module";
import { UsersModule } from "./users/users.module";
import { AdminStatsModule } from "./admin-stats/admin-stats.module";
import { ApiKeysModule } from "./api-keys/api-keys.module";
import { PartnerModule } from "./partner/partner.module";
import { StoriesModule } from "./stories/stories.module";
import { ContentPagesModule } from "./content-pages/content-pages.module";
import { ChatModule } from "./chat/chat.module";
import { SupportModule } from "./support/support.module";
import { EmailModule } from "./email/email.module";
import { GalleryModule } from "./gallery/gallery.module";
import { SellerApiModule } from "./seller-api/seller-api.module";
import { SellersModule } from "./sellers/sellers.module";
import { TelegramBotModule } from "./telegram-bot/telegram-bot.module";
import { WithdrawalsModule } from "./withdrawals/withdrawals.module";
import { HomeSlidesModule } from "./home-slides/home-slides.module";
import { SocialLinksModule } from "./social-links/social-links.module";
import { DocumentsModule } from "./documents/documents.module";
import { HealthModule } from "./health/health.module";
import { MetricsModule } from "./metrics/metrics.module";
import { ApiQuotaModule } from "./api-quota/api-quota.module";
import { ReferralsModule } from "./referrals/referrals.module";
import { AvatarModule } from "./avatar/avatar.module";
import { UploadsModule } from "./uploads/uploads.module";
import { SubdomainsModule } from "./subdomains/subdomains.module";
import { CargoModule } from "./cargo/cargo.module";
import { SellerLedgerModule } from "./seller-ledger/seller-ledger.module";
import { SocialFeedModule } from "./social-feed/social-feed.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 120 was chosen for one browser. It is keyed by IP, and behind carrier-grade NAT an IP is
    // a neighbourhood -- so the ceiling was shared by everyone on the same operator. Raised to
    // a figure a single abusive client still reaches and a shared address does not.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    PrismaModule,
    StorageModule,
    AuditLogModule,
    SellerLedgerModule,
    QueueModule,
    AuthModule,
    CatalogModule,
    OrdersModule,
    PaymentsModule,
    UsersModule,
    AdminStatsModule,
    ApiKeysModule,
    PartnerModule,
    StoriesModule,
    ContentPagesModule,
    SupportModule,
    ChatModule,
    EmailModule,
    GalleryModule,
    SellerApiModule,
    SellersModule,
    TelegramBotModule,
    WithdrawalsModule,
    HomeSlidesModule,
    SocialLinksModule,
    DocumentsModule,
    HealthModule,
    MetricsModule,
    // After MetricsModule on purpose: the metrics interceptor wraps this one, so a request
    // rejected by the quota is still counted as the 429 it became.
    ApiQuotaModule,
    ReferralsModule,
    AvatarModule,
    UploadsModule,
    SubdomainsModule,
    CargoModule,
    SocialFeedModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
