import '../../../core/config/feature_flags.dart';
import '../../../core/network/api_client.dart';
import '../domain/catalog_service.dart';
import '../domain/promo.dart';

/// Everything the home screen shows, assembled in one place.
///
/// There is no `/home` aggregate endpoint, so home is several independent calls. They are issued
/// in parallel — sequentially this would be four round-trips deep on a mobile connection.
///
/// `/social-links` is deliberately **not** fetched: nothing renders it yet, and opening an
/// external URL needs a launcher this build does not ship. It belongs with the support screen in
/// Phase 5. Fetching data no screen shows is a round-trip charged to the user's data plan on
/// every home load.
class HomeSnapshot {
  const HomeSnapshot({
    required this.services,
    required this.slides,
    required this.stories,
    required this.referralBalanceTmt,
  });

  final List<CatalogService> services;
  final List<Promo> slides;
  final List<Promo> stories;

  /// The referral balance, which is applied automatically as a checkout discount. Deliberately
  /// **not** called a wallet anywhere in the UI: there is no deposit or withdrawal mechanism for
  /// customers, and a "wallet" label would promise one. Null for sellers, whose rewards go to
  /// their payout balance instead.
  final double? referralBalanceTmt;
}

class HomeRepository {
  const HomeRepository(this._api);

  final ApiClient _api;

  Future<HomeSnapshot> load() async {
    // `Future.wait` fails on the first error, which is what we want for the catalogue — a home
    // screen without services is not a home screen. The balance is the exception; see below.
    final results = await Future.wait([
      _api.get<List<dynamic>>('/catalog/services'),
      _api.get<List<dynamic>>('/home-slides'),
      _api.get<List<dynamic>>('/stories'),
    ]);

    final now = DateTime.now();

    return HomeSnapshot(
      services: _map(results[0], CatalogService.fromJson)
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),
      slides: _livePromos(results[1], now),
      stories: _livePromos(results[2], now),
      referralBalanceTmt: kReferralRewardsEnabled
          ? await _referralBalance()
          : null,
    );
  }

  /// Fails soft. The balance is a nice-to-have line on a card; losing it must not blank the whole
  /// home screen, and a seller account legitimately has none.
  ///
  /// Not called at all while [kReferralRewardsEnabled] is off — see that flag for why this build
  /// must not even ask for a reward balance.
  Future<double?> _referralBalance() async {
    try {
      final data = await _api.get<Map<String, dynamic>>('/referrals/me');
      final raw = data['referralBalanceTmt'];
      return raw is num ? raw.toDouble() : null;
    } catch (_) {
      return null;
    }
  }

  static List<Promo> _livePromos(dynamic raw, DateTime now) {
    final promos =
        _map(raw, Promo.fromJson).where((p) => p.isLiveAt(now)).toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return promos;
  }

  static List<T> _map<T>(dynamic raw, T Function(Map<String, dynamic>) parse) {
    if (raw is! List) return [];
    return raw.whereType<Map<String, dynamic>>().map(parse).toList();
  }
}
