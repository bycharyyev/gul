import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/home/domain/promo.dart';
import 'package:gulyaly_mobile/features/home/presentation/widgets/promo_carousel.dart';

Promo _promo(String id, String title) => Promo(
  id: id,
  title: title,
  linkType: PromoLinkType.service,
  sortOrder: 0,
  serviceId: 's1',
  imageUrl: null,
);

final _three = [
  _promo('a', 'Первый'),
  _promo('b', 'Второй'),
  _promo('c', 'Третий'),
];

Widget _harness(
  List<Promo> promos, {
  required bool reduceMotion,
}) => MaterialApp(
  home: MediaQuery(
    // copyWith on the ambient query: a bare MediaQueryData carries size zero and every
    // layout then "fits" in nothing.
    data: MediaQueryData(
      size: const Size(390, 844),
      disableAnimations: reduceMotion,
    ),
    child: StringsScope(
      strings: const Strings('ru'),
      child: Scaffold(
        body: PromoCarousel(promos: promos, onTap: (_) {}),
      ),
    ),
  ),
);

void main() {
  testWidgets('advances on its own', (t) async {
    await t.pumpWidget(_harness(_three, reduceMotion: false));
    await t.pump();

    expect(find.text('Первый'), findsOneWidget);

    // Past one interval, plus the transition.
    await t.pump(PromoCarousel.interval);
    await t.pumpAndSettle();

    expect(find.text('Второй'), findsOneWidget);
  });

  testWidgets('wraps around at the end rather than stopping', (t) async {
    await t.pumpWidget(_harness(_three, reduceMotion: false));
    await t.pump();

    for (var i = 0; i < 3; i++) {
      await t.pump(PromoCarousel.interval);
      await t.pumpAndSettle();
    }

    expect(find.text('Первый'), findsOneWidget);
  });

  testWidgets('never starts under reduced motion', (t) async {
    // The OS setting is not a suggestion. Someone who turned animations off did so because
    // moving content makes them ill or unable to read.
    await t.pumpWidget(_harness(_three, reduceMotion: true));
    await t.pump();

    await t.pump(PromoCarousel.interval * 2);
    await t.pumpAndSettle();

    expect(find.text('Первый'), findsOneWidget);
  });

  testWidgets('offers a pause control, and honours it', (t) async {
    await t.pumpWidget(_harness(_three, reduceMotion: false));
    await t.pump();

    // A real, labelled, 44dp control -- not a hidden gesture.
    final pause = find.byIcon(Icons.pause_rounded);
    expect(pause, findsOneWidget);

    await t.tap(pause);
    await t.pumpAndSettle();

    expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);

    await t.pump(PromoCarousel.interval * 2);
    await t.pumpAndSettle();

    expect(find.text('Первый'), findsOneWidget);
  });

  testWidgets('a drag stops the timer, so it cannot move under a finger', (
    t,
  ) async {
    await t.pumpWidget(_harness(_three, reduceMotion: false));
    await t.pump();

    await t.drag(find.byType(PageView), const Offset(-200, 0));
    await t.pumpAndSettle();
    expect(find.text('Второй'), findsOneWidget);

    // Having been touched, it stays where the person left it.
    await t.pump(PromoCarousel.interval * 2);
    await t.pumpAndSettle();
    expect(find.text('Второй'), findsOneWidget);
  });

  testWidgets('a single banner has no timer and no controls', (t) async {
    // A timer that changes nothing is pure battery cost, and a pause button for one slide is
    // furniture.
    await t.pumpWidget(_harness([_three.first], reduceMotion: false));
    await t.pumpAndSettle();

    expect(find.byIcon(Icons.pause_rounded), findsNothing);

    await t.pump(PromoCarousel.interval * 2);
    await t.pumpAndSettle();
    expect(find.text('Первый'), findsOneWidget);
  });
}
