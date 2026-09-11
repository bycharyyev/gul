import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/seller/data/seller_repository.dart';
import 'package:gulyaly_mobile/features/gallery/data/gallery_repository.dart';
import 'package:gulyaly_mobile/features/seller/domain/my_shop.dart';
import 'package:gulyaly_mobile/features/seller/domain/shop_profile.dart';
import 'package:gulyaly_mobile/features/seller/presentation/my_shop_screen.dart';
import 'package:gulyaly_mobile/features/seller/presentation/shop_screen.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements SellerRepository {}

class _Gallery extends Mock implements GalleryRepository {}

const _shop = MyShop(
  id: 's1',
  handle: 'altyn',
  shopName: 'Altyn Ay',
  description: 'Букеты и подарки',
  logoUrl: null,
  isEnabled: true,
);

Future<void> _open(
  WidgetTester t,
  SellerRepository repo, {
  GalleryRepository? gallery,
}) async {
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (_, __) => const MyShopScreen()),
      GoRoute(
        path: '/${ShopScreen.pathSegment}/:handle',
        builder: (_, state) =>
            ShopScreen(handle: state.pathParameters['handle']!),
      ),
    ],
  );
  await t.pumpWidget(
    ProviderScope(
      overrides: [
        sellerRepositoryProvider.overrideWithValue(repo),
        if (gallery != null)
          galleryRepositoryProvider.overrideWithValue(gallery),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        builder: (context, child) =>
            StringsScope(strings: const Strings('ru'), child: child!),
      ),
    ),
  );
  await t.pumpAndSettle();
}

void main() {
  setUpAll(() => registerFallbackValue(const GalleryFilter()));

  testWidgets('pre-fills what the shop already has', (t) async {
    final repo = _Repository();
    when(() => repo.getMyProfile()).thenAnswer((_) async => _shop);

    await _open(t, repo);

    expect(find.text('Altyn Ay'), findsOneWidget);
    expect(find.text('altyn'), findsOneWidget);
    expect(find.text('Букеты и подарки'), findsOneWidget);
  });

  testWidgets('stays off until something actually changed', (t) async {
    final repo = _Repository();
    when(() => repo.getMyProfile()).thenAnswer((_) async => _shop);

    await _open(t, repo);

    final button = find.widgetWithText(FilledButton, 'Сохранить');
    expect(t.widget<FilledButton>(button).onPressed, isNull);

    await t.enterText(find.byType(TextField).first, 'Altyn Ay Gül');
    await t.pump();

    expect(t.widget<FilledButton>(button).onPressed, isNotNull);
  });

  testWidgets('saves exactly the three text fields, never the logo', (t) async {
    final repo = _Repository();
    when(() => repo.getMyProfile()).thenAnswer((_) async => _shop);
    when(
      () => repo.updateMyProfile(
        shopName: any(named: 'shopName'),
        handle: any(named: 'handle'),
        description: any(named: 'description'),
      ),
    ).thenAnswer(
      (_) async => const MyShop(
        id: 's1',
        handle: 'altyn',
        shopName: 'Altyn Ay Gül',
        description: 'Букеты и подарки',
        logoUrl: null,
        isEnabled: true,
      ),
    );

    await _open(t, repo);
    await t.enterText(find.byType(TextField).first, 'Altyn Ay Gül');
    await t.pump();
    await t.tap(find.widgetWithText(FilledButton, 'Сохранить'));
    await t.pumpAndSettle();

    verify(
      () => repo.updateMyProfile(
        shopName: 'Altyn Ay Gül',
        handle: 'altyn',
        description: 'Букеты и подарки',
      ),
    ).called(1);
    expect(find.text('Изменения сохранены'), findsOneWidget);
  });

  testWidgets('says plainly when a moderator has hidden the shop', (t) async {
    final repo = _Repository();
    when(() => repo.getMyProfile()).thenAnswer(
      (_) async => const MyShop(
        id: 's1',
        handle: 'altyn',
        shopName: 'Altyn Ay',
        isEnabled: false,
      ),
    );

    await _open(t, repo);

    expect(
      find.text('Магазин скрыт администратором и недоступен покупателям'),
      findsOneWidget,
    );
  });

  testWidgets('opens the shop exactly where its own posts already lead', (
    t,
  ) async {
    final repo = _Repository();
    when(() => repo.getMyProfile()).thenAnswer((_) async => _shop);
    when(() => repo.loadShop('altyn')).thenAnswer(
      (_) async => const ShopProfile(
        id: 's1',
        handle: 'altyn',
        shopName: 'Altyn Ay',
      ),
    );
    final gallery = _Gallery();
    when(() => gallery.loadProducts(any())).thenAnswer((_) async => []);

    await _open(t, repo, gallery: gallery);
    await t.tap(find.text('Открыть страницу магазина'));
    await t.pumpAndSettle();

    // The same handle-scoped route a post's "В магазин" button uses -- not a bespoke seller-only
    // preview that could drift from what a customer actually sees.
    expect(find.byType(ShopScreen), findsOneWidget);
    expect(find.byType(MyShopScreen), findsNothing);
  });
}
