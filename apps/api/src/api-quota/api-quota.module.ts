import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ApiQuotaService } from "./api-quota.service";
import { ApiQuotaInterceptor } from "./api-quota.interceptor";

@Module({
  providers: [ApiQuotaService, { provide: APP_INTERCEPTOR, useClass: ApiQuotaInterceptor }],
  exports: [ApiQuotaService],
})
export class ApiQuotaModule {}
