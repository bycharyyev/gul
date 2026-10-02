import { Global, Module } from "@nestjs/common";
import { PublicCacheController } from "./public-cache.controller";
import { PublicCacheService } from "./public-cache.service";

/** Global so any module serving public reads can cache them and invalidate on edit. */
@Global()
@Module({
  controllers: [PublicCacheController],
  providers: [{ provide: PublicCacheService, useFactory: () => new PublicCacheService(PublicCacheService.connect()) }],
  exports: [PublicCacheService],
})
export class PublicCacheModule {}
