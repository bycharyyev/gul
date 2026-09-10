import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { ApiKeyScope, PARTNER_SCOPES, REQUIRED_SCOPE } from "./api-key-scopes";

/**
 * Authenticates partner/reseller requests via the `X-Api-Key` header instead of a JWT.
 * A distinct trust boundary from customer/staff auth -- keys reach the `/partner/*` surface only.
 *
 * Four checks, in the order that gives the most useful answer:
 *   1. the secret matches a key (current, or a rotated one still in its grace period);
 *   2. the key is enabled;
 *   3. the key has not expired;
 *   4. the key holds the scope this route requires.
 *
 * Expiry and scope are separated from "invalid" on purpose. "Your key expired" and "your key
 * cannot create orders" are things a partner can act on; "invalid or disabled API key" is not.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawKey = request.headers["x-api-key"];

    if (!rawKey || typeof rawKey !== "string") {
      throw new UnauthorizedException("Missing X-Api-Key header");
    }

    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const apiKey = await this.findByHash(keyHash);

    if (!apiKey || !apiKey.isEnabled) {
      throw new UnauthorizedException("Invalid or disabled API key");
    }

    if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("API key expired");
    }

    const required = this.reflector.getAllAndOverride<ApiKeyScope | undefined>(REQUIRED_SCOPE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !(apiKey.scopes ?? []).includes(required)) {
      throw new ForbiddenException(`API key is missing the "${required}" scope`);
    }

    this.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    // The shop travels on the key, not in the request. Every seller-API route reads it from
    // here, so no parameter can point a key at somebody else's products.
    request.apiKey = {
      id: apiKey.id,
      ownerLabel: apiKey.ownerLabel,
      sellerId: apiKey.sellerId ?? null,
    };
    return true;
  }

  /**
   * Matches the current secret, or a rotated one that is still inside its grace period.
   *
   * Rotation without a grace period means a window in which the old key is dead and the partner
   * has not deployed the new one yet -- which is an outage the partner did not agree to.
   */
  private async findByHash(keyHash: string) {
    try {
      return await this.prisma.apiKey.findFirst({
        where: {
          OR: [
            { keyHash },
            { previousKeyHash: keyHash, previousKeyExpiresAt: { gt: new Date() } },
          ],
        },
        select: {
          id: true,
          ownerLabel: true,
          isEnabled: true,
          expiresAt: true,
          scopes: true,
          sellerId: true,
        },
      });
    } catch (error) {
      // The deploy pipeline starts new code before running migrations, so for a minute or two
      // these columns may not exist. Fall back to the pre-lifecycle behaviour -- authenticate on
      // the current hash alone and treat the key as unrestricted -- rather than rejecting every
      // partner request for the length of a deploy. Scopes restrict; failing closed here would
      // take a working integration down for a schema change it did not ask for.
      const prismaError = error as { code?: string; meta?: { column?: string } };
      const missingColumn = prismaError.code === "P2022" ? String(prismaError.meta?.column ?? "") : "";
      if (!/(scopes|expiresAt|previousKeyHash|previousKeyExpiresAt|sellerId)/.test(missingColumn)) {
        throw new ServiceUnavailableException("API key validation is temporarily unavailable");
      }
      const legacy = await this.prisma.apiKey.findUnique({
        where: { keyHash },
        select: { id: true, ownerLabel: true, isEnabled: true },
      });
      // Partner scopes only, and no shop. A key from before the column existed is a partner key
      // by definition, and the seller surface refuses a key with no shop on it anyway -- so this
      // fallback cannot hand anybody a shop they did not have.
      return legacy
        ? {
            ...legacy,
            expiresAt: null as Date | null,
            scopes: [...ALL_SCOPES],
            sellerId: null as string | null,
          }
        : null;
    }
  }
}

const ALL_SCOPES: ApiKeyScope[] = [...PARTNER_SCOPES];
