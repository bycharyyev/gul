import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";

const SETTINGS_ID = "singleton";

/**
 * The commission the platform takes on gallery/seller-marketplace sales -- singleton row,
 * upsert-on-read/write, same pattern as ReferralsService's settings pair. Not to be confused
 * with the "marketplace purchase" vertical (cargo/) which buys from a foreign site on the
 * customer's behalf and has its own, unrelated settings.
 */
@Injectable()
export class MarketplaceSettingsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  private toDto(settings: {
    id: string;
    takeRatePercent: Prisma.Decimal;
    storyAdPriceTmt: Prisma.Decimal;
    storyAdDurationDays: number;
    slideAdPriceTmt: Prisma.Decimal;
    slideAdDurationDays: number;
    updatedAt: Date;
  }) {
    return {
      id: settings.id,
      takeRatePercent: Number(settings.takeRatePercent),
      storyAdPriceTmt: Number(settings.storyAdPriceTmt),
      storyAdDurationDays: settings.storyAdDurationDays,
      slideAdPriceTmt: Number(settings.slideAdPriceTmt),
      slideAdDurationDays: settings.slideAdDurationDays,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  async getSettings() {
    const settings = await this.prisma.marketplaceSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
    return this.toDto(settings);
  }

  async updateSettings(
    input: {
      takeRatePercent?: number;
      storyAdPriceTmt?: number;
      storyAdDurationDays?: number;
      slideAdPriceTmt?: number;
      slideAdDurationDays?: number;
    },
    adminId: string,
  ) {
    const settings = await this.prisma.marketplaceSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...input },
      update: input,
    });
    this.auditLog.record(adminId, "marketplace-settings.update", "MarketplaceSettings", SETTINGS_ID, input);
    return this.toDto(settings);
  }

  /**
   * Read only at gallery-order creation time, to be frozen onto GalleryOrder.takeRatePercentSnapshot.
   * A later change to this setting must never rewrite the economics of an order already placed --
   * see that column's comment and the Shipment pricing-snapshot precedent it follows.
   */
  async getCurrentTakeRatePercent(): Promise<number> {
    const settings = await this.getSettings();
    return settings.takeRatePercent;
  }

  /** Current price and run length of a seller ad placement; read at purchase time and at the
   *  public ad-pricing endpoints. The purchase snapshots the price onto the ad itself. */
  async getAdPricing(placement: "story" | "slide"): Promise<{ priceTmt: number; durationDays: number }> {
    const settings = await this.getSettings();
    return placement === "story"
      ? { priceTmt: settings.storyAdPriceTmt, durationDays: settings.storyAdDurationDays }
      : { priceTmt: settings.slideAdPriceTmt, durationDays: settings.slideAdDurationDays };
  }
}
