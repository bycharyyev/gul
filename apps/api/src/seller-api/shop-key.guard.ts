import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

/**
 * Refuses a key that belongs to no shop.
 *
 * Runs after `ApiKeyGuard`, which has already proved the secret and checked the scope. This one
 * answers the remaining question: a partner key is a wholesale reseller with no products of its
 * own, and every route behind this guard is about *a shop's* products, orders and conversations.
 * Without this, a partner key holding `products:read` would reach a `sellerId` of null and the
 * queries below it would quietly mean "every product with no shop" -- the house stock.
 *
 * Its own guard rather than a check in each handler: there are a dozen routes here, and the one
 * somebody forgets is the one that matters.
 */
@Injectable()
export class ShopKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const sellerId = request.apiKey?.sellerId;
    if (!sellerId) {
      // Said plainly: a partner integration pointed at the wrong surface should read an answer
      // that tells them which surface they are on, not a bare 403.
      throw new ForbiddenException(
        "This endpoint requires a shop API key. Partner keys reach /partner instead.",
      );
    }
    return true;
  }
}
