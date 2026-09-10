import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The tokens, and the only place they are persisted.
class AuthTokens {
  const AuthTokens({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;
}

/// Persists tokens in the platform keystore — Keychain on iOS, EncryptedSharedPreferences on
/// Android. Never SharedPreferences: a refresh token there is readable by anything that can read
/// the app's files, and on a rooted device that is everything.
abstract class TokenStore {
  Future<AuthTokens?> read();
  Future<void> write(AuthTokens tokens);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock,
            ),
          );

  final FlutterSecureStorage _storage;

  static const _accessKey = 'gulyaly.access_token';
  static const _refreshKey = 'gulyaly.refresh_token';

  /// Held in memory as well as in the keystore. Every request reads the access token, and a
  /// keystore round-trip per request is a real cost on Android.
  AuthTokens? _cached;

  @override
  Future<AuthTokens?> read() async {
    if (_cached != null) return _cached;
    final access = await _storage.read(key: _accessKey);
    final refresh = await _storage.read(key: _refreshKey);
    if (access == null || refresh == null) return null;
    return _cached = AuthTokens(accessToken: access, refreshToken: refresh);
  }

  @override
  Future<void> write(AuthTokens tokens) async {
    _cached = tokens;
    await _storage.write(key: _accessKey, value: tokens.accessToken);
    await _storage.write(key: _refreshKey, value: tokens.refreshToken);
  }

  @override
  Future<void> clear() async {
    _cached = null;
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}
