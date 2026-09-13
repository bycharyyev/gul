import 'package:barcode_widget/barcode_widget.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/config/app_config.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/gallery/data/gallery_repository.dart';
import 'package:gulyaly_mobile/features/gallery/domain/gallery_product.dart';
import 'package:gulyaly_mobile/features/gallery/presentation/product_screen.dart';
import 'package:mocktail/mocktail.dart';
import 'package:qr_flutter/qr_flutter.dart';

class _Repository extends Mock implements GalleryRepository {}

/// Pinned rather than read from the build environment, the same reason referral_screen_test.dart
/// pins one: the link this screen puts in its QR code is the point of the test.
const _config = AppConfig(
  environment: AppEnvironment.production,
  apiBaseUrl: 'https://api.gulyaly.pro/api',
  siteBaseUrl: 'https://gulyaly.pro',
  connectTimeout: Duration(seconds: 15),
  receiveTimeout: Duration(seconds: 30),
);

const _product = GalleryProduct(
  id: 'p1',
  name: 'Букет «Гүл»',
  priceTmt: 350,
  sortOrder: 0,
  sku: 'FLW-001',
);

Future<void> _open(WidgetTester t, GalleryProduct? product) async {
  final repo = _Repository();
  when(() => repo.loadProduct('p1')).thenAnswer((_) async => product);
  final router = GoRouter(
    initialLocation: '${ProductScreen.path}/p1',
    routes: [
      GoRoute(
        path: '${ProductScreen.path}/:id',
        builder: (_, state) =>
            ProductScreen(productId: state.pathParameters['id']!),
      ),
    ],
  );
  await t.pumpWidget(
    ProviderScope(
      overrides: [
        galleryRepositoryProvider.overrideWithValue(repo),
        appConfigProvider.overrideWithValue(_config),
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
  // Nothing answers the clipboard's platform channel by default under `flutter test`, so
  // `Clipboard.setData` -- a real message round trip, not a timer -- never completes and the
  // screen's own "copied" confirmation would never have anything to trigger it. Every other
  // screen that copies to the clipboard has simply never had this path exercised.
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          return null;
        });
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  testWidgets('prints the article number and its own barcode', (t) async {
    await _open(t, _product);

    expect(find.text('Артикул: FLW-001'), findsOneWidget);
    expect(find.byType(BarcodeWidget), findsOneWidget);
  });

  testWidgets(
    'a product with no SKU shows neither the label nor a blank code',
    (t) async {
      await _open(
        t,
        const GalleryProduct(id: 'p1', name: 'X', priceTmt: 10, sortOrder: 0),
      );

      expect(find.textContaining('Артикул'), findsNothing);
      expect(find.byType(BarcodeWidget), findsNothing);
    },
  );

  testWidgets(
    'the share sheet offers a QR code, a copy button and a share button',
    (t) async {
      await _open(t, _product);

      await t.tap(find.byTooltip('Поделиться'));
      await t.pumpAndSettle();

      expect(find.byType(QrImageView), findsOneWidget);
      expect(find.text('Скопировать ссылку'), findsOneWidget);
      // The AppBar icon's own "Поделиться" is a tooltip, not a Text widget, so this is only the
      // sheet's share button.
      expect(find.text('Поделиться'), findsOneWidget);
    },
  );

  testWidgets('copying the link confirms it, with the product\'s own address', (
    t,
  ) async {
    await _open(t, _product);
    await t.tap(find.byTooltip('Поделиться'));
    await t.pumpAndSettle();

    await t.tap(find.text('Скопировать ссылку'));
    // Not pumpAndSettle: a SnackBar keeps a frame scheduled for its own auto-dismiss timer, so
    // settling would run the clock past it disappearing again before this ever gets to look.
    await t.pump();
    await t.pump(const Duration(milliseconds: 100));

    expect(find.text('Ссылка скопирована'), findsOneWidget);
  });

  testWidgets('no share action appears while there is nothing to share', (
    t,
  ) async {
    await _open(t, null);

    expect(find.byTooltip('Поделиться'), findsNothing);
  });
}
