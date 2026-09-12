import '../../../core/network/api_client.dart';
import '../../orders/domain/order.dart';
import '../domain/gallery_product.dart';

/// What the catalogue screen filters by. A value type so it can key a provider — two identical
/// filters must resolve to the same request rather than two.
class GalleryFilter {
  const GalleryFilter({this.categoryId, this.search, this.sellerId});

  final String? categoryId;
  final String? search;

  /// One shop's shelf. The catalogue never sets it; a shop page always does.
  final String? sellerId;

  bool get isEmpty =>
      categoryId == null &&
      sellerId == null &&
      (search == null || search!.isEmpty);

  GalleryFilter copyWith({
    String? categoryId,
    String? search,
    String? sellerId,
    bool clearCategory = false,
  }) => GalleryFilter(
    categoryId: clearCategory ? null : (categoryId ?? this.categoryId),
    search: search ?? this.search,
    sellerId: sellerId ?? this.sellerId,
  );

  @override
  bool operator ==(Object other) =>
      other is GalleryFilter &&
      other.categoryId == categoryId &&
      other.search == search &&
      other.sellerId == sellerId;

  @override
  int get hashCode => Object.hash(categoryId, search, sellerId);
}

class GalleryRepository {
  const GalleryRepository(this._api);

  final ApiClient _api;

  Future<List<GalleryCategory>> loadCategories() async {
    final raw = await _api.get<List<dynamic>>('/gallery/categories');
    return raw
        .whereType<Map<String, dynamic>>()
        .map(GalleryCategory.fromJson)
        .toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  /// Filtering and search happen **server-side**.
  ///
  /// `/gallery/products` accepts `categoryId`, `sellerId` and `search`, where `search` is a
  /// case-insensitive match across `name` and `sku` — verified live, Cyrillic included. Filtering
  /// a downloaded list on the client would work today at five products and stop working the
  /// moment the catalogue is real.
  Future<List<GalleryProduct>> loadProducts(GalleryFilter filter) async {
    final search = filter.search?.trim();
    final raw = await _api.get<List<dynamic>>(
      '/gallery/products',
      query: {
        if (filter.categoryId != null) 'categoryId': filter.categoryId,
        if (filter.sellerId != null) 'sellerId': filter.sellerId,
        if (search != null && search.isNotEmpty) 'search': search,
      },
    );
    return raw
        .whereType<Map<String, dynamic>>()
        .map(GalleryProduct.fromJson)
        .toList();
  }

  /// One product.
  ///
  /// There is no `GET /gallery/products/:id` (GAP 3), so this fetches the unfiltered list and
  /// picks the row out of it. Wasteful and honest — inventing the endpoint would be worse, and
  /// the screen normally opens from a list that already holds the object.
  Future<GalleryProduct?> loadProduct(String id) async {
    final products = await loadProducts(const GalleryFilter());
    return products.where((p) => p.id == id).firstOrNull;
  }

  /// Places the order.
  ///
  /// **No amount is sent.** `CreateGalleryOrderDto` has no price field at all — the server reads
  /// it from the product. A client that could name its own price is a client that can be told to
  /// name zero.
  Future<OrderSummary> createOrder({
    required String productId,
    required String recipientName,
    required String recipientPhone,
    required String deliveryCity,
    required String deliveryAddress,
    String? cardMessage,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/gallery/orders',
      body: {
        'productId': productId,
        'recipientName': recipientName,
        'recipientPhone': recipientPhone,
        'deliveryCity': deliveryCity,
        'deliveryAddress': deliveryAddress,
        if (cardMessage != null && cardMessage.isNotEmpty)
          'cardMessage': cardMessage,
      },
    );
    return OrderSummary.fromGalleryJson(json);
  }
}
