import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/errors/app_exception.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/auth/data/auth_repository.dart';
import 'package:gulyaly_mobile/features/auth/domain/user.dart';
import 'package:gulyaly_mobile/features/auth/presentation/register_screen.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

const _strings = Strings('ru');

Widget _harness(MockAuthRepository repository) => ProviderScope(
  overrides: [authRepositoryProvider.overrideWithValue(repository)],
  child: const MaterialApp(
    home: StringsScope(strings: _strings, child: RegisterScreen()),
  ),
);

Future<void> _fillAndSubmit(WidgetTester t, {String referral = '1000'}) async {
  await t.enterText(find.byType(TextFormField).at(0), '+99361234567');
  await t.enterText(find.byType(TextFormField).at(1), 'secret123');
  await t.enterText(find.byType(TextFormField).at(2), 'Aygul');
  await t.enterText(find.byType(TextFormField).at(3), referral);
  await t.tap(
    find.widgetWithText(FilledButton, _strings.get('auth.register.submit')),
  );
  await t.pumpAndSettle();
}

void main() {
  late MockAuthRepository repository;

  setUp(() {
    repository = MockAuthRepository();
    when(
      () => repository.restoreSession(),
    ).thenAnswer((_) async => (user: null, reachable: true));
  });

  testWidgets(
    'a phone that already has an account says so, in the reader\'s language',
    (t) async {
      // Reachable without anybody doing anything wrong: a registration that times out on a bad
      // connection may still have succeeded on the server, and the retry then collides with the
      // account it just created. The API answers 409 with English text, which would otherwise win
      // over every localised string and leave a Russian-speaking customer at a dead end — with the
      // sign-in link they need sitting right under the banner.
      when(
        () => repository.register(
          phone: any(named: 'phone'),
          password: any(named: 'password'),
          fullName: any(named: 'fullName'),
          referredByUsername: any(named: 'referredByUsername'),
          locale: any(named: 'locale'),
        ),
      ).thenThrow(
        const AppException(
          kind: AppErrorKind.conflict,
          statusCode: 409,
          serverMessage: 'Phone already registered',
        ),
      );

      await t.pumpWidget(_harness(repository));
      await _fillAndSubmit(t);

      expect(
        find.text(_strings.get('auth.register.phoneTaken')),
        findsOneWidget,
      );
      expect(find.text('Phone already registered'), findsNothing);
    },
  );

  testWidgets('the referral code survives a retry after a timeout', (t) async {
    // The first attempt fails the way a phone on a connection that is still coming up fails. The
    // retry must send the same invitation code — losing it there would silently cost the inviter
    // their reward, and nothing on screen would show that anything had gone missing.
    var attempts = 0;
    when(
      () => repository.register(
        phone: any(named: 'phone'),
        password: any(named: 'password'),
        fullName: any(named: 'fullName'),
        referredByUsername: any(named: 'referredByUsername'),
        locale: any(named: 'locale'),
      ),
    ).thenAnswer((_) async {
      attempts++;
      if (attempts == 1) throw const AppException(kind: AppErrorKind.timeout);
      return User.fromJson(const {
        'id': 'usr_9',
        'phone': '+99361234567',
        'username': '1007',
        'role': 'CUSTOMER',
        'locale': 'ru',
      });
    });

    await t.pumpWidget(_harness(repository));
    await _fillAndSubmit(t, referral: '1000');

    // A timeout is retryable, so the banner offers the retry the customer actually pressed.
    // The antifraud note above the banner (shown whenever a referral code is entered, as it is
    // here) makes this form tall enough that the retry button sits below the fold on a short
    // screen -- `ensureVisible` is the harness doing what a real thumb would: scroll the
    // SingleChildScrollView down before tapping, rather than tapping blind at an off-screen
    // coordinate the way a bare `tap()` does.
    final retryButton = find.widgetWithText(
      TextButton,
      _strings.get('common.retry'),
    );
    await t.ensureVisible(retryButton);
    await t.tap(retryButton);
    await t.pumpAndSettle();

    expect(attempts, 2);
    final sent = verify(
      () => repository.register(
        phone: any(named: 'phone'),
        password: any(named: 'password'),
        fullName: any(named: 'fullName'),
        referredByUsername: captureAny(named: 'referredByUsername'),
        locale: any(named: 'locale'),
      ),
    ).captured;
    expect(sent, ['1000', '1000']);
  });
}
