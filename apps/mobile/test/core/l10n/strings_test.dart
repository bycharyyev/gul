import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/errors/app_exception.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';

void main() {
  group('Strings.resolve', () {
    test('maps every Turkmen spelling onto the tag the API accepts', () {
      // The API validates `@IsIn(["ru","en","tkm"])`. Sending the ISO `tk` is a 400.
      expect(Strings.resolve('tk').locale, 'tkm');
      expect(Strings.resolve('tkm').locale, 'tkm');
      expect(Strings.resolve('tuk').locale, 'tkm');
    });

    test('falls back to Russian for anything unsupported', () {
      expect(Strings.resolve(null).locale, 'ru');
      expect(Strings.resolve('de').locale, 'ru');
      expect(Strings.resolve('').locale, 'ru');
    });

    test('Material gets a locale flutter_localizations actually has', () {
      // There is no Turkmen Material translation; asking the global delegate to load `tkm` fails.
      expect(Strings.resolve('tkm').materialLocale, const Locale('ru'));
      expect(Strings.resolve('en').materialLocale, const Locale('en'));
    });
  });

  group('lookup', () {
    test('falls back to Russian for a key a locale is missing', () {
      expect(const Strings('en').get('auth.login.submit'), 'Sign in');
      expect(const Strings('tkm').get('auth.login.submit'), 'Gir');
    });

    test(
      'returns the key itself rather than blank text when nothing matches',
      () {
        expect(const Strings('ru').get('no.such.key'), 'no.such.key');
      },
    );

    test('every locale defines the same keys', () {
      // A key added to `ru` only renders Russian to an English speaker with nothing failing.
      // Comparing the raw key sets is what catches it.
      final ru = Strings.keysFor('ru');
      expect(ru, isNotEmpty);
      for (final locale in ['en', 'tkm']) {
        expect(
          Strings.keysFor(locale),
          ru,
          reason: '$locale is out of sync with ru',
        );
      }
    });
  });

  group('error copy', () {
    test('the backend message wins when there is one', () {
      const e = AppException(
        kind: AppErrorKind.server,
        serverMessage: 'Заказ уже оплачен',
      );
      expect(const Strings('ru').error(e), 'Заказ уже оплачен');
    });

    test('a stable code is said in the reader language, not passed through', () {
      // The login screen showed the API's own "Invalid credentials" to Russian speakers, which
      // is how a Russian app ends up with an English sentence on its very first screen.
      const e = AppException(
        kind: AppErrorKind.unauthorized,
        serverMessage: 'INVALID_CREDENTIALS',
      );
      expect(const Strings('ru').error(e), 'Неверный номер или пароль.');
      expect(const Strings('en').error(e), 'Wrong phone number or password.');
      expect(
        const Strings('tkm').error(e),
        'Telefon belgisi ýa-da parol nädogry.',
      );
    });

    test('an untranslated code is never shown raw', () {
      // A code the API adds before this table knows it must not reach the screen: NEW_CODE_HERE
      // tells a customer nothing, while the generic line at least says what to do.
      const e = AppException(
        kind: AppErrorKind.conflict,
        serverMessage: 'SOME_FUTURE_CODE',
      );
      for (final locale in ['ru', 'en', 'tkm']) {
        expect(Strings(locale).error(e), isNot(contains('SOME_FUTURE_CODE')));
      }
    });

    test('every kind has a fallback, in every locale', () {
      for (final locale in ['ru', 'en', 'tkm']) {
        for (final kind in AppErrorKind.values) {
          final text = Strings(locale).error(AppException(kind: kind));
          expect(text, isNotEmpty);
          expect(
            text,
            isNot(startsWith('err.')),
            reason: '$locale is missing copy for $kind',
          );
        }
      }
    });
  });
}
