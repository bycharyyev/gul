import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/api_client.dart';
import '../../profile/domain/legal_page.dart';
import '../domain/welcome_copy.dart';

/// Reads the welcome screen's copy from the CMS, and remembers the last answer.
///
/// Every method here is written so that failure is silent and the caller keeps the built-in text.
/// This is the first screen a stranger sees, usually before they have any reason to trust the app;
/// a spinner, an error banner, or a blank headline because the CMS was unreachable would all be
/// worse than simply showing what shipped in the binary.
class WelcomeCopyRepository {
  WelcomeCopyRepository({required ApiClient api}) : _api = api;

  final ApiClient _api;

  static const slug = 'welcome';

  /// Per locale: switching the app to Turkmen must not show the Russian headline back from cache.
  static String _cacheKey(String locale) => 'welcome_copy.$locale';

  /// The copy last served, or null on a first run. Reading disk is fast enough to happen while the
  /// splash screen is already waiting on `/auth/me`, so in practice this lands before first paint.
  Future<WelcomeCopy?> readCached(String locale) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey(locale));
      if (raw == null) return null;
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic>
          ? WelcomeCopy.fromJson(decoded)
          : null;
    } catch (_) {
      // Corrupt or unreadable cache is not worth reporting: the built-in text is right there.
      return null;
    }
  }

  /// Asks the CMS. Returns null for "nothing to override with" — including a 404, which is the
  /// normal answer until somebody creates the page.
  Future<WelcomeCopy?> fetch(String locale) async {
    try {
      final json = await _api.get<Map<String, dynamic>>('/content-pages/$slug');
      final copy = WelcomeCopy.fromPage(LegalPage.fromJson(json, locale));
      if (copy != null) await _cache(locale, copy);
      return copy;
    } catch (_) {
      return null;
    }
  }

  Future<void> _cache(String locale, WelcomeCopy copy) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey(locale), jsonEncode(copy.toJson()));
    } catch (_) {
      // Not being able to remember it costs one request next launch. Nothing worth failing over.
    }
  }
}
