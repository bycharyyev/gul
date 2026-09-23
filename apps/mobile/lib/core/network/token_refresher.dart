import 'dart:async';

import 'package:dio/dio.dart';

import '../storage/token_store.dart';

/// Why a refresh produced no tokens.
///
/// `sessionOver` carries the whole distinction. A spent or revoked refresh token really does end
/// the session, and the only way forward is signing in again. Every other failure — offline, a
/// timeout, a 500 — leaves a perfectly valid session sitting on the device, and treating the two
/// alike demands a password from someone whose train went into a tunnel.
typedef RefreshOutcome = ({AuthTokens? tokens, bool sessionOver});

/// Refreshes the access token, at most once at a time.
///
/// Single-flight is not an optimisation here, it is correctness. The backend rotates refresh
/// tokens single-use: the moment one refresh succeeds the presented token is revoked. If five
/// parallel 401s each fired their own refresh, the first would succeed and the other four would
/// present an already-revoked token, fail, and log the user out mid-session.
///
/// So the first caller performs the refresh and every concurrent caller awaits the same future.
class TokenRefresher {
  TokenRefresher({required Dio refreshClient, required TokenStore store})
    : _client = refreshClient,
      _store = store;

  /// A Dio instance WITHOUT the auth interceptor. Refreshing through the interceptored client
  /// would let a 401 on the refresh call recurse into another refresh.
  final Dio _client;
  final TokenStore _store;

  Future<RefreshOutcome>? _inFlight;

  /// Completes with new tokens, or with the reason there are none.
  Future<RefreshOutcome> refresh() {
    return _inFlight ??= _performRefresh().whenComplete(() => _inFlight = null);
  }

  Future<RefreshOutcome> _performRefresh() async {
    final current = await _store.read();
    if (current == null) return const (tokens: null, sessionOver: true);

    try {
      final res = await _client.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': current.refreshToken},
      );

      final data = res.data;
      final access = data?['accessToken'];
      final refresh = data?['refreshToken'];
      if (access is! String || refresh is! String) {
        await _store.clear();
        return const (tokens: null, sessionOver: true);
      }

      final tokens = AuthTokens(accessToken: access, refreshToken: refresh);
      await _store.write(tokens);
      return (tokens: tokens, sessionOver: false);
    } on DioException catch (e) {
      // 401/403 means the refresh token is spent or revoked — the session is over, so drop it.
      // Anything else (offline, 500) is transient: keep the tokens so the next attempt can
      // succeed rather than signing the user out because their train went into a tunnel.
      final status = e.response?.statusCode;
      final over = status == 401 || status == 403;
      if (over) await _store.clear();
      return (tokens: null, sessionOver: over);
    }
  }
}
