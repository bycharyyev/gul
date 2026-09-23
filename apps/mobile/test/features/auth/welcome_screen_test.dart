import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/core/theme/app_theme.dart';
import 'package:gulyaly_mobile/features/auth/data/welcome_copy_repository.dart';
import 'package:gulyaly_mobile/features/auth/domain/welcome_copy.dart';
import 'package:gulyaly_mobile/features/auth/presentation/welcome_screen.dart';
import 'package:gulyaly_mobile/features/profile/domain/legal_page.dart';
import 'package:mocktail/mocktail.dart';

class MockWelcomeCopyRepository extends Mock implements WelcomeCopyRepository {}

const _strings = Strings('ru');

/// `stringsProvider` is overridden with a value rather than left to resolve itself: it reads the
/// signed-in user, which would drag the auth controller and the platform keystore into a test
/// about text on a screen.
Widget _harness(
  MockWelcomeCopyRepository repository, {
  Size size = const Size(390, 844),
}) => ProviderScope(
  overrides: [
    stringsProvider.overrideWithValue(_strings),
    welcomeCopyRepositoryProvider.overrideWithValue(repository),
  ],
  child: MediaQuery(
    data: MediaQueryData(size: size),
    child: const MaterialApp(
      home: StringsScope(strings: _strings, child: WelcomeScreen()),
    ),
  ),
);

void main() {
  late MockWelcomeCopyRepository repository;

  setUp(() {
    repository = MockWelcomeCopyRepository();
    when(() => repository.readCached(any())).thenAnswer((_) async => null);
    when(() => repository.fetch(any())).thenAnswer((_) async => null);
  });

  testWidgets('says what the app is and offers both ways in', (t) async {
    await t.pumpWidget(_harness(repository));

    // Both halves of the headline. The accent line is a separate widget so it can carry the
    // gradient; a locale that dropped it would leave the sentence unfinished rather than
    // obviously broken, which is what this asserts against.
    expect(find.text(_strings.get('welcome.title')), findsOneWidget);
    expect(find.text(_strings.get('welcome.titleAccent')), findsOneWidget);

    expect(
      find.widgetWithText(FilledButton, _strings.get('welcome.start')),
      findsOneWidget,
    );
    expect(
      find.widgetWithText(TextButton, _strings.get('welcome.haveAccount')),
      findsOneWidget,
    );
  });

  testWidgets(
    'the artwork gives way on a short screen instead of pushing the buttons off',
    (t) async {
      // A 4in phone: the constellation is the only flexible thing here, so if it refuses to shrink
      // the copy and the buttons overflow the bottom.
      await t.pumpWidget(_harness(repository, size: const Size(360, 560)));

      expect(_overflowed(t), isFalse);
      expect(
        find.widgetWithText(FilledButton, _strings.get('welcome.start')),
        findsOneWidget,
      );
    },
  );

  testWidgets('the built-in copy is on screen before the CMS has answered', (
    t,
  ) async {
    // The whole design of this feature: no spinner, no blank headline, nothing to wait for. The
    // first frame carries real text even though the request has not completed.
    final pending = Completer<WelcomeCopy?>();
    when(() => repository.fetch(any())).thenAnswer((_) => pending.future);

    await t.pumpWidget(_harness(repository));
    expect(find.text(_strings.get('welcome.title')), findsOneWidget);

    pending.complete(null);
    await t.pumpAndSettle();
    expect(find.text(_strings.get('welcome.title')), findsOneWidget);
  });

  testWidgets('CMS copy replaces the shipped copy, line by line', (t) async {
    when(() => repository.fetch(any())).thenAnswer(
      (_) async => const WelcomeCopy(
        title: 'Дарите радость',
        subtitle: 'Скоро и почта.',
      ),
    );

    await t.pumpWidget(_harness(repository));
    await t.pumpAndSettle();

    expect(find.text('Дарите радость'), findsOneWidget);
    expect(find.text('Скоро и почта.'), findsOneWidget);
    // The accent line was not supplied, so the shipped one stands rather than going blank.
    expect(find.text(_strings.get('welcome.titleAccent')), findsOneWidget);
    expect(find.text(_strings.get('welcome.title')), findsNothing);
  });

  group('WelcomeCopy.fromPage', () {
    LegalPage page(String title, String body) => LegalPage(
      slug: WelcomeCopyRepository.slug,
      title: title,
      body: body,
      updatedAt: null,
    );

    test(
      'reads the first line of the body as the accent half of the headline',
      () {
        final copy = WelcomeCopy.fromPage(
          page('Дарите счастье', 'в одно касание\n\nСвязь и цветы.'),
        );

        expect(copy?.title, 'Дарите счастье');
        expect(copy?.titleAccent, 'в одно касание');
        expect(copy?.subtitle, 'Связь и цветы.');
      },
    );

    test(
      'a body with nothing after the first line leaves the subtitle to the app',
      () {
        final copy = WelcomeCopy.fromPage(
          page('Дарите счастье', 'в одно касание'),
        );

        expect(copy?.titleAccent, 'в одно касание');
        expect(copy?.subtitle, isNull);
      },
    );

    test('a page with no title is no override at all', () {
      // Rather than a screen headed by an empty string, which is what a naive read would produce
      // the first time somebody saves the page half-filled.
      expect(WelcomeCopy.fromPage(page('   ', 'в одно касание')), isNull);
    });
  });

  test('every stop of the headline gradient is legible on both grounds', () {
    // The first version painted this line in the two *wash* colours — the ones meant to be
    // smeared across a background at low opacity. As text they measured 2.4:1 against the page
    // and looked faded on the phone. Large bold text needs 3:1 (WCAG 1.4.3), and the accent line
    // carries half the sentence, so failing it is not a cosmetic problem.
    for (final stop in WelcomeScreen.headlineGradient) {
      expect(
        _contrast(stop, AppTheme.canvasLight),
        greaterThanOrEqualTo(3.0),
        reason: '$stop on the light ground',
      );
      expect(
        _contrast(stop, AppTheme.canvasDark),
        greaterThanOrEqualTo(3.0),
        reason: '$stop on the dark ground',
      );
    }
  });
}

/// `pumpWidget` records layout overflow as an exception rather than failing outright, so a screen
/// that runs off the bottom otherwise passes its assertions silently.
bool _overflowed(WidgetTester t) => t.takeException() != null;

double _contrast(Color a, Color b) {
  final la = _luminance(a);
  final lb = _luminance(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// WCAG relative luminance. Written out rather than taken from `Color.computeLuminance` so the
/// threshold above is checked against the published formula, not against Flutter's reading of it.
double _luminance(Color c) {
  double channel(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4) as double;
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}
