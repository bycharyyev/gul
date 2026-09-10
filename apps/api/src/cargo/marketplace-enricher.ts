import { Logger } from "@nestjs/common";
import type { MarketplaceSourceCode } from "@prisma/client";

/**
 * The one marketplace whose product data we can read without fighting a bot wall.
 *
 * Measured from the production VPS on 2026-09-08, against the SKUs from a real report:
 *
 *   card.wb.ru/cards/v4/detail?nm=1232566244  -> 200, and the payload carries
 *     name     "Аккумулятор для iPhone 13 Pro усиленный"
 *     supplier "Орижка"
 *     price    { basic: 404200, product: 255200 }   (hundredths of a rouble)
 *
 * v1, v2 and v3 all answer 404 -- an earlier probe used those and concluded, wrongly, that no
 * such API existed. Version it explicitly here so the next 404 is read as "they moved again"
 * rather than "this never worked".
 *
 * What is NOT here, and why:
 *
 *  - **Images.** WB serves them from basket-NN.wbbasket.ru under a vol/part path derived from an
 *    id. Thirty hosts x four path shapes x both candidate ids answered nothing from our server.
 *    Rather than ship a URL guess that renders a broken image, the card shows no picture.
 *  - **Ozon and Yandex Market.** Every plain request from the same machine returns 307, including
 *    their own composer API. Reading those needs a stealth browser on a rotating residential
 *    proxy: a recurring cost, a permanent maintenance burden, and a thing that breaks silently
 *    the week the vendor changes its shield. The article number from the URL stays the answer
 *    there, and a person fills the rest at review.
 *
 * Enrichment is best-effort by construction. Every failure path returns null and the caller
 * carries on with what the URL alone already told it -- a marketplace that is having a bad day
 * must never stop somebody adding a product to their basket.
 */

const WB_CARD_API = "https://card.wb.ru/cards/v4/detail";
const TIMEOUT_MS = 6_000;

export interface MarketplaceProductFacts {
  title: string | null;
  seller: string | null;
  /** Price the customer would pay, in the marketplace's own currency (RUB for Wildberries). */
  priceCurrent: number | null;
  /** Pre-discount price, when the marketplace reports one above the current price. */
  priceOriginal: number | null;
  currency: string | null;
}

const EMPTY: MarketplaceProductFacts = {
  title: null,
  seller: null,
  priceCurrent: null,
  priceOriginal: null,
  currency: null,
};

function text(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  // Control characters in a title would end up rendered in a customer's cart.
  return /[\u0000-\u001f\u007f]/.test(trimmed) ? null : trimmed;
}

/** WB quotes money in hundredths. Anything absurd is dropped rather than shown. */
function money(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const roubles = Math.round(value) / 100;
  return roubles > 0 && roubles < 100_000_000 ? roubles : null;
}

// Deliberately NOT @Injectable: its only constructor argument is a fetch implementation for
// tests, which Nest cannot resolve, and it has no dependencies worth a container entry.
export class MarketplaceEnricher {
  private readonly logger = new Logger(MarketplaceEnricher.name);

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async enrich(source: MarketplaceSourceCode, externalId: string | null): Promise<MarketplaceProductFacts> {
    if (!externalId || source !== "WILDBERRIES") return EMPTY;
    if (!/^\d{1,15}$/.test(externalId)) return EMPTY;

    let payload: unknown;
    try {
      const url = `${WB_CARD_API}?appType=1&curr=rub&dest=-1257786&nm=${externalId}`;
      const response = await this.fetchImpl(url, {
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          accept: "application/json",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
      });
      if (!response.ok) {
        // A 404 here most likely means the endpoint version moved again, which is worth seeing in
        // the log without being worth an error to the customer.
        this.logger.debug(`Wildberries card API answered ${response.status} for nm=${externalId}`);
        return EMPTY;
      }
      payload = await response.json();
    } catch {
      return EMPTY;
    }

    return this.readWildberries(payload);
  }

  private readWildberries(payload: unknown): MarketplaceProductFacts {
    if (!payload || typeof payload !== "object") return EMPTY;
    const products = (payload as { products?: unknown }).products;
    const first = Array.isArray(products) ? products[0] : undefined;
    if (!first || typeof first !== "object") return EMPTY;
    const product = first as Record<string, unknown>;

    // The price lives on the size, not the product: a card with one size still nests it there.
    const sizes = Array.isArray(product.sizes) ? (product.sizes as Array<Record<string, unknown>>) : [];
    const price = sizes.map((size) => size.price).find((value) => value && typeof value === "object") as
      | Record<string, unknown>
      | undefined;

    const current = money(price?.product);
    const basic = money(price?.basic);

    return {
      title: text(product.name),
      // `brand` is routinely empty on marketplace listings; the supplier is who actually ships it
      // and is the more useful of the two to show.
      seller: text(product.brand, 120) ?? text(product.supplier, 120),
      priceCurrent: current,
      // Only a genuine strike-through: equal or lower "basic" is not a discount worth showing.
      priceOriginal: basic !== null && current !== null && basic > current ? basic : null,
      currency: current === null ? null : "RUB",
    };
  }
}
