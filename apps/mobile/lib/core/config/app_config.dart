/// Build-time configuration.
///
/// Values come from `--dart-define`, never from source, so the same code builds against dev,
/// staging and production without an edit. Only public configuration belongs here — there is no
/// server secret a mobile binary can keep.
enum AppEnvironment { development, staging, production }

class AppConfig {
  const AppConfig({
    required this.environment,
    required this.apiBaseUrl,
    required this.siteBaseUrl,
    required this.connectTimeout,
    required this.receiveTimeout,
  });

  final AppEnvironment environment;

  /// Includes the `/api` prefix — it is part of the path on this backend, not the host.
  final String apiBaseUrl;

  /// The public storefront, with no trailing slash. Referral links point at it (`/r/<code>`),
  /// so it is the website's address, not the API's — the two differ on every environment.
  final String siteBaseUrl;

  final Duration connectTimeout;
  final Duration receiveTimeout;

  bool get isProduction => environment == AppEnvironment.production;

  /// Debug logging is tied to the environment rather than to `kDebugMode`, so a release build
  /// pointed at staging can still be inspected while production never logs request bodies.
  bool get verboseLogging => environment != AppEnvironment.production;

  static AppConfig fromEnvironment() {
    const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');
    const url = String.fromEnvironment('API_BASE_URL');
    const site = String.fromEnvironment('SITE_BASE_URL');

    final environment = switch (env) {
      'production' => AppEnvironment.production,
      'staging' => AppEnvironment.staging,
      _ => AppEnvironment.development,
    };

    return AppConfig(
      environment: environment,
      apiBaseUrl: url.isNotEmpty ? url : _defaultUrlFor(environment),
      siteBaseUrl: (site.isNotEmpty ? site : _defaultSiteFor(environment))
          .replaceAll(RegExp(r'/+$'), ''),
      connectTimeout: const Duration(seconds: 15),
      // Generous: uploads and a cold server both live under this ceiling.
      receiveTimeout: const Duration(seconds: 30),
    );
  }

  static String _defaultUrlFor(AppEnvironment env) => switch (env) {
    // 10.0.2.2 is the host loopback as seen from the Android emulator; localhost there is
    // the emulator itself.
    AppEnvironment.development => 'http://10.0.2.2:4000/api',
    AppEnvironment.staging => 'https://api.gulyaly.pro/api',
    AppEnvironment.production => 'https://api.gulyaly.pro/api',
  };

  static String _defaultSiteFor(AppEnvironment env) => switch (env) {
    AppEnvironment.development => 'http://10.0.2.2:3000',
    AppEnvironment.staging => 'https://gulyaly.pro',
    AppEnvironment.production => 'https://gulyaly.pro',
  };

  /// The link a customer sends a friend. `/r/<code>` is a real route on the storefront: it stores
  /// the code and carries it through to registration, so the invite still counts even when the
  /// friend browses for a while before signing up.
  String referralLink(String code) => '$siteBaseUrl/r/$code';

  /// The link that brings somebody into a group. `/i/<code>` is a real route on the storefront,
  /// so a person who taps it without the app installed lands on a page that says what the group
  /// is rather than on a dead address.
  String groupInviteLink(String code) => '$siteBaseUrl/i/$code';
}
