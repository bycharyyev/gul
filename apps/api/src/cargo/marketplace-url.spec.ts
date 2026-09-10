import { readMarketplaceLink } from "./marketplace-url";

/**
 * Every marketplace we accept, in both directions: a real product URL must yield the vendor's
 * article number, and the pages that are NOT products -- category, search, storefront -- must be
 * rejected rather than guessed at. Telling a customer "recognised" about a search page is a lie
 * they would only discover when review comes back empty.
 */
describe("readMarketplaceLink", () => {
  it.each([
    ["OZON", "https://www.ozon.ru/product/naushniki-besprovodnye-1234567890/", "1234567890"],
    ["OZON", "https://ozon.ru/product/1798256734/", "1798256734"],
    ["WILDBERRIES", "https://www.wildberries.ru/catalog/123456789/detail.aspx", "123456789"],
    ["ALIEXPRESS", "https://www.aliexpress.com/item/1005001234567890.html", "1005001234567890"],
    ["ALIEXPRESS", "https://aliexpress.ru/item/32912345678.html", "32912345678"],
    ["TRENDYOL", "https://www.trendyol.com/koton/erkek-tisort-p-123456789", "123456789"],
    ["YANDEX_MARKET", "https://market.yandex.ru/product--smartfon/987654321", "987654321"],
    ["YANDEX_MARKET", "https://market.yandex.ru/product/1732104859", "1732104859"],
    // What the share button actually produces, via a resolved market.yandex.ru/cc/ link.
    ["YANDEX_MARKET", "https://market.yandex.ru/card/apple-watch-se-3-sm-meh34/4718006442", "4718006442"],
    // Real Ozon share link, resolved: the article is the last and longest run in the slug.
    ["OZON", "https://www.ozon.ru/product/magnitnyy-akkumulyator-na-5000-mah-type-c-5188439881/", "5188439881"],
    // Real Wildberries share links, which are not shortened.
    ["WILDBERRIES", "https://www.wildberries.ru/catalog/1232566244/detail.aspx?size=1813059142", "1232566244"],
    ["WILDBERRIES", "https://www.wildberries.ru/catalog/691049930/detail.aspx", "691049930"],
    ["TAOBAO", "https://item.taobao.com/item.htm?id=654321987", "654321987"],
  ])("reads the article number out of a %s product URL", (source, url, expected) => {
    expect(readMarketplaceLink(source as never, url)).toEqual({ externalId: expected, isProductPage: true });
  });

  it.each([
    // Category and search pages: no article number to find, and pretending otherwise is worse
    // than saying so.
    ["OZON", "https://www.ozon.ru/category/smartfony-15502/"],
    ["OZON", "https://www.ozon.ru/search/?text=naushniki"],
    ["WILDBERRIES", "https://www.wildberries.ru/catalog/muzhchinam/odezhda"],
    ["WILDBERRIES", "https://www.wildberries.ru/brands/nike"],
    ["ALIEXPRESS", "https://www.aliexpress.com/store/1234567"],
    ["ALIEXPRESS", "https://www.aliexpress.com/wholesale?SearchText=phone"],
    ["TRENDYOL", "https://www.trendyol.com/erkek-tisort-x-c1234"],
    ["YANDEX_MARKET", "https://market.yandex.ru/catalog--smartfony/54726"],
    ["TAOBAO", "https://www.taobao.com/search?q=phone"],
  ])("refuses to invent an id for a %s page that is not a product", (source, url) => {
    expect(readMarketplaceLink(source as never, url)).toEqual({ externalId: null, isProductPage: false });
  });

  it("rejects a short digit run rather than mistaking a size or a year for an article number", () => {
    // "-2024" is a model year in a slug, not an id. Accepting it would confidently mis-identify
    // pages whose real product number is elsewhere or absent.
    expect(readMarketplaceLink("OZON", "https://www.ozon.ru/product/kurtka-zimnyaya-2024/")).toEqual({
      externalId: null,
      isProductPage: false,
    });
  });

  it("takes the longest digit run in an Ozon slug, not the first one it meets", () => {
    // Slugs routinely carry a capacity or a size before the article number.
    expect(readMarketplaceLink("OZON", "https://www.ozon.ru/product/ssd-1000-gb-nvme-1798256734/")).toEqual({
      externalId: "1798256734",
      isProductPage: true,
    });
  });

  it("keeps Taobao's id, which lives in the query string rather than the path", () => {
    expect(readMarketplaceLink("TAOBAO", "https://item.taobao.com/item.htm?spm=a1z10&id=654321987")).toEqual({
      externalId: "654321987",
      isProductPage: true,
    });
  });

  it("returns not-a-product for a malformed URL instead of throwing at the caller", () => {
    expect(readMarketplaceLink("OZON", "not a url")).toEqual({ externalId: null, isProductPage: false });
  });
});
