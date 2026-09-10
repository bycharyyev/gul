import '../../../core/format/money.dart';

class GalleryCategory {
  const GalleryCategory({
    required this.id,
    required this.name,
    required this.slug,
    required this.sortOrder,
  });

  final String id;
  final String name;
  final String slug;
  final int sortOrder;

  factory GalleryCategory.fromJson(Map<String, dynamic> json) =>
      GalleryCategory(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        slug: json['slug'] as String? ?? '',
        sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      );
}

/// A gift or bouquet.
///
/// One image, not a gallery — `imageUrl` is a single field on the model. The price arrives as a
/// string like every Prisma `Decimal` (`"priceTmt":"350"`), and it is display-only: the order
/// endpoint reads the price from the product server-side and the client never sends an amount.
class GalleryProduct {
  const GalleryProduct({
    required this.id,
    required this.name,
    required this.priceTmt,
    required this.sortOrder,
    this.sku,
    this.description,
    this.imageUrl,
    this.categoryId,
    this.categoryName,
    this.sellerId,
    this.sellerName,
  });

  final String id;
  final String name;
  final double priceTmt;
  final int sortOrder;
  final String? sku;
  final String? description;
  final String? imageUrl;
  final String? categoryId;
  final String? categoryName;

  /// Null for house stock — most of the catalogue today has `sellerId: null`. When a seller does
  /// own the product, saying so is not decoration: the customer is buying from that shop.
  final String? sellerName;

  /// Needed to open a conversation with the shop. The API has always sent it; the app simply
  /// never read it, so there was no way to reach a seller from the thing they are selling.
  final String? sellerId;

  factory GalleryProduct.fromJson(Map<String, dynamic> json) {
    final category = json['category'] as Map<String, dynamic>?;
    final seller = json['seller'] as Map<String, dynamic>?;

    return GalleryProduct(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      priceTmt: Money.parse(json['priceTmt']),
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      sku: _nonEmpty(json['sku']),
      description: _nonEmpty(json['description']),
      imageUrl: _nonEmpty(json['imageUrl']),
      categoryId: _nonEmpty(json['categoryId']),
      categoryName: _nonEmpty(category?['name']),
      // `shopName` is what a customer would recognise; `handle` is the seller's login-ish id.
      sellerId: _nonEmpty(seller?['id']),
      sellerName:
          _nonEmpty(seller?['shopName']) ?? _nonEmpty(seller?['handle']),
    );
  }

  static String? _nonEmpty(Object? raw) {
    if (raw is! String) return null;
    final trimmed = raw.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  @override
  bool operator ==(Object other) => other is GalleryProduct && other.id == id;

  @override
  int get hashCode => id.hashCode;
}
