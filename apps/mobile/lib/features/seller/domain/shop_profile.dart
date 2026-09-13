/// A shop as a customer sees it, from `GET /sellers/:handle`.
class ShopProfile {
  const ShopProfile({
    required this.id,
    required this.handle,
    required this.shopName,
    this.description,
    this.logoUrl,
    this.sections = const [],
    this.productCount = 0,
    this.postCount = 0,
  });

  final String id;
  final String handle;
  final String shopName;
  final String? description;
  final String? logoUrl;

  /// The shop's own shelves. Sent with the shop rather than behind a second request, because they
  /// are the shape of the page: a shop that renders its products first and rearranges itself when
  /// the shelves arrive is worse than one that waits.
  final List<ShopSection> sections;

  /// Counted server-side so the header can say how much is here before either tab has loaded --
  /// only what a visitor could actually see counts (enabled products, published posts).
  final int productCount;
  final int postCount;

  factory ShopProfile.fromJson(Map<String, dynamic> json) => ShopProfile(
    id: json['id'] as String? ?? '',
    handle: json['handle'] as String? ?? '',
    shopName: json['shopName'] as String? ?? '',
    description: json['description'] as String?,
    logoUrl: json['logoUrl'] as String?,
    productCount: (json['productCount'] as num?)?.toInt() ?? 0,
    postCount: (json['postCount'] as num?)?.toInt() ?? 0,
    sections: (json['storefronts'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ShopSection.fromJson)
        .toList(),
  );
}

class ShopSection {
  const ShopSection({
    required this.id,
    required this.name,
    required this.productCount,
    this.description,
    this.coverUrl,
  });

  final String id;
  final String name;
  final int productCount;
  final String? description;
  final String? coverUrl;

  factory ShopSection.fromJson(Map<String, dynamic> json) => ShopSection(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    productCount: (json['productCount'] as num?)?.toInt() ?? 0,
    description: json['description'] as String?,
    coverUrl: json['coverUrl'] as String?,
  );
}
