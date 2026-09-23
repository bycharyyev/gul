import 'package:dio/dio.dart';

/// What went wrong, in terms the UI can branch on.
///
/// Deliberately small: the screen needs to know whether to offer "retry", "sign in again" or
/// "fix your input", and nothing finer than that.
enum AppErrorKind {
  network,
  timeout,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validation,
  rateLimited,
  server,
  unknown,
}

/// The single error type the UI ever sees. Dio exceptions, socket failures and non-2xx responses
/// are all mapped into this before leaving the network layer, so no screen ever pattern-matches
/// on a `DioException` or renders a raw exception string.
class AppException implements Exception {
  const AppException({
    required this.kind,
    this.serverMessage,
    this.serverCode,
    this.statusCode,
  });

  final AppErrorKind kind;

  /// The backend's own message when it is safe to show. This API returns user-facing Russian
  /// text for most business errors ("Неверный код"), which beats anything generated client-side.
  /// Null when the response carried nothing usable.
  final String? serverMessage;

  /// The API's stable `code` field. Prefer this over [serverMessage] whenever a localised string
  /// exists for it: the message is English for anything class-validator produced, the code is not.
  final String? serverCode;

  final int? statusCode;

  bool get isRetryable =>
      kind == AppErrorKind.network ||
      kind == AppErrorKind.timeout ||
      kind == AppErrorKind.server;

  @override
  String toString() =>
      'AppException($kind, status=$statusCode, message=$serverMessage)';
}

/// Turns anything the network layer can throw into an [AppException].
class ErrorMapper {
  const ErrorMapper();

  AppException map(Object error) {
    if (error is AppException) return error;
    if (error is! DioException) {
      return const AppException(kind: AppErrorKind.unknown);
    }

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      // Decoding a response that never finished arriving — a timeout from the user's side.
      case DioExceptionType.transformTimeout:
        return const AppException(kind: AppErrorKind.timeout);
      case DioExceptionType.connectionError:
      case DioExceptionType.unknown:
        return const AppException(kind: AppErrorKind.network);
      case DioExceptionType.cancel:
        return const AppException(kind: AppErrorKind.unknown);
      case DioExceptionType.badCertificate:
        return const AppException(kind: AppErrorKind.network);
      case DioExceptionType.badResponse:
        break;
    }

    final status = error.response?.statusCode;
    return AppException(
      kind: _kindFor(status),
      statusCode: status,
      serverMessage: extractMessage(error.response?.data),
      serverCode: _extractCode(error.response?.data),
    );
  }

  String? _extractCode(Object? data) {
    if (data is Map && data['code'] is String) return data['code'] as String;
    return null;
  }

  AppErrorKind _kindFor(int? status) => switch (status) {
    400 => AppErrorKind.validation,
    401 => AppErrorKind.unauthorized,
    403 => AppErrorKind.forbidden,
    404 => AppErrorKind.notFound,
    409 => AppErrorKind.conflict,
    422 => AppErrorKind.validation,
    429 => AppErrorKind.rateLimited,
    _ when status != null && status >= 500 => AppErrorKind.server,
    _ => AppErrorKind.unknown,
  };

  /// Reads `message` out of the backend envelope `{ code, message, statusCode }`.
  ///
  /// `message` is a String for most errors but an **array** for validation failures — Nest's
  /// ValidationPipe returns one entry per failed constraint. Joining with a separator matters:
  /// reading it as a string yields "first,second" with no space, which is exactly the bug the
  /// web client shipped.
  static String? extractMessage(Object? data) {
    if (data is! Map) return null;
    final raw = data['message'];
    if (raw is String && raw.trim().isNotEmpty) return raw;
    if (raw is List) {
      final parts = raw
          .whereType<String>()
          .where((s) => s.trim().isNotEmpty)
          .toList();
      if (parts.isNotEmpty) return parts.join('. ');
    }
    return null;
  }
}
