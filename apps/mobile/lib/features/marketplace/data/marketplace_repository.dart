import '../../../core/network/api_client.dart';
import '../domain/marketplace_models.dart';

/// Adapter boundary for the marketplace backend. Paths are intentionally centralized because
/// the server contract is being delivered independently from the mobile client.
abstract final class MarketplaceEndpoints {
  static const root = '/cargo/marketplace-purchases';
  static const sources = '$root/sources';
  static const resolve = '$root/resolve';
  static const history = '$root/history';
  static const orders = '$root/orders';
  static String order(String id) => '$orders/$id';
  static String acceptQuote(String id) => '${order(id)}/accept-quote';
}

class MarketplaceRepository {
  MarketplaceRepository(this._api);
  final ApiClient _api;

  /// Instant, network-free on the server side: the marketplace comes from the host and the
  /// article number from the URL. Previously this POSTed to the `/sources` listing endpoint,
  /// which does not accept a body -- the preview had never actually worked.
  Future<MarketplaceLinkPreview> resolve(String url) async {
    final json = await _api.post<Map<String, dynamic>>(
      MarketplaceEndpoints.resolve,
      body: {'url': url},
    );
    return MarketplaceLinkPreview.fromJson(json);
  }

  Future<List<MarketplaceSearchEntry>> history() async {
    final json = await _api.get<List<dynamic>>(MarketplaceEndpoints.history);
    return json
        .whereType<Map<String, dynamic>>()
        .map(MarketplaceSearchEntry.fromJson)
        .toList();
  }

  Future<List<MarketplaceOrder>> loadMine() async {
    final json = await _api.get<List<dynamic>>(MarketplaceEndpoints.orders);
    return json
        .whereType<Map<String, dynamic>>()
        .map(MarketplaceOrder.fromJson)
        .toList();
  }

  Future<MarketplaceOrder> load(String id) async {
    final json = await _api.get<Map<String, dynamic>>(
      MarketplaceEndpoints.order(id),
    );
    return MarketplaceOrder.fromJson(json);
  }

  /// Body shaped exactly like CreateMarketplacePurchaseDto. The previous version sent
  /// `expectedTotalTmt`, `maxAuthorizedTmt` and `priceChangeConsent`, none of which that DTO
  /// declares -- and the API runs ValidationPipe with `forbidNonWhitelisted`, so every create
  /// was rejected with a 400 before reaching the service. The spending limit is agreed later,
  /// when accepting the quote, which is the only point at which its amount is known.
  Future<MarketplaceOrder> create({
    required List<MarketplaceCartItem> items,
    required String currency,
    required String deliveryAddress,
    required String idempotencyKey,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      MarketplaceEndpoints.orders,
      body: {
        'items': items.map((item) => item.toJson()).toList(),
        'currency': currency,
        'deliveryAddress': deliveryAddress.trim(),
        'idempotencyKey': idempotencyKey,
      },
    );
    return MarketplaceOrder.fromJson(json);
  }

  Future<MarketplaceOrder> acceptQuote({
    required String orderId,
    required int quoteVersion,
    required double maxAuthorizedTmt,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      MarketplaceEndpoints.acceptQuote(orderId),
      body: {
        'quoteVersion': quoteVersion,
        'maxAuthorizedTmt': maxAuthorizedTmt,
        'consentAccepted': true,
        'consentVersion': 'mobile-v1',
      },
    );
    return MarketplaceOrder.fromJson(json);
  }
}
