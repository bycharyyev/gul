/// What a product page told us about itself, read in the customer's own browser.
///
/// Every field here is **display only**. The marketplace and the article number keep coming from
/// the server, which derives them from the URL and never trusts the client for them -- those are
/// the fields an order is built on. A title and a price read out of a page on someone's phone
/// cannot be verified by us, so they help a person recognise their product and nothing else; the
/// amount actually charged is still set by a person at review.
class ProductFacts {
  const ProductFacts({
    this.title,
    this.imageUrl,
    this.price,
    this.currency,
    this.source,
  });

  final String? title;
  final String? imageUrl;
  final double? price;
  final String? currency;

  /// Which reader produced this -- `json-ld`, `meta`, or a site-specific selector. Kept because
  /// the site-specific readers are the ones that rot, and knowing which one answered is what
  /// makes a future breakage diagnosable instead of mysterious.
  final String? source;

  bool get isEmpty => title == null && price == null && imageUrl == null;

  static const _maxTitle = 300;

  /// The currencies the API's own `CurrencyCode` enum has. A page reporting anything else is
  /// reporting something the order cannot carry, and sending it would fail validation at
  /// checkout -- after the customer has already filled a basket. Dropped here instead, so what
  /// is displayed and what is sent are the same value.
  static const _currencies = {'USD', 'RUB', 'EUR', 'TRY', 'CNY', 'KZT'};

  /// Parses the extractor's message. Everything here arrives from a web page, so nothing is
  /// trusted: wrong types, absurd numbers and control characters are dropped rather than shown.
  factory ProductFacts.fromExtractor(Map<String, dynamic> json) {
    String? text(Object? value, [int max = _maxTitle]) {
      if (value is! String) return null;
      final trimmed = value.trim();
      if (trimmed.isEmpty || trimmed.length > max) return null;
      return RegExp('[\u0000-\u001f\u007f]').hasMatch(trimmed) ? null : trimmed;
    }

    double? money(Object? value) {
      final number = value is num
          ? value.toDouble()
          : double.tryParse('$value');
      if (number == null || !number.isFinite) return null;
      // A page that reports 0 or a hundred million has not reported a price.
      if (number <= 0 || number >= 100000000) return null;
      // Two decimals, because that is what the API accepts: a page reporting 954.999 would
      // otherwise be refused at checkout rather than here.
      return (number * 100).roundToDouble() / 100;
    }

    String? image(Object? value) {
      final raw = text(value, 2000);
      if (raw == null) return null;
      final uri = Uri.tryParse(raw);
      // Only https: an http image would be blocked by the app's cleartext policy anyway, and a
      // data: URI of arbitrary length has no business in a product card.
      if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return null;
      return raw;
    }

    return ProductFacts(
      title: text(json['title']),
      imageUrl: image(json['image']),
      price: money(json['price']),
      currency: _currencies.contains(text(json['currency'], 8)?.toUpperCase())
          ? text(json['currency'], 8)!.toUpperCase()
          : null,
      source: text(json['source'], 40),
    );
  }
}

/// Reads a product page the way a person reading it would: whatever the page says about itself.
///
/// Three readers, tried in order of how long each is likely to keep working.
///
///  1. **JSON-LD** (`schema.org/Product`). A contract the site publishes for search engines, so it
///     changes rarely and means exactly what it says.
///  2. **OpenGraph meta tags**. Published for the same reason -- this is what Telegram reads to
///     draw its link preview, which is the behaviour this whole feature is modelled on.
///  3. **Per-site selectors**. These rot; they are last and they name themselves in `source`, so
///     a card that stops showing a price says which reader stopped answering.
///
/// It polls rather than reading once. All three marketplaces render their price with JavaScript
/// after the document is "finished", so a single pass at onPageFinished reliably finds a title
/// and no price. Ten seconds is the ceiling; the customer sees the real page the whole time, so
/// waiting costs them nothing.
const String productExtractorJs = r'''
(function () {
  if (window.__gulyalyExtract) return;
  window.__gulyalyExtract = true;

  var MAX_ATTEMPTS = 20;
  var INTERVAL_MS = 500;
  var attempts = 0;
  var lastSent = '';

  function text(v) {
    if (typeof v !== 'string') return null;
    var t = v.trim();
    return t.length > 0 && t.length < 300 ? t : null;
  }

  function money(v) {
    if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
    if (typeof v !== 'string') return null;
    var cleaned = v.replace(/[\s\u00a0\u202f\u2009]/g, '');
    // "2 552,50 ₽" and "2552.50" both have to land on the same number. A comma is a decimal
    // separator here, never a thousands separator -- those were the spaces just removed.
    cleaned = cleaned.replace(',', '.').replace(/[^0-9.]/g, '');
    var parts = cleaned.split('.');
    if (parts.length > 2) cleaned = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
    var n = parseFloat(cleaned);
    return isFinite(n) && n > 0 ? n : null;
  }

  function meta(selector) {
    var el = document.querySelector(selector);
    return el ? text(el.getAttribute('content')) : null;
  }

  function fromJsonLd() {
    var nodes = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < nodes.length; i++) {
      var parsed;
      try { parsed = JSON.parse(nodes[i].textContent); } catch (e) { continue; }
      var stack = [parsed];
      var budget = 500;
      while (stack.length && budget-- > 0) {
        var node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        if (Array.isArray(node)) {
          for (var a = 0; a < node.length; a++) stack.push(node[a]);
          continue;
        }
        var type = node['@type'];
        var isProduct = type === 'Product' || (Array.isArray(type) && type.indexOf('Product') >= 0);
        if (isProduct) {
          var img = node.image;
          if (Array.isArray(img)) img = img[0];
          if (img && typeof img === 'object') img = img.url;
          var offers = node.offers;
          if (Array.isArray(offers)) offers = offers[0];
          var price = null, currency = null;
          if (offers && typeof offers === 'object') {
            price = money(offers.price);
            if (price === null && offers.priceSpecification) price = money(offers.priceSpecification.price);
            currency = text(offers.priceCurrency);
          }
          var title = text(node.name);
          if (title || price !== null) {
            return { title: title, image: text(img), price: price, currency: currency, source: 'json-ld' };
          }
        }
        for (var key in node) {
          var child = node[key];
          if (child && typeof child === 'object') stack.push(child);
        }
      }
    }
    return null;
  }

  function fromMeta() {
    var title = meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]');
    // Wildberries puts its own shopfront slogan in og:title on a product page, so the tag that
    // is meant to name the product names the whole site instead. Measured on a real device:
    // "Интернет-магазин Wildberries: широкий ассортимент товаров - скидки каждый день!". A title
    // equal to the site's own name is not this product's name.
    var site = meta('meta[property="og:site_name"]');
    if (title && site && (title === site || title.indexOf(site) === 0)) title = null;
    var image = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]');
    // Protocol-relative is common and would otherwise be dropped as "not https".
    if (image && image.indexOf('//') === 0) image = 'https:' + image;
    var price = money(
      meta('meta[property="product:price:amount"]') ||
      meta('meta[property="og:price:amount"]') ||
      meta('meta[itemprop="price"]')
    );
    var currency = meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]');
    if (!title && price === null && !image) return null;
    return { title: title, image: image, price: price, currency: currency, source: 'meta' };
  }

  // Last resort, and the only part expected to rot. Ordered most specific first within each site.
  var SELECTORS = {
    price: [
      '[data-widget="webPrice"] span',
      '[data-auto="snippet-price-current"]',
      '[data-auto="price-value"]',
      '.price-block__final-price',
      '[itemprop="price"]'
    ],
    title: [
      '[data-widget="webProductHeading"] h1',
      '[data-auto="productCardTitle"]',
      'h1[data-link-name]',
      'h1'
    ]
  };

  function bySelector(list, read) {
    for (var i = 0; i < list.length; i++) {
      var el = document.querySelector(list[i]);
      if (!el) continue;
      var value = read(el);
      if (value !== null && value !== undefined) return value;
    }
    return null;
  }

  function fromDom() {
    var price = bySelector(SELECTORS.price, function (el) {
      return money(el.getAttribute('content') || el.textContent);
    });
    var title = bySelector(SELECTORS.title, function (el) { return text(el.textContent); });
    if (title === null && price === null) return null;
    return { title: title, image: null, price: price, currency: null, source: 'dom' };
  }

  function read(fn) {
    try { return fn() || null; } catch (e) { return null; }
  }

  // Each field has its own order of trust, because the readers are not uniformly good.
  // A title is best taken from the page's own heading before its og:title, since a shopfront
  // routinely puts its brand slogan in the tag. A price is the opposite: the structured value is
  // exact, while a heading-adjacent number could be a discount badge or a delivery fee.
  var FIELD_ORDER = {
    title: ['json-ld', 'dom', 'meta'],
    price: ['json-ld', 'meta', 'dom'],
    image: ['json-ld', 'meta']
  };

  function collect() {
    var byName = {
      'json-ld': read(fromJsonLd),
      'meta': read(fromMeta),
      'dom': read(fromDom)
    };
    var out = { title: null, image: null, price: null, currency: null, source: null };
    var used = [];
    for (var field in FIELD_ORDER) {
      var order = FIELD_ORDER[field];
      for (var i = 0; i < order.length; i++) {
        var got = byName[order[i]];
        if (!got) continue;
        var value = got[field];
        if (value === null || value === undefined) continue;
        out[field] = value;
        if (field === 'price') out.currency = got.currency;
        if (used.indexOf(order[i]) === -1) used.push(order[i]);
        break;
      }
    }
    out.source = used.join('+') || null;
    return out;
  }

  function tick() {
    attempts++;
    var facts = collect();
    var complete = facts.title !== null && facts.price !== null;
    var signature = JSON.stringify(facts);
    // Send whenever the answer improved, so a title shows up immediately and a price fills in
    // when the page finally renders it, rather than the card sitting empty for ten seconds.
    if (signature !== lastSent && (facts.title || facts.price !== null)) {
      lastSent = signature;
      facts.attempts = attempts;
      facts.complete = complete;
      facts.pageUrl = location.href;
      GulyalyProduct.postMessage(JSON.stringify(facts));
    }
    if (complete || attempts >= MAX_ATTEMPTS) clearInterval(timer);
  }

  var timer = setInterval(tick, INTERVAL_MS);
  tick();
})();
''';
