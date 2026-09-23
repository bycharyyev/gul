import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ApiMetricsService } from "./api-metrics.service";
import { ApiMetricsInterceptor } from "./api-metrics.interceptor";
import { ApiMetricsController } from "./api-metrics.controller";

@Module({
  controllers: [ApiMetricsController],
  providers: [
    ApiMetricsService,
    // Global, so no route can be added without being counted.
    { provide: APP_INTERCEPTOR, useClass: ApiMetricsInterceptor },
  ],
  exports: [ApiMetricsService],
})
export class MetricsModule {}
