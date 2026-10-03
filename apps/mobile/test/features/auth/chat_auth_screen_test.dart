import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/auth/data/auth_repository.dart';
import 'package:gulyaly_mobile/features/auth/domain/user.dart';
import 'package:gulyaly_mobile/features/auth/presentation/chat_auth_screen.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

final _user = User.fromJson(const {
  'id': 'usr_1',
  'username': 'aygul',
  'role': 'CUSTOMER',
  'locale': 'ru',
});

Widget _harness(MockAuthRepository repository, ChatAuthStart start) {
  return ProviderScope(
    overrides: [authRepositoryProvider.overrideWithValue(repository)],
    child: MaterialApp(
      home: StringsScope(
        strings: const Strings('ru'),
        child: ChatAuthScreen(start: start),
      ),
    ),
  );
}

Future<void> _send(WidgetTester t, String text) async {
  await t.enterText(find.byType(TextField), text);
  await t.testTextInput.receiveAction(TextInputAction.send);
  await t.pumpAndSettle();
}

void main() {
  late MockAuthRepository repository;

  setUp(() => repository = MockAuthRepository());

  testWidgets('login: asks for the email, refuses a typo, then signs in', (
    t,
  ) async {
    when(
      () => repository.login(
        email: any(named: 'email'),
        password: any(named: 'password'),
      ),
    ).thenAnswer((_) async => _user);

    await t.pumpWidget(_harness(repository, ChatAuthStart.login));
    await t.pumpAndSettle();
    expect(find.text('Напишите вашу почту'), findsOneWidget);

    await _send(t, 'not-an-email');
    expect(
      find.text('Кажется, в почте опечатка. Проверьте ещё раз'),
      findsOneWidget,
    );

    await _send(t, '  Aygul@Example.com ');
    expect(find.text('Теперь пароль'), findsOneWidget);
    // The password is never echoed into the conversation.
    await _send(t, 'secret123');
    expect(find.text('secret123'), findsNothing);

    verify(
      () => repository.login(email: 'aygul@example.com', password: 'secret123'),
    ).called(1);
  });

  testWidgets('register: name can be skipped and a short password is refused', (
    t,
  ) async {
    await t.pumpWidget(_harness(repository, ChatAuthStart.register));
    await t.pumpAndSettle();
    expect(find.text('Как вас зовут?'), findsOneWidget);

    await t.tap(find.widgetWithText(OutlinedButton, 'Пропустить'));
    await t.pumpAndSettle();
    expect(find.text('Ваша почта? Пришлём на неё код'), findsOneWidget);

    await _send(t, 'new@example.com');
    await _send(t, 'short');
    expect(find.text('Нужно хотя бы 8 символов'), findsOneWidget);
    verifyNever(
      () => repository.startRegistration(
        email: any(named: 'email'),
        password: any(named: 'password'),
        fullName: any(named: 'fullName'),
        referredByUsername: any(named: 'referredByUsername'),
        locale: any(named: 'locale'),
      ),
    );
  });
}
