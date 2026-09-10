import { MarketplaceEnricher } from "./marketplace-enricher";

/** The real payload shape, trimmed to the fields the enricher reads. */
const WB_PAYLOAD = {
  products: [
    {
      id: 1232566244,
      root: 2978281414,
      name: "Аккумулятор для iPhone 13 Pro усиленный",
      brand: "",
      supplier: "Орижка",
      pics: 6,
      sizes: [{ price: { basic: 404200, product: 255200, logistics: 0, return: 0 } }],
    },
  ],
};

function jsonFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return (async () =>
    ({ ok, status, json: async () => body }) as unknown as Response) as unknown as typeof fetch;
}

describe("MarketplaceEnricher", () => {
  it("reads title, seller and both prices from the real Wildberries payload", async () => {
    const enricher = new MarketplaceEnricher(jsonFetch(WB_PAYLOAD));

    await expect(enricher.enrich("WILDBERRIES", "1232566244")).resolves.toEqual({
      title: "Аккумулятор для iPhone 13 Pro усиленный",
      seller: "Орижка",
      // Hundredths of a rouble: 255200 -> 2552.00, 404200 -> 4042.00.
      priceCurrent: 2552,
      priceOriginal: 4042,
      currency: "RUB",
    });
  });

  it("does not invent a strike-through price when there is no discount", async () => {
    const flat = { products: [{ name: "X", supplier: "S", sizes: [{ price: { basic: 100000, product: 100000 } }] }] };

    await expect(new MarketplaceEnricher(jsonFetch(flat)).enrich("WILDBERRIES", "1")).resolves.toMatchObject({
      priceCurrent: 1000,
      priceOriginal: null,
    });
  });

  it("asks nothing at all for the marketplaces we cannot read", async () => {
    // Ozon and Yandex answer 307 to every plain request; calling them would burn a timeout on
    // every paste for a result that is never going to arrive.
    const fetchImpl = jest.fn();
    const enricher = new MarketplaceEnricher(fetchImpl as unknown as typeof fetch);

    await expect(enricher.enrich("OZON", "5188439881")).resolves.toMatchObject({ title: null });
    await expect(enricher.enrich("YANDEX_MARKET", "4718006442")).resolves.toMatchObject({ title: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns empty rather than throwing when the API is down", async () => {
    const failing = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    await expect(new MarketplaceEnricher(failing).enrich("WILDBERRIES", "1232566244")).resolves.toMatchObject({
      title: null,
      priceCurrent: null,
    });
  });

  it("returns empty on a non-200, which is how a moved endpoint version shows up", async () => {
    // v1-v3 answer 404 today; v4 is current. The next move must degrade, not break.
    await expect(
      new MarketplaceEnricher(jsonFetch({}, false, 404)).enrich("WILDBERRIES", "1232566244"),
    ).resolves.toMatchObject({ title: null });
  });

  it.each([
    ["an empty products array", { products: [] }],
    ["a payload that is not an object", "nope"],
    ["a product without sizes", { products: [{ name: "X" }] }],
  ])("survives %s", async (_label, body) => {
    await expect(new MarketplaceEnricher(jsonFetch(body)).enrich("WILDBERRIES", "1")).resolves.toMatchObject({
      priceCurrent: null,
    });
  });

  it("refuses a title carrying control characters rather than rendering it in a cart", async () => {
    const nasty = { products: [{ name: "bad\u0000title", supplier: "S", sizes: [] }] };

    await expect(new MarketplaceEnricher(jsonFetch(nasty)).enrich("WILDBERRIES", "1")).resolves.toMatchObject({
      title: null,
    });
  });

  it("does not call out for an id that is not a plain number", async () => {
    const fetchImpl = jest.fn();
    await new MarketplaceEnricher(fetchImpl as unknown as typeof fetch).enrich("WILDBERRIES", "1; DROP TABLE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
