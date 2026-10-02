import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { mergeMap, type Observable } from "rxjs";
import { PublicCacheService, type CacheGroup } from "./public-cache.service";

const GROUPS_KEY = "public-cache:invalidates";

@Injectable()
export class PublicCacheInvalidationInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private cache: PublicCacheService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const groups = this.reflector.get<CacheGroup[]>(GROUPS_KEY, context.getHandler()) ?? [];
    // Only after the handler succeeded, and before the response goes out: the editor's very next
    // read (often the same screen reloading) must already miss. A failed edit changed nothing,
    // so it invalidates nothing.
    return next.handle().pipe(
      mergeMap(async (value) => {
        await this.cache.invalidate(...groups);
        return value;
      }),
    );
  }
}

/**
 * Marks an endpoint that changes public cached data. Every such endpoint must carry it -- the
 * cache's TTL is the only other thing that would ever refresh the data. Invalidation goes through
 * the shared Redis, so both API nodes see it at once.
 */
export function InvalidatesPublicCache(...groups: CacheGroup[]) {
  return applyDecorators(SetMetadata(GROUPS_KEY, groups), UseInterceptors(PublicCacheInvalidationInterceptor));
}
