import '../../../core/network/api_client.dart';

/// Opening a shop, from an account that already exists.
///
/// One call, and deliberately a thin one: the phone and the password that identify a person are
/// not sent. The server reads them off the session, so nothing in this request can name somebody
/// else's account.
class SellerRepository {
  const SellerRepository(this._api);

  final ApiClient _api;

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
