import type { MarketplaceSourceCode } from "@prisma/client";

/**
 * Expanding the links the share button actually produces.
 *
 * People do not paste canonical product URLs. They tap "Поделиться" in the Ozon or Yandex Market
 * app and get `ozon.ru/t/1fJ1Bb2` or `market.yandex.ru/cc/AzcSrs` -- addresses with no article
 * number in them at all, which the URL readers cannot do anything with. Measured from the
 * production VPS on 2026-09-08, both expand cleanly:
 *
 *   ozon.ru/t/1fJ1Bb2       -> 301 -> /product/magnitnyy-akkumulyator-...-5188439881/
 *   market.yandex.ru/cc/... -> 302 -> /card/apple-watch-se-3-.../4718006442
 *
 * This reads the `Location` header and stops. It deliberately does NOT follow the chain to the
 * end: on the same probe, following Yandex all the way landed on `/showcaptcha`, because the
 * far end of the chain is where bot protection lives. The first hop is already the product URL,
 * so going further buys nothing and costs the answer.
 *
 * Nor does it fetch a product page. Those returned 498 (Wildberries) and 307 (Ozon) from the same
 * machine -- the bot walls the customer asked us to stay clear of. One redirect lookup on the
 * vendor's own shortener is a different thing entirely, and it is all we need.
 */

/** Where a short link may start. Anything else is not expanded at all. */
const SHORTENERS: ReadonlyArray<{
  source: MarketplaceSourceCode;
  hosts: readonly string[];
  path: RegExp;
}> = [
  { source: "OZON", hosts: ["ozon.ru", "www.ozon.ru"], path: /^\/t\/[A-Za-z0-9]+\/?$/ },
  { source: "YANDEX_MARKET", hosts: ["market.yandex.ru"], path: /^\/cc\/[A-Za-z0-9]+\/?$/ },
];

const MAX_HOPS = 3;
const TIMEOUT_MS = 8_000;

/** Not a short link is not an error: most pasted URLs are already canonical. */
export function matchShortener(rawUrl: string): MarketplaceSourceCode | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const match = SHORTENERS.find((entry) => entry.hosts.includes(host) && entry.path.test(url.pathname));
  return match?.source ?? null;
}

/**
 * @param allowedHosts the marketplace's own product hosts, from MarketplacePurchaseSource. Every
 *   hop is checked against them: a shortener that redirected anywhere else is refused rather than
 *   followed, so this cannot be turned into a request generator pointed at arbitrary hosts.
 */
export async function expandShortLink(
  rawUrl: string,
  allowedHosts: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const permitted = new Set(allowedHosts.map((host) => host.toLowerCase()));
  const shortenerHosts = new Set(SHORTENERS.flatMap((entry) => entry.hosts));
  let current = rawUrl;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Shorteners answer a bare client with a redirect; some answer nothing useful without a
        // browser-shaped Accept. Nothing here is a credential.
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      return null;
    }

    const location = response.headers.get("location");
    if (!location) return null;

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return null;
    }
    if (next.protocol !== "https:") return null;

    const host = next.hostname.toLowerCase().replace(/\.$/, "");
    const target = next.toString();
    // "Arrived" cannot be a host check alone: Ozon serves ozon.ru/t/<code> AND ozon.ru/product/...
    // from the same host, so a shortener that redirects to another shortener would look like a
    // product and be returned as one. Ask whether the target is still a short link.
    const stillShort = matchShortener(target) !== null;
    if (permitted.has(host) && !stillShort) return target;
    // Still inside the shortener (some bounce through an interstitial); keep going.
    if (!stillShort && !shortenerHosts.has(host)) return null;
    current = target;
  }
  return null;
}
