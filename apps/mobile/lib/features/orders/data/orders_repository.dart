import '../../../core/network/api_client.dart';
import '../../home/domain/catalog_service.dart';
import '../domain/order.dart';

class OrdersRepository {
  const OrdersRepository(this._api);

  final ApiClient _api;

  /// The full history: top-ups and gift orders, merged and sorted newest first.
  ///
  /// Two lists rather than one because they are two backend tables. Merging them is a product
  /// decision, not a technical one — a customer thinks in "my orders", not in "the top-up
  /// pipeline" and "the gallery pipeline". The `kind` badge keeps them tellable apart.
  ///
  /// **There is no pagination on either endpoint** (see MOBILE_API_GAPS.md, GAP 2). This loads
  /// everything, which is correct at today's volume and will not be. The list layer is built so
  /// adopting a cursor is a change here and not in the UI.
  Future<List<OrderSummary>> loadMine() async {
    // `/orders/me` returns bare rows with a `serviceId` and no service relation, so the operator
    // name has to be joined in from the catalogue. Fetched in parallel with the orders rather
    // than after them.
    final results = await Future.wait([
      _api.get<List<dynamic>>('/orders/me'),
      _api.get<List<dynamic>>('/gallery/orders/me'),
      _api.get<List<dynamic>>('/catalog/services'),
    ]);

    final serviceNames = {
      for (final json in results[2].whereType<Map<String, dynamic>>())
        json['id'] as String: CatalogService.fromJson(json).name,
    };

    final orders = <OrderSummary>[
      for (final json in results[0].whereType<Map<String, dynamic>>())
        OrderSummary.fromTopupJson(
          json,
          serviceName: serviceNames[json['serviceId']],
        ),
      for (final json in results[1].whereType<Map<String, dynamic>>())
        OrderSummary.fromGalleryJson(json),
    ];

    // Newest first, with undated rows last rather than at an arbitrary position.
    orders.sort((a, b) {
      final left = a.createdAt;
      final right = b.createdAt;
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      return right.compareTo(left);
    });

    return orders;
  }

  /// A single top-up order, with its relations. Gift orders have no detail endpoint — their list
  /// row already carries everything the backend would return.
  Future<OrderSummary> loadTopup(String id) async {
    final json = await _api.get<Map<String, dynamic>>('/orders/$id');
    return OrderSummary.fromTopupJson(json);
  }
}
