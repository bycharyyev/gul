import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/errors/app_exception.dart';
import 'package:gulyaly_mobile/features/auth/data/auth_repository.dart';
import 'package:gulyaly_mobile/features/auth/domain/user.dart';
import 'package:gulyaly_mobile/features/auth/presentation/auth_controller.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

final _user = User.fromJson(const {
  'id': 'usr_1',
  'phone': '+99361234567',
  'username': 'aygul',
  'role': 'CUSTOMER',
  'locale': 'ru',
});

void main() {
  late MockAuthRepository repository;
  late AuthController controller;

  setUp(() {
    repository = MockAuthRepository();
    controller = AuthController(repository);
  });

  tearDown(() => controller.dispose());

  group('restore', () {
    test('a valid stored session lands authenticated', () async {
      when(
        () => repository.restoreSession(),
      ).thenAnswer((_) async => (user: _user, reachable: true));

      await controller.restore();

      expect(controller.state.status, AuthStatus.authenticated);
      expect(controller.state.user, _user);
    });

    test('an unreachable server does not sign anybody out', () async {
      // The credentials on this device may be perfectly good -- nothing answered, so nobody
      // knows. Landing on `unauthenticated` here is what would take a password from someone who
      // never lost their session.
      when(
        () => repository.restoreSession(),
      ).thenAnswer((_) async => (user: null, reachable: false));

      await controller.restore();

      expect(controller.state.status, AuthStatus.unreachable);
      expect(controller.state.user, isNull);
    });

    test('no stored session lands unauthenticated with no user', () async {
      when(
        () => repository.restoreSession(),
      ).thenAnswer((_) async => (user: null, reachable: true));

      await controller.restore();

      expect(controller.state.status, AuthStatus.unauthenticated);
      expect(controller.state.user, isNull);
    });

    test('starts as unknown so the router can hold on the splash', () {
      expect(controller.state.status, AuthStatus.unknown);
    });
  });

  group('login', () {
    test('success authenticates and clears busy', () async {
      when(
        () => repository.login(
          phone: any(named: 'phone'),
          password: any(named: 'password'),
        ),
      ).thenAnswer((_) async => _user);

      expect(
        await controller.login(phone: '+99361234567', password: 'secret123'),
        isTrue,
      );
      expect(controller.state.status, AuthStatus.authenticated);
      expect(controller.state.busy, isFalse);
      expect(controller.state.error, isNull);
    });

    test('failure surfaces the error and stays signed out', () async {
      when(
        () => repository.restoreSession(),
      ).thenAnswer((_) async => (user: null, reachable: true));
      await controller.restore();

      when(
        () => repository.login(
          phone: any(named: 'phone'),
          password: any(named: 'password'),
        ),
      ).thenThrow(
        const AppException(
          kind: AppErrorKind.unauthorized,
          serverMessage: 'Неверный телефон или пароль',
          statusCode: 401,
        ),
      );

      expect(await controller.login(phone: '+993', password: 'wrong'), isFalse);
      expect(controller.state.status, AuthStatus.unauthenticated);
      expect(controller.state.busy, isFalse);
      expect(
        controller.state.error?.serverMessage,
        'Неверный телефон или пароль',
      );
    });

    test('a second tap while the first is in flight is ignored', () async {
      // The disabled button is the first line of defence, but a fast double-tap can land two
      // gestures before the first rebuild. This is the guarantee that matters.
      final gate = Completer<User>();
      when(
        () => repository.login(
          phone: any(named: 'phone'),
          password: any(named: 'password'),
        ),
      ).thenAnswer((_) => gate.future);

      final first = controller.login(phone: '+993', password: 'secret123');
      await Future<void>.delayed(Duration.zero);
      final second = await controller.login(
        phone: '+993',
        password: 'secret123',
      );

      expect(second, isFalse, reason: 'the second attempt must not start');
      gate.complete(_user);
      expect(await first, isTrue);

      verify(
        () => repository.login(phone: '+993', password: 'secret123'),
      ).called(1);
    });

    test('clears a previous error when a new attempt starts', () async {
      when(
        () => repository.login(
          phone: any(named: 'phone'),
          password: any(named: 'password'),
        ),
      ).thenThrow(const AppException(kind: AppErrorKind.network));
      await controller.login(phone: '+993', password: 'secret123');
      expect(controller.state.error, isNotNull);

      when(
        () => repository.login(
          phone: any(named: 'phone'),
          password: any(named: 'password'),
        ),
      ).thenAnswer((_) async => _user);
      await controller.login(phone: '+993', password: 'secret123');

      expect(controller.state.error, isNull);
    });
  });

  group('register', () {
    test('passes the optional fields through', () async {
      when(
        () => repository.register(
          phone: any(named: 'phone'),
          password: any(named: 'password'),
          fullName: any(named: 'fullName'),
          referredByUsername: any(named: 'referredByUsername'),
          locale: any(named: 'locale'),
        ),
      ).thenAnswer((_) async => _user);

      await controller.register(
        phone: '+99361234567',
        password: 'secret123',
        fullName: 'Aýgül',
        referredByUsername: 'merjen',
        locale: 'tkm',
      );

      verify(
        () => repository.register(
          phone: '+99361234567',
          password: 'secret123',
          fullName: 'Aýgül',
          referredByUsername: 'merjen',
          locale: 'tkm',
        ),
      ).called(1);
      expect(controller.state.status, AuthStatus.authenticated);
    });
  });

  group('ending a session', () {
    test('logout signs out even when clearing storage fails', () async {
      when(
        () => repository.logout(),
      ).thenThrow(Exception('keystore unavailable'));

      await controller.logout();

      expect(controller.state.status, AuthStatus.unauthenticated);
      expect(controller.state.user, isNull);
    });

    test('onSessionExpired drops the user', () async {
      when(
        () => repository.restoreSession(),
      ).thenAnswer((_) async => (user: _user, reachable: true));
      await controller.restore();

      controller.onSessionExpired();

      expect(controller.state.status, AuthStatus.unauthenticated);
      expect(controller.state.user, isNull);
    });
  });
}
