import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ApiMetricsService } from "./api-metrics.service";
import { ApiMetricsInterceptor } from "./api-metrics.interceptor";
import { ApiMetricsController } from "./api-metrics.controller";
import { PerfMetricsService } from "./perf-metrics.service";
import { PerfMetricsMiddleware } from "./perf-metrics.middleware";
import { PerformanceService } from "./performance.service";
import { PerformanceController } from "./performance.controller";

@Module({
  controllers: [ApiMetricsController, PerformanceController],
  providers: [
    ApiMetricsService,
    // Global, so no route can be added without being counted.
    { provide: APP_INTERCEPTOR, useClass: ApiMetricsInterceptor },
    // Built by hand: it takes its own fail-fast Redis connection, not an injectable token.
    { provide: PerfMetricsService, useFactory: () => new PerfMetricsService(PerfMetricsService.connect()) },
    PerformanceService,
  ],
  exports: [ApiMetricsService, PerfMetricsService],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(PerfMetricsMiddleware).forRoutes("*");
  }
}
