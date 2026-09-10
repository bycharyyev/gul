import '../../../core/errors/app_exception.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/token_store.dart';
import '../domain/user.dart';

/// Everything the app does with credentials. The only layer that knows the auth endpoints exist.
class AuthRepository {
  const AuthRepository({required ApiClient api, required TokenStore store})
    : _api = api,
      _store = store;

  final ApiClient _api;
  final TokenStore _store;

  /// Login is phone + password. There is no email login on this backend.
  Future<User> login({required String phone, required String password}) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/auth/login',
      body: {'phone': phone, 'password': password},
    );
    return _persist(data);
  }

  Future<User> register({
    required String phone,
    required String password,
    String? fullName,
    String? referredByUsername,
    String? locale,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/auth/register',
      body: {
        'phone': phone,
        'password': password,
        if (fullName != null && fullName.isNotEmpty) 'fullName': fullName,
        if (referredByUsername != null && referredByUsername.isNotEmpty)
          'referredByUsername': referredByUsername,
        if (locale != null) 'locale': locale,
      },
    );
    return _persist(data);
  }

  /// The stored session, or null. Called once at startup.
  ///
  /// Hitting `/auth/me` rather than trusting the stored token: it is the only way to learn that
  /// the account was blocked or the refresh token revoked while the app was closed. A 401 here
  /// is handled by the interceptor, which refreshes once and only then gives up.
  /// Never throws: the keystore read is inside the guard too. A device whose keystore is
  /// unavailable (it happens after some OS upgrades) must land on the login screen, not on a
  /// splash that never ends.
  /// Validates the stored session against the server.
  ///
  /// `reachable` is why this does not simply return a nullable user. Without it the caller cannot
  /// tell "the server says this session is finished" from "we never got an answer", and the app
  /// answers both with the login form — taking a password from someone whose credentials are
  /// valid, still on the device, and about to work again the moment the signal returns.
  Future<({User? user, bool reachable})> restoreSession() async {
    if (await _store.read() == null) return (user: null, reachable: true);
    try {
      final data = await _api.get<Map<String, dynamic>>('/auth/me');
      return (user: User.fromJson(data), reachable: true);
    } on AppException catch (e) {
      return (user: null, reachable: !e.isRetryable);
    } catch (_) {
      // A malformed body is our problem, not the network's, and retrying will not fix it.
      return (user: null, reachable: true);
    }
  }

  Future<User> me() async =>
      User.fromJson(await _api.get<Map<String, dynamic>>('/auth/me'));

  /// Clears local credentials. There is no server-side logout for a single session — the backend
  /// offers `/auth/logout-all`, which is a different, heavier action the user chooses explicitly.
  Future<void> logout() => _store.clear();

  Future<void> logoutEverywhere() async {
    try {
      await _api.post<void>('/auth/logout-all');
    } finally {
      // Local credentials go regardless: if the call failed the user still expects to be signed
      // out on this device.
      await _store.clear();
    }
  }

  Future<User> _persist(Map<String, dynamic> data) async {
    await _store.write(
      AuthTokens(
        accessToken: data['accessToken'] as String,
        refreshToken: data['refreshToken'] as String,
      ),
    );
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }
}
