import 'dart:developer' as developer;
import 'dart:math';

import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../errors/app_exception.dart';
import '../storage/token_store.dart';
import 'auth_interceptor.dart';
import 'token_refresher.dart';

/// The one way the app talks to the Gulyaly API.
///
/// Screens never touch Dio: repositories call these methods, and everything that leaves here is
/// either decoded JSON or an [AppException].
class ApiClient {
  ApiClient._({required Dio dio, required ErrorMapper mapper})
    : _dio = dio,
      _mapper = mapper;

  factory ApiClient.create({
    required AppConfig config,
    required TokenStore store,
    required Future<void> Function() onSessionExpired,
    Dio? dio,
    Dio? refreshDio,
  }) {
    final options = BaseOptions(
      baseUrl: config.apiBaseUrl,
      connectTimeout: config.connectTimeout,
      receiveTimeout: config.receiveTimeout,
      // Non-2xx must throw so one place maps them; letting Dio resolve them would push status
      // checks into every repository.
      validateStatus: (s) => s != null && s >= 200 && s < 300,
      contentType: Headers.jsonContentType,
    );

    final client = dio ?? Dio(options);
    if (dio != null) client.options = options;

    // A separate, interceptor-free client for refresh: a 401 on the refresh call itself must not
    // trigger another refresh.
    final refreshClient = refreshDio ?? Dio(options);
    if (refreshDio != null) refreshClient.options = options;

    client.interceptors.add(_RequestIdInterceptor());
    client.interceptors.add(
      AuthInterceptor(
        store: store,
        refresher: TokenRefresher(refreshClient: refreshClient, store: store),
        retryClient: client,
        onSessionExpired: onSessionExpired,
      ),
    );
    if (config.verboseLogging) client.interceptors.add(_LogInterceptor());

    return ApiClient._(dio: client, mapper: const ErrorMapper());
  }

  final Dio _dio;
  final ErrorMapper _mapper;

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    CancelToken? cancelToken,
  }) => _send(
    () => _dio.get<T>(path, queryParameters: query, cancelToken: cancelToken),
  );

  Future<T> post<T>(
    String path, {
    Object? body,
    Map<String, Object?>? headers,
    CancelToken? cancelToken,
  }) => _send(
    () => _dio.post<T>(
      path,
      data: body,
      options: Options(headers: headers),
      cancelToken: cancelToken,
    ),
  );

  /// Uploads a file. Separate from [post] because Dio needs the multipart body untouched by the
  /// JSON content type the base options set for everything else.
  /// Uploads a file.
  ///
  /// [onSendProgress] reports bytes sent out of bytes total. A video on a mobile connection takes
  /// long enough that a spinner alone is indistinguishable from a hang, and the person watching
  /// it has no way to tell whether waiting will help.
  Future<T> postMultipart<T>(
    String path,
    FormData form, {
    ProgressCallback? onSendProgress,
  }) => _send(
    () => _dio.post<T>(
      path,
      data: form,
      onSendProgress: onSendProgress,
      options: Options(contentType: Headers.multipartFormDataContentType),
    ),
  );

  Future<T> patch<T>(String path, {Object? body}) =>
      _send(() => _dio.patch<T>(path, data: body));

  Future<T> delete<T>(String path) => _send(() => _dio.delete<T>(path));

  Future<T> _send<T>(Future<Response<T>> Function() request) async {
    try {
      final res = await request();
      return res.data as T;
    } catch (e) {
      throw _mapper.map(e);
    }
  }
}

/// Tags every request so a client report can be matched to a server log line.
class _RequestIdInterceptor extends Interceptor {
  final _random = Random();

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final id = List.generate(
      8,
      (_) => _random.nextInt(16).toRadixString(16),
    ).join();
    options.headers['X-Request-Id'] = id;
    handler.next(options);
  }
}

/// Method, path and status only.
///
/// Bodies and headers are deliberately never logged: request bodies carry passwords and OTP
/// codes, and the Authorization header carries a bearer token. A log that is safe everywhere is
/// worth more than one that is occasionally richer.
class _LogInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    developer.log('→ ${options.method} ${options.path}', name: 'api');
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    developer.log(
      '← ${response.statusCode} ${response.requestOptions.path}',
      name: 'api',
    );
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    developer.log(
      '✗ ${err.response?.statusCode ?? err.type.name} ${err.requestOptions.path}',
      name: 'api',
    );
    handler.next(err);
  }
}
