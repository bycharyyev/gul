import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/errors/app_exception.dart';

DioException _badResponse(int status, Object? data) {
  final options = RequestOptions(path: '/anything');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response<Object?>(
      requestOptions: options,
      statusCode: status,
      data: data,
    ),
  );
}

void main() {
  const mapper = ErrorMapper();

  group('ErrorMapper', () {
    test('maps status codes to kinds', () {
      expect(mapper.map(_badResponse(400, null)).kind, AppErrorKind.validation);
      expect(
        mapper.map(_badResponse(401, null)).kind,
        AppErrorKind.unauthorized,
      );
      expect(mapper.map(_badResponse(403, null)).kind, AppErrorKind.forbidden);
      expect(mapper.map(_badResponse(404, null)).kind, AppErrorKind.notFound);
      expect(mapper.map(_badResponse(409, null)).kind, AppErrorKind.conflict);
      expect(mapper.map(_badResponse(422, null)).kind, AppErrorKind.validation);
      expect(
        mapper.map(_badResponse(429, null)).kind,
        AppErrorKind.rateLimited,
      );
      expect(mapper.map(_badResponse(500, null)).kind, AppErrorKind.server);
      expect(mapper.map(_badResponse(503, null)).kind, AppErrorKind.server);
    });

    test('maps transport failures', () {
      final options = RequestOptions(path: '/x');
      expect(
        mapper
            .map(
              DioException(
                requestOptions: options,
                type: DioExceptionType.connectionTimeout,
              ),
            )
            .kind,
        AppErrorKind.timeout,
      );
      expect(
        mapper
            .map(
              DioException(
                requestOptions: options,
                type: DioExceptionType.connectionError,
              ),
            )
            .kind,
        AppErrorKind.network,
      );
    });

    test('reads a string message', () {
      final e = mapper.map(_badResponse(401, {'message': 'Неверный пароль'}));
      expect(e.serverMessage, 'Неверный пароль');
    });

    test('joins an array message readably', () {
      // Nest's ValidationPipe returns one entry per failed constraint. Reading it as a string
      // yields "a,b" with no space — the exact bug the web client shipped.
      final e = mapper.map(
        _badResponse(400, {
          'message': [
            'phone must be longer than or equal to 6 characters',
            'password too short',
          ],
        }),
      );
      expect(
        e.serverMessage,
        'phone must be longer than or equal to 6 characters. password too short',
      );
    });

    test('ignores an empty or non-textual message', () {
      expect(
        mapper.map(_badResponse(400, {'message': '  '})).serverMessage,
        isNull,
      );
      expect(
        mapper.map(_badResponse(400, {'message': <String>[]})).serverMessage,
        isNull,
      );
      expect(
        mapper.map(_badResponse(400, {'message': 42})).serverMessage,
        isNull,
      );
      expect(
        mapper.map(_badResponse(400, 'plain text body')).serverMessage,
        isNull,
      );
    });

    test('passes an AppException through unchanged', () {
      const original = AppException(
        kind: AppErrorKind.conflict,
        serverMessage: 'dup',
      );
      expect(identical(mapper.map(original), original), isTrue);
    });

    test('only transport and server failures are worth retrying', () {
      expect(mapper.map(_badResponse(500, null)).isRetryable, isTrue);
      expect(mapper.map(_badResponse(401, null)).isRetryable, isFalse);
      expect(mapper.map(_badResponse(400, null)).isRetryable, isFalse);
    });
  });
}
