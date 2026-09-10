import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** The authenticated key. `sellerId` is set only on a shop key; a partner key has none. */
export type AuthedApiKey = { id: string; ownerLabel: string; sellerId: string | null };

export const CurrentApiKey = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.apiKey as AuthedApiKey;
});
