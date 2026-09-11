import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/core/theme/app_theme.dart';
import 'package:gulyaly_mobile/features/gallery/data/gallery_repository.dart';
import 'package:gulyaly_mobile/features/gallery/domain/gallery_product.dart';
import 'package:gulyaly_mobile/features/social/data/social_feed_repository.dart';
import 'package:gulyaly_mobile/features/social/domain/social_post.dart';
import 'package:gulyaly_mobile/features/social/presentation/create_social_post_screen.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements SocialFeedRepository {}

class _Gallery extends Mock implements GalleryRepository {}

final _rose = GalleryProduct(
  id: 'prod-1',
  name: 'Букет «Гүл»',
  priceTmt: 350,
  sortOrder: 0,
);

Future<void> _open(
  WidgetTester t, {
  required SocialFeedRepository repo,
  GalleryRepository? gallery,
}) async {
  await t.pumpWidget(
    ProviderScope(
      overrides: [
        socialFeedRepositoryProvider.overrideWithValue(repo),
        if (gallery != null)
          galleryRepositoryProvider.overrideWithValue(gallery),
      ],
      child: MaterialApp(
        // The real theme, not the default one: the bug this screen had lived in the app's own
        // FilledButton theme and is invisible under Material's defaults.
        theme: AppTheme.light(),
        home: const CreateSocialPostScreen(),
        builder: (context, child) =>
            StringsScope(strings: const Strings('ru'), child: child!),
      ),
    ),
  );
  await t.pumpAndSettle();
}

void main() {
  setUpAll(() {
    registerFallbackValue(const GalleryFilter());
    registerFallbackValue(SocialPostKind.text);
  });

  testWidgets('opens as a place to write, not as a form to fill in', (t) async {
    // It used to open on a three-way Видео/Фото/Текст switch that had to be answered before
    // anything else. Nobody decides they are writing "a photo post" and then goes looking for a
    // photo -- the kind follows from what gets attached.
    await _open(t, repo: _Repository());

    expect(find.text('Что нового?'), findsOneWidget);
    expect(find.byType(SegmentedButton<SocialPostKind>), findsNothing);
    expect(find.text('Видео'), findsNothing);
  });

  testWidgets('the toolbar keeps both its title and its publish button', (
    t,
  ) async {
    // Both disappeared on the phone. The app's FilledButton theme asks for Size.fromHeight(54) --
    // Size(infinity, 54) -- for the full-width button at the bottom of a page; in an AppBar that
    // demand eats the whole toolbar, so the button drew nothing and the title was squeezed to
    // nothing. The screen had no way to publish anything at all.
    await _open(t, repo: _Repository());

    final button = find.widgetWithText(FilledButton, 'Опубликовать');
    expect(t.getSize(button).width, lessThan(360));
    expect(t.getSize(find.text('Создать')).width, greaterThan(0));
  });

  testWidgets('publishing stays off until there is something to publish', (
    t,
  ) async {
    final repo = _Repository();
    await _open(t, repo: repo);

    final button = find.widgetWithText(FilledButton, 'Опубликовать');
    expect(t.widget<FilledButton>(button).onPressed, isNull);

    await t.enterText(find.byType(TextField), 'Привет');
    await t.pump();

    expect(t.widget<FilledButton>(button).onPressed, isNotNull);
  });

  testWidgets('a text-only post is sent as TEXT with no media at all', (
    t,
  ) async {
    // The kind is derived. Nothing on this screen asks for it.
    final repo = _Repository();
    when(
      () => repo.create(
        kind: any(named: 'kind'),
        body: any(named: 'body'),
        mediaUrl: any(named: 'mediaUrl'),
        thumbnailUrl: any(named: 'thumbnailUrl'),
        productIds: any(named: 'productIds'),
      ),
    ).thenAnswer(
      (_) async => SocialPost(
        id: 'p1',
        authorName: 'A',
        createdAt: DateTime.utc(2026),
        kind: SocialPostKind.text,
        likeCount: 0,
        savedByMe: false,
        likedByMe: false,
        isMine: true,
      ),
    );

    await _open(t, repo: repo);
    await t.enterText(find.byType(TextField), 'Просто мысль');
    await t.pump();
    await t.tap(find.widgetWithText(FilledButton, 'Опубликовать'));
    await t.pump();

    verify(
      () => repo.create(
        kind: SocialPostKind.text,
        body: 'Просто мысль',
        mediaUrl: null,
        productIds: const [],
      ),
    ).called(1);
  });

  testWidgets('a product is chosen by looking at it, not by typing an id', (
    t,
  ) async {
    // What this replaces: a text field for comma-separated product ids. Nobody knows a cuid, so
    // in practice no post ever carried a product.
    final gallery = _Gallery();
    when(() => gallery.loadProducts(any())).thenAnswer((_) async => [_rose]);

    await _open(t, repo: _Repository(), gallery: gallery);
    await t.tap(find.byTooltip('Товар'));
    await t.pumpAndSettle();

    expect(find.text('Букет «Гүл»'), findsOneWidget);
    await t.tap(find.text('Букет «Гүл»'));
    await t.pumpAndSettle();

    // Attached, and visible as the thing it is.
    expect(find.widgetWithText(InputChip, 'Букет «Гүл»'), findsOneWidget);
  });
}
