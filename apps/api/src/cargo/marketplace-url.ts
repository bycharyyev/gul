import type { MarketplaceSourceCode } from "@prisma/client";

/**
 * Reading a product's identity out of its own URL.
 *
 * This is the only "recognition" the platform does without a vendor contract, and it is worth
 * being precise about what it is and is not. It is NOT scraping: nothing is fetched, no page is
 * parsed, and the result is derived entirely from the address the customer pasted. What it buys
 * is real all the same -- a customer sees straight away that the link was understood, which
 * marketplace it belongs to and which article number the buyer will be sent to, instead of
 * staring at a raw URL and hoping.
 *
 * What it deliberately does not produce is a price, a title or a photo. Those need the vendor's
 * data, and inventing them would be worse than admitting they come after review.
 *
 * Every pattern below is taken from a real product URL on that marketplace and is covered by
 * marketplace-url.spec.ts, including the shapes that must NOT match -- a category page, a search
 * result, a seller's storefront -- because "we recognised your link" about a search page would be
 * a lie the customer only discovers at review time.
 */
export interface MarketplaceLinkIdentity {
  /** The vendor's own article/product number, as it appears in the URL. */
  externalId: string | null;
  /** True when the URL is a product page rather than a category/search/storefront page. */
  isProductPage: boolean;
}

/** Longest numeric run in a string, which is how most slugs carry the article number. */
function longestDigitRun(value: string): string | null {
  const runs = value.match(/\d+/g);
  if (!runs) return null;
  return runs.reduce((longest, run) => (run.length > longest.length ? run : longest));
}

// Article numbers on these marketplaces are long. A 2-3 digit run in a slug is a model year or a
// size, not an id, and accepting it would confidently mis-identify a category page.
const MIN_ID_DIGITS = 5;

function ok(externalId: string | null): MarketplaceLinkIdentity {
  return externalId && externalId.length >= MIN_ID_DIGITS
    ? { externalId, isProductPage: true }
    : { externalId: null, isProductPage: false };
}

const NOT_A_PRODUCT: MarketplaceLinkIdentity = { externalId: null, isProductPage: false };

type Reader = (url: URL) => MarketplaceLinkIdentity;

const READERS: Record<MarketplaceSourceCode, Reader> = {
  // https://www.ozon.ru/product/naushniki-besprovodnye-1234567890/
  OZON: (url) => {
    const segments = url.pathname.split("/").filter(Boolean);
    const productAt = segments.indexOf("product");
    if (productAt === -1 || !segments[productAt + 1]) return NOT_A_PRODUCT;
    return ok(longestDigitRun(segments[productAt + 1]!));
  },

  // https://www.wildberries.ru/catalog/123456789/detail.aspx
  WILDBERRIES: (url) => {
    const segments = url.pathname.split("/").filter(Boolean);
    const catalogAt = segments.indexOf("catalog");
    const candidate = catalogAt === -1 ? undefined : segments[catalogAt + 1];
    // /catalog/<id>/detail.aspx is a product; /catalog/muzhchinam/odezhda is a category, and its
    // segment is not numeric at all.
    if (!candidate || !/^\d+$/.test(candidate)) return NOT_A_PRODUCT;
    return ok(candidate);
  },

  // https://www.aliexpress.com/item/1005001234567890.html
  ALIEXPRESS: (url) => {
    const match = url.pathname.match(/\/item\/(\d+)\.html/i);
    return ok(match?.[1] ?? null);
  },

  // https://www.trendyol.com/marka/urun-adi-p-123456789
  TRENDYOL: (url) => {
    const match = url.pathname.match(/-p-(\d+)/i);
    return ok(match?.[1] ?? null);
  },

  // Three shapes in the wild: /product--slug/123456789, the older /product/123456789, and
  // /card/slug/123456789 -- which is what the share button actually produces today, and what a
  // resolved market.yandex.ru/cc/... short link lands on.
  YANDEX_MARKET: (url) => {
    const segments = url.pathname.split("/").filter(Boolean);
    const productAt = segments.findIndex(
      (segment) => segment === "product" || segment.startsWith("product--") || segment === "card",
    );
    if (productAt === -1) return NOT_A_PRODUCT;
    // /card/<slug>/<id> puts the id two segments along; /product/<id> puts it one.
    const candidate = [segments[productAt + 1], segments[productAt + 2]].find(
      (segment) => segment !== undefined && /^\d+$/.test(segment),
    );
    if (!candidate) return NOT_A_PRODUCT;
    return ok(candidate);
  },

  // https://item.taobao.com/item.htm?id=123456789 -- Taobao carries the id in the query, which is
  // why the canonicaliser must not strip unknown parameters wholesale.
  TAOBAO: (url) => {
    const id = url.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) return NOT_A_PRODUCT;
    return ok(id);
  },
};

/**
 * @param canonicalUrl a URL already validated and normalised by CargoService's canonicaliser --
 *   HTTPS, host confirmed to belong to `source`. Passing anything else is a programming error.
 */
export function readMarketplaceLink(source: MarketplaceSourceCode, canonicalUrl: string): MarketplaceLinkIdentity {
  let url: URL;
  try {
    url = new URL(canonicalUrl);
  } catch {
    return NOT_A_PRODUCT;
  }
  return READERS[source](url);
}
