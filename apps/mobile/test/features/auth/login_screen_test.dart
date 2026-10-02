import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/errors/app_exception.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/auth/data/auth_repository.dart';
import 'package:gulyaly_mobile/features/auth/domain/user.dart';
import 'package:gulyaly_mobile/features/auth/presentation/login_screen.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

final _user = User.fromJson(const {
  'id': 'usr_1',
  'phone': '+99361234567',
  'username': 'aygul',
  'role': 'CUSTOMER',
  'locale': 'ru',
});

/// Overrides the repository rather than the HTTP layer, so nothing here touches the platform
/// keystore — `flutter_secure_storage` has no implementation in a unit-test binding.
Widget _harness(MockAuthRepository repository) {
  return ProviderScope(
    overrides: [authRepositoryProvider.overrideWithValue(repository)],
    child: const MaterialApp(
      home: StringsScope(strings: Strings('ru'), child: LoginScreen()),
    ),
  );
}

void main() {
  late MockAuthRepository repository;

  setUp(() => repository = MockAuthRepository());

  testWidgets('rejects something that is not an email, without a request', (
    t,
  ) async {
    await t.pumpWidget(_harness(repository));

    await t.enterText(find.byType(TextFormField).first, '+99361234567');
    await t.enterText(find.byType(TextFormField).last, 'secret123');
    await t.tap(find.widgetWithText(FilledButton, 'Войти'));
    await t.pump();

    expect(find.text('Введите корректный email'), findsOneWidget);
    verifyNever(
      () => repository.login(
        email: any(named: 'email'),
        password: any(named: 'password'),
      ),
    );
  });

  testWidgets('signs in with the address lower-cased and trimmed', (t) async {
    when(
      () => repository.login(
        email: any(named: 'email'),
        password: any(named: 'password'),
      ),
    ).thenAnswer((_) async => _user);

    await t.pumpWidget(_harness(repository));
    await t.enterText(find.byType(TextFormField).first, '  Aygul@Example.com ');
    await t.enterText(find.byType(TextFormField).last, 'secret123');
    await t.tap(find.byType(FilledButton));
    await t.pumpAndSettle();

    verify(
      () => repository.login(email: 'aygul@example.com', password: 'secret123'),
    ).called(1);
  });

  testWidgets('the submit button is disabled while a login is in flight', (
    t,
  ) async {
    final gate = Completer<User>();
    when(
      () => repository.login(
        email: any(named: 'email'),
        password: any(named: 'password'),
      ),
    ).thenAnswer((_) => gate.future);

    await t.pumpWidget(_harness(repository));
    await t.enterText(find.byType(TextFormField).first, 'aygul@example.com');
    await t.enterText(find.byType(TextFormField).last, 'secret123');
    await t.tap(find.byType(FilledButton));
    await t.pump();

    expect(t.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    gate.complete(_user);
    await t.pumpAndSettle();
  });

  testWidgets('shows the backend message when the credentials are wrong', (
    t,
  ) async {
    when(
      () => repository.login(
        email: any(named: 'email'),
        password: any(named: 'password'),
      ),
    ).thenThrow(
      const AppException(
        kind: AppErrorKind.unauthorized,
        serverMessage: 'Неверный email или пароль',
        statusCode: 401,
      ),
    );

    await t.pumpWidget(_harness(repository));
    await t.enterText(find.byType(TextFormField).first, 'aygul@example.com');
    await t.enterText(find.byType(TextFormField).last, 'wrongpass');
    await t.tap(find.byType(FilledButton));
    await t.pumpAndSettle();

    expect(find.text('Неверный email или пароль'), findsOneWidget);
    // Nothing to retry on a wrong password — offering "Повторить" would be misleading.
    expect(find.text('Повторить'), findsNothing);
  });

  testWidgets('offers a retry when the failure was the network', (t) async {
    when(
      () => repository.login(
        email: any(named: 'email'),
        password: any(named: 'password'),
      ),
    ).thenThrow(const AppException(kind: AppErrorKind.network));

    await t.pumpWidget(_harness(repository));
    await t.enterText(find.byType(TextFormField).first, 'aygul@example.com');
    await t.enterText(find.byType(TextFormField).last, 'secret123');
    await t.tap(find.byType(FilledButton));
    await t.pumpAndSettle();

    expect(find.text('Нет соединения. Проверьте интернет.'), findsOneWidget);
    expect(find.text('Повторить'), findsOneWidget);
  });
}
