/// The signed-in seller's own shop, from `GET /sellers/me` / `PATCH /sellers/me`.
///
/// Deliberately narrower than what the API actually returns (it hands back the whole `Seller`
/// row -- balance, payout details, Telegram link state and all). This type only carries what the
/// identity screen needs: what a customer sees when a post leads to the shop. The rest belongs to
/// a stats or payout screen, not to this one, and reading `json['whatever']` for a field nobody
/// parses is how a screen quietly starts depending on server internals it never declared.
class MyShop {
  const MyShop({
    required this.id,
    required this.handle,
    required this.shopName,
    required this.isEnabled,
    this.description,
    this.logoUrl,
  });

  final String id;
  final String handle;
  final String shopName;
  final String? description;
  final String? logoUrl;

  /// False while a moderator has switched the shop off. The shop still exists -- its handle and
  /// posts are the seller's own -- but customers cannot reach it, which this screen says plainly
  /// rather than leaving someone to wonder why nobody visits.
  final bool isEnabled;

  factory MyShop.fromJson(Map<String, dynamic> json) => MyShop(
    id: json['id'] as String? ?? '',
    handle: json['handle'] as String? ?? '',
    shopName: json['shopName'] as String? ?? '',
    description: json['description'] as String?,
    logoUrl: json['logoUrl'] as String?,
    isEnabled: json['isEnabled'] as bool? ?? true,
  );
}
