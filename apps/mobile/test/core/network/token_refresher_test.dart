import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/network/token_refresher.dart';
import 'package:gulyaly_mobile/core/storage/token_store.dart';

/// Counts calls and lets the test decide when the response comes back, so several refreshes can
/// genuinely overlap instead of completing one after another.
class _CountingAdapter implements HttpClientAdapter {
  _CountingAdapter({required this.statusCode, required this.body});

  final int statusCode;
  final Map<String, dynamic> body;

  int callCount = 0;
  final gate = Completer<void>();

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    callCount++;
    await gate.future;
    return ResponseBody.fromString(
      jsonEncode(body),
      statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _FakeStore implements TokenStore {
  _FakeStore([this._tokens]);

  AuthTokens? _tokens;
  int clearCount = 0;

  @override
  Future<AuthTokens?> read() async => _tokens;

  @override
  Future<void> write(AuthTokens tokens) async => _tokens = tokens;

  @override
  Future<void> clear() async {
    clearCount++;
    _tokens = null;
  }
}

Dio _dio(HttpClientAdapter adapter) => Dio(
  BaseOptions(
    baseUrl: 'https://example.test/api',
    validateStatus: (s) => s != null && s >= 200 && s < 300,
  ),
)..httpClientAdapter = adapter;

void main() {
  group('TokenRefresher', () {
    test('five concurrent callers produce exactly one refresh request', () async {
      final adapter = _CountingAdapter(
        statusCode: 200,
        body: {'accessToken': 'access-2', 'refreshToken': 'refresh-2'},
      );
      final store = _FakeStore(
        const AuthTokens(accessToken: 'access-1', refreshToken: 'refresh-1'),
      );
      final refresher = TokenRefresher(
        refreshClient: _dio(adapter),
        store: store,
      );

      // All five start before any can finish — this is the situation that used to spend five
      // single-use refresh tokens and sign the user out.
      final futures = List.generate(5, (_) => refresher.refresh());
      await Future<void>.delayed(Duration.zero);
      adapter.gate.complete();
      final results = await Future.wait(futures);

      expect(adapter.callCount, 1);
      expect(results.every((r) => r.tokens?.accessToken == 'access-2'), isTrue);
      expect((await store.read())?.refreshToken, 'refresh-2');
    });

    test(
      'a later refresh starts a new request once the first has settled',
      () async {
        final first = _CountingAdapter(
          statusCode: 200,
          body: {'accessToken': 'a2', 'refreshToken': 'r2'},
        )..gate.complete();
        final store = _FakeStore(
          const AuthTokens(accessToken: 'a1', refreshToken: 'r1'),
        );
        final dio = _dio(first);
        final refresher = TokenRefresher(refreshClient: dio, store: store);

        await refresher.refresh();
        await refresher.refresh();

        expect(first.callCount, 2);
      },
    );

    test('401 on refresh clears the session', () async {
      final adapter = _CountingAdapter(
        statusCode: 401,
        body: {'message': 'expired'},
      )..gate.complete();
      final store = _FakeStore(
        const AuthTokens(accessToken: 'a1', refreshToken: 'r1'),
      );
      final refresher = TokenRefresher(
        refreshClient: _dio(adapter),
        store: store,
      );

      final outcome = await refresher.refresh();
      expect(outcome.tokens, isNull);
      // The server rejected the token, so the caller must be told the session is really over.
      expect(outcome.sessionOver, isTrue);
      expect(store.clearCount, 1);
      expect(await store.read(), isNull);
    });

    test('a transient failure keeps the tokens', () async {
      // 500, not 401: the session is probably fine, the server is not. Clearing here would sign
      // people out every time the API hiccups.
      final adapter = _CountingAdapter(
        statusCode: 500,
        body: {'message': 'boom'},
      )..gate.complete();
      final store = _FakeStore(
        const AuthTokens(accessToken: 'a1', refreshToken: 'r1'),
      );
      final refresher = TokenRefresher(
        refreshClient: _dio(adapter),
        store: store,
      );

      final outcome = await refresher.refresh();
      expect(outcome.tokens, isNull);
      // The distinction that keeps somebody signed in through a tunnel: no tokens came back, but
      // the session is not over, so nothing upstream may send them to the login form.
      expect(outcome.sessionOver, isFalse);
      expect(store.clearCount, 0);
      expect((await store.read())?.refreshToken, 'r1');
    });

    test('no stored token means no request at all', () async {
      final adapter = _CountingAdapter(statusCode: 200, body: const {})
        ..gate.complete();
      final store = _FakeStore();
      final refresher = TokenRefresher(
        refreshClient: _dio(adapter),
        store: store,
      );

      final outcome = await refresher.refresh();
      expect(outcome.tokens, isNull);
      expect(outcome.sessionOver, isTrue);
      expect(adapter.callCount, 0);
    });
  });
}
