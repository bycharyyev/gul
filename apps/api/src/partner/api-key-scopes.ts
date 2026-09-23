import { SetMetadata } from "@nestjs/common";

/**
 * What a partner key is allowed to do on the wholesale surface.
 *
 * Three, matching the three things the partner surface actually offers. Resisting a finer grid is
 * deliberate: a scope nobody can explain is a scope nobody sets correctly.
 */
export const PARTNER_SCOPES = ["catalog:read", "orders:read", "orders:write"] as const;

/**
 * What a shop key is allowed to do on the seller surface.
 *
 * Separate from the partner list because they answer different questions. `orders:read` on a
 * partner key means top-up orders that key placed; a shop's orders are somebody buying a bouquet
 * from that shop. Sharing one name for both would make every scope decision ambiguous, so the
 * shop's own orders are spelled out.
 *
 * Split read from write everywhere: the common case is a key that only reads -- a price feed, a
 * dashboard, a stock check -- and that key should not be able to delete a product.
 */
export const SHOP_SCOPES = [
  "products:read",
  "products:write",
  "shop-orders:read",
  "shop-orders:write",
  "chat:read",
  "chat:write",
] as const;

export const API_KEY_SCOPES = [...PARTNER_SCOPES, ...SHOP_SCOPES] as const;

export type PartnerScope = (typeof PARTNER_SCOPES)[number];
export type ShopScope = (typeof SHOP_SCOPES)[number];
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}

export function isShopScope(value: string): value is ShopScope {
  return (SHOP_SCOPES as readonly string[]).includes(value);
}

export const REQUIRED_SCOPE = "api-key-required-scope";

/**
 * Declares the scope a route needs. Read by `ApiKeyGuard`.
 *
 * A route with no decorator requires no scope -- but every partner and seller-API route has one,
 * and the guard has a test that walks the controllers to prove it. Forgetting the decorator on a
 * new route is exactly how a "read-only" key quietly gains the ability to create orders.
 */
export const RequiresScope = (scope: ApiKeyScope) => SetMetadata(REQUIRED_SCOPE, scope);
