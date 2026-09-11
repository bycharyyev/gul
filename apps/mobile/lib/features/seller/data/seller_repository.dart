import '../../../core/network/api_client.dart';
import '../domain/shop_profile.dart';

/// Opening a shop, from an account that already exists.
///
/// One call, and deliberately a thin one: the phone and the password that identify a person are
/// not sent. The server reads them off the session, so nothing in this request can name somebody
/// else's account.
class SellerRepository {
  const SellerRepository(this._api);

  final ApiClient _api;

  /// One shop's public page. No authentication: a shop is public, and a customer who has not
  /// signed in must still be able to see whose video they just watched.
  Future<ShopProfile> loadShop(String handle) async {
    final json = await _api.get<Map<String, dynamic>>('/sellers/$handle');
    return ShopProfile.fromJson(json);
  }

  Future<void> applyAsMe({
    required String handle,
    required String shopName,
    String? description,
  }) => _api.post<Map<String, dynamic>>(
    '/sellers/apply-as-me',
    body: {
      'handle': handle,
      'shopName': shopName,
      if (description != null && description.isNotEmpty)
        'description': description,
    },
  );
}
