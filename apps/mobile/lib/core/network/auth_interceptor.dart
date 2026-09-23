import 'package:dio/dio.dart';

import '../storage/token_store.dart';
import 'token_refresher.dart';

/// Attaches the access token, and on a 401 refreshes once and replays the request.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required TokenStore store,
    required TokenRefresher refresher,
    required Dio retryClient,
    required Future<void> Function() onSessionExpired,
  }) : _store = store,
       _refresher = refresher,
       _retryClient = retryClient,
       _onSessionExpired = onSessionExpired;

  final TokenStore _store;
  final TokenRefresher _refresher;

  /// Used to replay the original request after a refresh. Same instance as the main client —
  /// safe because `_retried` stops a replay from looping.
  final Dio _retryClient;

  final Future<void> Function() _onSessionExpired;

  /// Marks a request that has already been replayed once, so a second 401 ends the session
  /// instead of refreshing forever.
  static const _retriedKey = 'gulyaly.retried';

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // Auth endpoints must go out unauthenticated: sending a stale token to /auth/login or
    // /auth/refresh invites a 401 that has nothing to do with the credentials being presented.
    if (!_needsAuth(options.path)) return handler.next(options);

    final tokens = await _store.read();
    if (tokens != null) {
      options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final status = err.response?.statusCode;
    final options = err.requestOptions;

    final shouldRefresh =
        status == 401 &&
        _needsAuth(options.path) &&
        options.extra[_retriedKey] != true;

    if (!shouldRefresh) return handler.next(err);

    // Concurrent 401s all land here and all await the same in-flight refresh.
    final outcome = await _refresher.refresh();
    final tokens = outcome.tokens;
    if (tokens == null) {
      // Only a session the server actually rejected ends here. A refresh that failed because the
      // network dropped leaves the credentials intact and valid, so the request simply fails and
      // the screen offers a retry — signing someone out over a lost packet would be worse than
      // the error they already have to see.
      if (outcome.sessionOver) await _onSessionExpired();
      return handler.next(err);
    }

    try {
      // A multipart body cannot be sent twice: its file streams were consumed by the attempt that
      // just got the 401, and replaying the same FormData sends nothing. An upload long enough to
      // outlive a 15-minute access token -- a video on a mobile connection -- is exactly the
      // request most likely to land here, so it is exactly the one that must survive the retry.
      final body = options.data;
      if (body is FormData) options.data = body.clone();
      final replayed = await _retryClient.fetch<dynamic>(
        options
          ..headers['Authorization'] = 'Bearer ${tokens.accessToken}'
          ..extra[_retriedKey] = true,
      );
      return handler.resolve(replayed);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) await _onSessionExpired();
      return handler.next(e);
    }
  }

  static bool _needsAuth(String path) {
    const unauthenticated = {
      '/auth/login',
      '/auth/register',
      '/auth/refresh',
      '/auth/password-reset/request',
      '/auth/password-reset/confirm',
    };
    return !unauthenticated.contains(path);
  }
}
