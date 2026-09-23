import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/format/money.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/auth/data/auth_repository.dart';
import 'package:gulyaly_mobile/features/auth/presentation/login_screen.dart';
import 'package:gulyaly_mobile/features/auth/presentation/register_screen.dart';
import 'package:gulyaly_mobile/features/orders/data/orders_repository.dart';
import 'package:gulyaly_mobile/features/orders/domain/order.dart';
import 'package:gulyaly_mobile/features/gallery/data/gallery_repository.dart';
import 'package:gulyaly_mobile/features/home/domain/catalog_service.dart';
import 'package:gulyaly_mobile/features/gallery/domain/gallery_product.dart';
import 'package:gulyaly_mobile/features/gallery/presentation/gallery_screen.dart';
import 'package:gulyaly_mobile/features/orders/presentation/orders_screen.dart';
import 'package:gulyaly_mobile/features/topup/data/topup_repository.dart';
import 'package:gulyaly_mobile/features/topup/domain/topup_options.dart';
import 'package:gulyaly_mobile/features/topup/presentation/topup_screen.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

class MockOrdersRepository extends Mock implements OrdersRepository {}

class MockTopupRepository extends Mock implements TopupRepository {}

class MockGalleryRepository extends Mock implements GalleryRepository {}

/// Someone with poor eyesight sets system text to its largest step and expects the app to work,
/// not to overflow. Flutter reports a RenderFlex overflow as a framework error, which fails the
/// surrounding test — so "this pumps cleanly at 2x" is the whole assertion.
///
/// 2.0 is not an extreme: Android's accessibility slider reaches 2.0 and iOS's largest
/// accessibility size is close to it. Turkmen and Russian copy is also longer than the English
/// these layouts were eyeballed in.
Widget _scaled(
  Widget child, {
  required List<Override> overrides,
}) => ProviderScope(
  overrides: overrides,
  child: MaterialApp(
    // `copyWith` on the ambient MediaQuery, never a fresh `MediaQueryData()` -- a bare one
    // carries `size: Size.zero`, and every layout then "fits" in nothing.
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: const TextScaler.linear(2.0)),
      child: child ?? const SizedBox.shrink(),
    ),
    home: StringsScope(strings: const Strings('ru'), child: child),
  ),
);

OrderSummary _order({String status = 'PENDING_PAYMENT'}) => OrderSummary(
  id: 'o1',
  kind: OrderKind.topup,
  status: status,
  amountTmt: 1250.5,
  createdAt: DateTime(2026, 8, 20, 13, 5),
  // A long operator name and a long recipient, because short ones never overflow.
  title: 'Turkmen Telecom ASTU (АГТС)',
  subtitle: '+993 61 23 45 67',
);

void main() {
  setUpAll(() async {
    registerFallbackValue(const GalleryFilter());
    await initializeDateFormatting('ru');
    await initializeDateFormatting('en');
  });

  /// A small phone at the largest text size — the worst realistic combination.
  Future<void> pumpAt(
    WidgetTester t,
    Widget widget,
    List<Override> overrides,
  ) async {
    t.view.physicalSize = const Size(360, 1400);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);

    await t.pumpWidget(_scaled(widget, overrides: overrides));
    await t.pumpAndSettle();
  }

  testWidgets('the login screen holds at 2x text', (t) async {
    await pumpAt(t, const LoginScreen(), [
      authRepositoryProvider.overrideWithValue(MockAuthRepository()),
    ]);

    expect(find.text('Войти'), findsWidgets);
  });

  testWidgets('the register screen holds at 2x text', (t) async {
    await pumpAt(t, const RegisterScreen(), [
      authRepositoryProvider.overrideWithValue(MockAuthRepository()),
    ]);

    expect(find.text('Создать аккаунт'), findsWidgets);
  });

  testWidgets(
    'an order row holds at 2x text with a long name and a long status',
    (t) async {
      final orders = MockOrdersRepository();
      when(() => orders.loadMine()).thenAnswer(
        (_) async => [
          _order(),
          _order(status: 'PROCESSING'),
          _order(status: 'REFUNDED'),
        ],
      );

      await pumpAt(t, const OrdersScreen(), [
        ordersRepositoryProvider.overrideWithValue(orders),
      ]);

      expect(find.text('Ждёт оплаты'), findsOneWidget);
    },
  );

  testWidgets('the top-up form holds at 2x text, estimate and all', (t) async {
    // The densest screen in the app: an operator strip, two fields with helper text, currency
    // chips, a payment row and a four-line estimate.
    final topup = MockTopupRepository();
    when(() => topup.loadServices()).thenAnswer(
      (_) async => const [
        CatalogService(
          id: 's1',
          code: 'TTELECOM',
          name: 'Turkmen Telecom ASTU',
          inputType: 'PHONE',
          minAmountTmt: 5,
          maxAmountTmt: 500,
          sortOrder: 1,
        ),
      ],
    );
    when(() => topup.loadOptions(any())).thenAnswer(
      (_) async => const TopupOptions(
        rates: [
          Rate(currency: 'RUB', rate: 5.3),
          Rate(currency: 'USD', rate: 0.062),
        ],
        paymentMethods: [
          PaymentMethodOption(
            id: 'pm1',
            code: 'MANUAL',
            name: 'Bank card / SBP (demo)',
            provider: 'manual',
            feePercent: 2.5,
            sortOrder: 1,
          ),
        ],
      ),
    );

    await pumpAt(t, const TopupScreen(), [
      topupRepositoryProvider.overrideWithValue(topup),
    ]);

    await t.enterText(find.byType(TextFormField).last, '1250');
    await t.pumpAndSettle();

    expect(find.text('Предварительный расчёт'), findsOneWidget);
  });

  testWidgets('the gift catalogue holds at 2x text', (t) async {
    final gallery = MockGalleryRepository();
    when(() => gallery.loadCategories()).thenAnswer(
      (_) async => const [
        GalleryCategory(
          id: 'c1',
          name: 'Подарочные букеты',
          slug: 'bouquets',
          sortOrder: 1,
        ),
      ],
    );
    when(() => gallery.loadProducts(any())).thenAnswer(
      (_) async => const [
        GalleryProduct(
          id: 'p1',
          name: 'Букет роз «Классика» с оформлением и лентой',
          priceTmt: 1350,
          sortOrder: 1,
          sellerName: 'Gül dükany Aşgabat',
        ),
      ],
    );

    await pumpAt(t, const GalleryScreen(), [
      galleryRepositoryProvider.overrideWithValue(gallery),
    ]);

    // Compared through the same formatter: ru grouping uses a non-breaking space, so a literal
    // '1 350 TMT' typed here would never match.
    expect(find.text(Money.tmt(1350, 'ru')), findsOneWidget);
  });

  testWidgets('the empty order list holds at 2x text', (t) async {
    final orders = MockOrdersRepository();
    when(() => orders.loadMine()).thenAnswer((_) async => []);

    await pumpAt(t, const OrdersScreen(), [
      ordersRepositoryProvider.overrideWithValue(orders),
    ]);

    expect(find.text('Заказов пока нет'), findsOneWidget);
  });
}
