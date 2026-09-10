import type { CurrencyCode, MarketplaceSourceCode } from "@prisma/client";

export interface MarketplaceProductSnapshot {
  title: string;
  externalId: string;
  imageUrl?: string;
  unitPrice: string;
  currency: CurrencyCode;
  estimatedWeightKg?: string;
  payload?: Record<string, string | number | boolean | null>;
}

/** Implementations may call only a fixed official API origin; they must never fetch the supplied URL. */
export interface MarketplaceSourceAdapter {
  readonly key: string;
  readonly sources: readonly MarketplaceSourceCode[];
  resolve(canonicalUrl: string, variant?: string): Promise<MarketplaceProductSnapshot | null>;
}

/** Safe production fallback when no buyer/catalog API contract exists. No scraping, no outbound request. */
export class ManualReviewMarketplaceAdapter implements MarketplaceSourceAdapter {
  readonly key = "manual";
  readonly sources = ["OZON", "WILDBERRIES", "ALIEXPRESS", "TRENDYOL", "YANDEX_MARKET", "TAOBAO"] as const;
  async resolve(_canonicalUrl: string, _variant?: string): Promise<MarketplaceProductSnapshot | null> { return null; }
}
