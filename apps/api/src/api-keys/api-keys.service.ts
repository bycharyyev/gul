import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { ApiQuotaService } from "../api-quota/api-quota.service";
import type { CreateApiKeyDto } from "./dto/create-api-key.dto";
import type { CreateSellerKeyDto } from "./dto/create-seller-key.dto";
import { isShopScope } from "../partner/api-key-scopes";

/** A shop needs a handful: a site, a stock sync, maybe a staging copy. Not a hundred. */
const MAX_KEYS_PER_SHOP = 10;
/** Long enough to deploy the new token, short enough that a leaked one is not left standing. */
const SELLER_ROTATION_GRACE_HOURS = 24;

const SAFE_SELECT = {
  id: true,
  name: true,
  ownerLabel: true,
  keyPrefix: true,
  isEnabled: true,
  rateLimitPerMin: true,
  scopes: true,
  expiresAt: true,
  previousKeyExpiresAt: true,
  lastUsedAt: true,
  sellerId: true,
  createdAt: true,
  createdBy: { select: { id: true, fullName: true, phone: true } },
};

@Injectable()
export class ApiKeysService {
  constructor(
    private prisma: PrismaService,
    private quota: ApiQuotaService,
  ) {}

  list() {
    return this.prisma.apiKey.findMany({ select: SAFE_SELECT, orderBy: { createdAt: "desc" } });
  }

  /** Returns the raw key exactly once — it cannot be retrieved again after this call. */
  async create(dto: CreateApiKeyDto, createdById: string) {
    const rawKey = `sk_live_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 12);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        ownerLabel: dto.ownerLabel,
        keyHash,
        keyPrefix,
        createdById,
        // A new key gets exactly what was asked for. Defaulting to full access would make the
        // scope field decorative -- the safe default for a fresh key is the narrow one.
        scopes: dto.scopes ?? ["catalog:read"],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      select: SAFE_SELECT,
    });

    return { ...apiKey, rawKey };
  }

  async setEnabled(id: string, isEnabled: boolean) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException("API key not found");
    return this.prisma.apiKey.update({ where: { id }, data: { isEnabled }, select: SAFE_SELECT });
  }

  /**
   * Sets this key's requests-per-minute ceiling. `null` returns it to the partner tier default --
   * there is deliberately no way to express "unlimited".
   */
  async setRateLimit(id: string, rateLimitPerMin: number | null) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException("API key not found");

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { rateLimitPerMin },
      select: SAFE_SELECT,
    });
    // The quota service caches limits for a minute; without this an admin raising a limit for a
    // partner who is actively being rejected would have to wait it out.
    this.quota.forget(id);
    return updated;
  }

  /** Replaces the scope list outright. Scopes restrict; there is no additive form on purpose. */
  async setScopes(id: string, scopes: string[]) {
    await this.mustExist(id);
    return this.prisma.apiKey.update({ where: { id }, data: { scopes }, select: SAFE_SELECT });
  }

  /** `null` means it never expires. A past date is allowed: it is how you retire a key on a date. */
  async setExpiry(id: string, expiresAt: string | null) {
    await this.mustExist(id);
    return this.prisma.apiKey.update({
      where: { id },
      data: { expiresAt: expiresAt ? new Date(expiresAt) : null },
      select: SAFE_SELECT,
    });
  }

  /**
   * Issues a new secret and keeps the old one working for `graceHours`.
   *
   * Without the grace period a rotation is an outage: the old key stops the instant the new one
   * is minted, and the partner has not deployed it yet. The raw key is returned exactly once,
   * like at creation -- it cannot be retrieved afterwards.
   */
  async rotate(id: string, graceHours: number) {
    const existing = await this.mustExist(id);

    const rawKey = `sk_live_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: {
        keyHash,
        keyPrefix: rawKey.slice(0, 12),
        previousKeyHash: existing.keyHash,
        previousKeyExpiresAt: new Date(Date.now() + graceHours * 60 * 60 * 1000),
      },
      select: SAFE_SELECT,
    });

    return { ...updated, rawKey };
  }

  private async mustExist(id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException("API key not found");
    return key;
  }

  // ---- A shop's own keys ----
  //
  // Everything below fixes the shop to the caller's and narrows what a key may be. A seller sets
  // what their token does; they do not set whose data it reaches or how much traffic it gets.

  listForSeller(sellerId: string) {
    return this.prisma.apiKey.findMany({
      where: { sellerId },
      select: SAFE_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  async createForSeller(sellerId: string, createdById: string, dto: CreateSellerKeyDto) {
    const existing = await this.prisma.apiKey.count({ where: { sellerId } });
    if (existing >= MAX_KEYS_PER_SHOP) {
      throw new ConflictException(
        `A shop may hold ${MAX_KEYS_PER_SHOP} API keys. Delete one you no longer use.`,
      );
    }
    const shop = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      select: { shopName: true },
    });
    if (!shop) throw new NotFoundException("Seller not found");

    const rawKey = `sk_shop_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        // Not the seller's to write: the label is what the admin console shows next to traffic
        // and refunds, and a free-text field there would let a shop label itself as somebody else.
        ownerLabel: shop.shopName,
        keyHash,
        keyPrefix: rawKey.slice(0, 12),
        createdById,
        sellerId,
        // Read-only by default, and shop scopes only. `scopes` is validated against SHOP_SCOPES
        // in the dto as well -- twice, because this is the boundary that decides what a token
        // issued by a customer of ours can reach.
        scopes: (dto.scopes ?? ["products:read"]).filter(isShopScope),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      select: SAFE_SELECT,
    });

    return { ...apiKey, rawKey };
  }

  private async mustOwn(sellerId: string, id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    // Another shop's key answers exactly as a missing one: a seller must not be able to discover
    // which key ids exist by trying them.
    if (!key || key.sellerId !== sellerId) throw new NotFoundException("API key not found");
    return key;
  }

  async setEnabledForSeller(sellerId: string, id: string, isEnabled: boolean) {
    await this.mustOwn(sellerId, id);
    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { isEnabled },
      select: SAFE_SELECT,
    });
    await this.quota.forget(id);
    return updated;
  }

  async rotateForSeller(sellerId: string, id: string) {
    await this.mustOwn(sellerId, id);
    return this.rotate(id, SELLER_ROTATION_GRACE_HOURS);
  }

  async removeForSeller(sellerId: string, id: string) {
    await this.mustOwn(sellerId, id);
    await this.prisma.apiKey.delete({ where: { id } });
    await this.quota.forget(id);
  }

  async remove(id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException("API key not found");
    try {
      await this.prisma.apiKey.delete({ where: { id } });
    } catch {
      throw new ConflictException("Cannot delete: this key has order history. Disable it instead.");
    }
  }
}
