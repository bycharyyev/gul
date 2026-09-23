import { expandShortLink, matchShortener } from "./marketplace-shortlink";

const OZON_HOSTS = ["ozon.ru", "www.ozon.ru"];

/** One redirect, answered from a fake fetch -- no test here talks to a marketplace. */
function redirectingFetch(chain: Record<string, string | null>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const location = chain[url];
    if (location === undefined) throw new Error(`unexpected request to ${url}`);
    return {
      headers: { get: (name: string) => (name.toLowerCase() === "location" ? location : null) },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("marketplace short links", () => {
  describe("matchShortener", () => {
    it.each([
      ["https://ozon.ru/t/1fJ1Bb2", "OZON"],
      ["https://www.ozon.ru/t/1fJ1Bb2", "OZON"],
      ["https://market.yandex.ru/cc/AzcSrs", "YANDEX_MARKET"],
    ])("recognises %s as a share link", (url, expected) => {
      expect(matchShortener(url)).toBe(expected);
    });

    it.each([
      // Already canonical -- nothing to expand, and expanding is a network call we should skip.
      "https://www.ozon.ru/product/naushniki-1234567890/",
      "https://www.wildberries.ru/catalog/691049930/detail.aspx",
      // Right host, wrong shape: not a shortener path.
      "https://ozon.ru/seller/12345",
      // Not a marketplace at all.
      "https://example.com/t/abc",
      // http:// is refused before anything else happens.
      "http://ozon.ru/t/1fJ1Bb2",
      "not a url",
    ])("does not treat %s as a short link", (url) => {
      expect(matchShortener(url)).toBeNull();
    });
  });

  describe("expandShortLink", () => {
    it("returns the product URL from the first Location header", async () => {
      const target =
        "https://www.ozon.ru/product/magnitnyy-akkumulyator-na-5000-mah-type-c-5188439881/?from=share_android";
      const fetchImpl = redirectingFetch({ "https://ozon.ru/t/1fJ1Bb2": target });

      await expect(expandShortLink("https://ozon.ru/t/1fJ1Bb2", OZON_HOSTS, fetchImpl)).resolves.toBe(target);
    });

    it("stops at the first product URL instead of following the chain into a captcha", async () => {
      // Measured behaviour: following Yandex all the way lands on /showcaptcha. The first hop is
      // already the product, so a second request would only lose the answer.
      const product = "https://market.yandex.ru/card/apple-watch-se-3/4718006442";
      const fetchImpl = redirectingFetch({
        "https://market.yandex.ru/cc/AzcSrs": product,
        [product]: "https://market.yandex.ru/showcaptcha?cc=1",
      });

      await expect(
        expandShortLink("https://market.yandex.ru/cc/AzcSrs", ["market.yandex.ru"], fetchImpl),
      ).resolves.toBe(product);
    });

    it("refuses a redirect that leaves the marketplace, rather than following it", async () => {
      // Otherwise a shortener -- or anything that can influence one -- turns this into a request
      // generator aimed at hosts of somebody else's choosing.
      const fetchImpl = redirectingFetch({ "https://ozon.ru/t/evil": "https://attacker.example/collect" });

      await expect(expandShortLink("https://ozon.ru/t/evil", OZON_HOSTS, fetchImpl)).resolves.toBeNull();
    });

    it("refuses a downgrade to http", async () => {
      const fetchImpl = redirectingFetch({ "https://ozon.ru/t/x": "http://www.ozon.ru/product/naushniki-1234567890/" });

      await expect(expandShortLink("https://ozon.ru/t/x", OZON_HOSTS, fetchImpl)).resolves.toBeNull();
    });

    it("gives up on a redirect loop instead of spinning", async () => {
      const fetchImpl = redirectingFetch({
        "https://ozon.ru/t/a": "https://ozon.ru/t/b",
        "https://ozon.ru/t/b": "https://ozon.ru/t/a",
      });

      await expect(expandShortLink("https://ozon.ru/t/a", OZON_HOSTS, fetchImpl)).resolves.toBeNull();
    });

    it("returns null when the shortener answers without a Location", async () => {
      const fetchImpl = redirectingFetch({ "https://ozon.ru/t/gone": null });

      await expect(expandShortLink("https://ozon.ru/t/gone", OZON_HOSTS, fetchImpl)).resolves.toBeNull();
    });

    it("returns null when the request fails, so the caller can fall back to asking for a full link", async () => {
      const failing = (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch;

      await expect(expandShortLink("https://ozon.ru/t/x", OZON_HOSTS, failing)).resolves.toBeNull();
    });
  });
});
