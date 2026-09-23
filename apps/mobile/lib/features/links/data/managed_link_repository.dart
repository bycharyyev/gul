import '../../../core/network/api_client.dart';

/// Resolves a `gulyaly.com/l/<slug>` short link -- the admin-editable redirects staff hand out
/// for a campaign or a one-off promo. Public, like the storefront routes it stands in for: a
/// visitor who followed this link before ever signing in still needs it to go somewhere.
class ManagedLinkRepository {
  const ManagedLinkRepository(this._api);
  final ApiClient _api;

  Future<String> resolveTargetUrl(String slug) async {
    final raw = await _api.get<Map<String, dynamic>>('/managed-links/$slug');
    return raw['targetUrl'] as String;
  }
}
