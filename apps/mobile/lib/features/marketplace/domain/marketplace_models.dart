import '../../../core/format/money.dart';

Map<String, dynamic>? _lastJsonObject(Object? raw) {
  final values = raw is List<dynamic> ? raw : const [];
  for (final value in values.reversed) {
    if (value is Map<String, dynamic>) return value;
  }
  return null;
}

bool isSafeMarketplaceUrl(String value) {
  final uri = Uri.tryParse(value.trim());
  if (uri == null ||
      uri.scheme != 'https' ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty) {
    return false;
  }
  final host = uri.host.toLowerCase();
  if (host == 'localhost' || host.endsWith('.local')) return false;
  if (host == '::1' || host.startsWith('fe80:')) return false;
  if (RegExp(r'^\d{1,3}(\.\d{1,3}){3}$').hasMatch(host)) {
    final parts = host.split('.').map(int.parse).toList();
    if (parts.any((part) => part > 255)) return false;
    if (parts[0] == 10 ||
        parts[0] == 127 ||
        (parts[0] == 169 && parts[1] == 254) ||
        (parts[0] == 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] == 192 && parts[1] == 168)) {
      return false;
    }
  }
  return true;
}

/// What the server could tell us about a pasted link, without fetching anything.
///
/// Price, title and photo are deliberately absent: they need the vendor's own data, and a
/// fabricated number on a screen where somebody is about to authorise a spending limit would be
/// the worst possible place to guess. What is real here -- the marketplace and the article number
/// -- comes from the URL's own shape, so it is instant and cannot be wrong.
class MarketplaceLinkPreview {
  const MarketplaceLinkPreview({
    required this.sourceCode,
    required this.sourceName,
    required this.canonicalUrl,
    required this.externalId,
    required this.isProductPage,
    required this.requiresManualReview,
    this.title,
    this.seller,
    this.priceCurrent,
    this.priceOriginal,
    this.priceCurrency,
    this.factsSource,
  });

  final String sourceCode;
  final String sourceName;
  final String canonicalUrl;
  final String? externalId;
  final bool isProductPage;
  final bool requiresManualReview;

  /// Filled by the server only where the marketplace answers a readable API -- Wildberries today.
  /// Ozon and Yandex refuse a plain HTTP client from every machine we own, so for those two these
  /// arrive from the preview screen instead: read in the customer's own browser, off the page in
  /// front of them, and carried here so the card and the basket can show a real product.
  final String? title;
  final String? seller;
  final double? priceCurrent;
  final double? priceOriginal;
  final String? priceCurrency;

  /// Where [title] and [priceCurrent] came from. Null means the server answered, which is the
  /// verified case; anything else names the reader that ran on the customer's device.
  ///
  /// This is not decoration. A price the client supplied must never reach an amount charged, and
  /// the way to keep that true over time is for the field to say, at every point it travels
  /// through, that nobody has checked it.
  final String? factsSource;

  bool get hasProductFacts => title != null || priceCurrent != null;

  /// Merges what the customer's browser read into what the server already knew.
  ///
  /// The server's answer wins wherever it has one: it is the checked version. These only ever
  /// fill gaps, which for Ozon and Yandex is currently everything except the article number.
  MarketplaceLinkPreview withFacts({
    String? title,
    double? price,
    String? currency,
    String? source,
  }) => MarketplaceLinkPreview(
    sourceCode: sourceCode,
    sourceName: sourceName,
    canonicalUrl: canonicalUrl,
    externalId: externalId,
    isProductPage: isProductPage,
    requiresManualReview: requiresManualReview,
    title: this.title ?? title,
    seller: seller,
    priceCurrent: priceCurrent ?? price,
    priceOriginal: priceOriginal,
    priceCurrency: priceCurrency ?? currency,
    factsSource: this.title == null && title != null ? source : factsSource,
  );

  factory MarketplaceLinkPreview.fromJson(Map<String, dynamic> json) =>
      MarketplaceLinkPreview(
        sourceCode: json['sourceCode'] as String? ?? '',
        sourceName: json['sourceName'] as String? ?? '',
        canonicalUrl: json['canonicalUrl'] as String? ?? '',
        externalId: json['externalId'] as String?,
        isProductPage: json['isProductPage'] as bool? ?? false,
        requiresManualReview: json['requiresManualReview'] as bool? ?? true,
        title: json['title'] as String?,
        seller: json['seller'] as String?,
        priceCurrent: (json['priceCurrent'] as num?)?.toDouble(),
        priceOriginal: (json['priceOriginal'] as num?)?.toDouble(),
        priceCurrency: json['priceCurrency'] as String?,
      );
}

/// One of the last few links this customer looked up. Capped server-side at five.
class MarketplaceSearchEntry {
  const MarketplaceSearchEntry({
    required this.id,
    required this.sourceCode,
    required this.canonicalUrl,
    required this.externalId,
  });

  final String id;
  final String sourceCode;
  final String canonicalUrl;
  final String? externalId;

  factory MarketplaceSearchEntry.fromJson(Map<String, dynamic> json) =>
      MarketplaceSearchEntry(
        id: json['id'] as String? ?? '',
        sourceCode: json['sourceCode'] as String? ?? '',
        canonicalUrl: json['canonicalUrl'] as String? ?? '',
        externalId: json['externalId'] as String?,
      );
}

class MarketplaceCartItem {
  const MarketplaceCartItem({
    required this.preview,
    required this.quantity,
    this.variant,
  });

  final MarketplaceLinkPreview preview;
  final int quantity;
  final String? variant;

  MarketplaceCartItem copyWith({int? quantity, String? variant}) =>
      MarketplaceCartItem(
        preview: preview,
        quantity: quantity ?? this.quantity,
        variant: variant ?? this.variant,
      );

  /// `sourceCode` is required by the API and was previously omitted, which made every create
  /// request fail validation before it reached any business logic.
  ///
  /// The `reported*` fields carry what the customer's browser read off the product page. Without
  /// them the price the customer just looked at dies on the phone, and a reviewer has to reopen
  /// the marketplace by hand to price the order. They are sent only when they came from that
  /// reader -- a server-verified title is already on the server -- and the API stores them in
  /// columns nothing that computes money reads.
  Map<String, dynamic> toJson() => {
    'sourceCode': preview.sourceCode,
    'url': preview.canonicalUrl,
    'quantity': quantity,
    if (variant != null && variant!.trim().isNotEmpty)
      'variant': variant!.trim(),
    if (preview.factsSource != null) ...{
      if (preview.title != null) 'reportedTitle': preview.title,
      if (preview.priceCurrent != null) 'reportedPrice': preview.priceCurrent,
      if (preview.priceCurrency != null)
        'reportedCurrency': preview.priceCurrency,
      'reportedSource': preview.factsSource,
    },
  };
}

class MarketplaceOrderEvent {
  const MarketplaceOrderEvent(this.status, this.createdAt, this.note);
  final String status;
  final DateTime createdAt;
  final String? note;

  factory MarketplaceOrderEvent.fromJson(Map<String, dynamic> json) =>
      MarketplaceOrderEvent(
        json['status'] as String? ?? 'REVIEW_PENDING',
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
        json['note'] as String?,
      );
}

class MarketplaceQuote {
  const MarketplaceQuote({
    required this.version,
    required this.productSubtotalTmt,
    required this.serviceFeeTmt,
    required this.shippingTmt,
    required this.totalTmt,
    required this.weightKg,
    required this.expiresAt,
  });

  final int version;
  final double productSubtotalTmt;
  final double serviceFeeTmt;
  final double shippingTmt;
  final double totalTmt;
  final double weightKg;
  final DateTime expiresAt;

  factory MarketplaceQuote.fromJson(Map<String, dynamic> json) =>
      MarketplaceQuote(
        version: (json['version'] as num?)?.toInt() ?? 1,
        productSubtotalTmt: Money.parse(json['productSubtotalTmt']),
        serviceFeeTmt: Money.parse(json['serviceFeeTmt']),
        shippingTmt: Money.parse(json['shippingTmt']),
        totalTmt: Money.parse(json['totalTmt']),
        weightKg: Money.parse(json['weightKg']),
        expiresAt:
            DateTime.tryParse(json['expiresAt'] as String? ?? '') ??
            DateTime.now(),
      );
}

class MarketplaceOrder {
  const MarketplaceOrder({
    required this.id,
    required this.status,
    required this.expectedAmount,
    required this.maximumAuthorizedAmount,
    required this.currency,
    required this.deliveryAddress,
    required this.items,
    required this.quotes,
    required this.events,
    required this.createdAt,
    required this.authorizedTmt,
    required this.settledTmt,
    required this.refundedTmt,
  });

  final String id;
  final String status;
  final double expectedAmount;
  final double maximumAuthorizedAmount;
  final String currency;
  final String deliveryAddress;
  final List<MarketplaceCartItem> items;
  final List<MarketplaceQuote> quotes;
  final List<MarketplaceOrderEvent> events;
  final DateTime createdAt;
  final double authorizedTmt;
  final double settledTmt;
  final double refundedTmt;

  MarketplaceQuote? get latestQuote => quotes.isEmpty ? null : quotes.last;

  factory MarketplaceOrder.fromJson(
    Map<String, dynamic> json,
  ) => MarketplaceOrder(
    id: json['id'] as String,
    status: json['status'] as String? ?? 'REVIEW_PENDING',
    expectedAmount: Money.parse(
      json['expectedTotalTmt'] ??
          json['expectedAmount'] ??
          _lastJsonObject(json['quotes'])?['totalTmt'],
    ),
    maximumAuthorizedAmount: Money.parse(
      json['maxAuthorizedTmt'] ?? json['maximumAuthorizedAmount'],
    ),
    currency: json['currency'] as String? ?? 'TMT',
    deliveryAddress: json['deliveryAddress'] as String? ?? '',
    items: ((json['items'] as List<dynamic>?) ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(
          // A saved order's item carries the server's own snapshot fields, which are named
          // differently from what /resolve returns -- map them across rather than reusing a
          // preview parser that would silently produce empty strings.
          (item) => MarketplaceCartItem(
            preview: MarketplaceLinkPreview(
              sourceCode: item['sourceCode'] as String? ?? '',
              sourceName: item['sourceCode'] as String? ?? '',
              canonicalUrl: item['canonicalUrl'] as String? ?? '',
              externalId: item['externalIdSnapshot'] as String?,
              isProductPage: true,
              requiresManualReview: item['unitPriceSnapshot'] == null,
              // The verified snapshot wins; what the customer's browser read fills the gap. Both
              // were dropped here, so a saved order showed a shop name and an article and nothing
              // that would let anybody recognise their own purchase.
              title:
                  item['titleSnapshot'] as String? ??
                  item['reportedTitle'] as String?,
              priceCurrent: Money.tryParse(
                item['unitPriceSnapshot'] ?? item['reportedPrice'],
              ),
              priceCurrency:
                  item['sourceCurrencySnapshot'] as String? ??
                  item['reportedCurrency'] as String?,
              // Only set when the figure shown is the unverified one, so the card can say so.
              factsSource: item['unitPriceSnapshot'] == null
                  ? item['reportedSource'] as String?
                  : null,
            ),
            quantity: (item['quantity'] as num?)?.toInt() ?? 1,
            variant: item['variant'] as String?,
          ),
        )
        .toList(),
    quotes: ((json['quotes'] as List<dynamic>?) ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(MarketplaceQuote.fromJson)
        .toList(),
    events: ((json['events'] as List<dynamic>?) ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(MarketplaceOrderEvent.fromJson)
        .toList(),
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    authorizedTmt: Money.parse(json['authorizedTmt']),
    settledTmt: Money.parse(json['settledTmt']),
    refundedTmt: Money.parse(json['refundedTmt']),
  );
}
