import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/errors/app_exception.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/gallery/data/gallery_repository.dart';
import 'package:gulyaly_mobile/features/gallery/domain/gallery_product.dart';
import 'package:gulyaly_mobile/features/gallery/presentation/gallery_checkout_screen.dart';
import 'package:gulyaly_mobile/features/orders/data/orders_repository.dart';
import 'package:gulyaly_mobile/features/orders/domain/order.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mocktail/mocktail.dart';

class MockGalleryRepository extends Mock implements GalleryRepository {}

class MockOrdersRepository extends Mock implements OrdersRepository {}

const _roses = GalleryProduct(
  id: 'p1',
  name: 'Букет роз "Классика"',
  priceTmt: 350,
  sortOrder: 1,
  categoryName: 'Цветы',
);

final _created = OrderSummary.fromGalleryJson(const {
  'id': 'g1',
  'status': 'PENDING_PAYMENT',
  'amountTmt': '350',
  'recipientName': 'Aýgül',
});

Widget _harness(MockGalleryRepository gallery, MockOrdersRepository orders) {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => const GalleryCheckoutScreen(productId: 'p1'),
      ),
      GoRoute(
        path: '/orders/detail/:id',
        builder: (_, state) =>
            Scaffold(body: Text('order:${state.pathParameters['id']}')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      galleryRepositoryProvider.overrideWithValue(gallery),
      ordersRepositoryProvider.overrideWithValue(orders),
    ],
    child: MaterialApp.router(
      routerConfig: router,
      builder: (context, child) => StringsScope(
        strings: const Strings('ru'),
        child: child ?? const SizedBox.shrink(),
      ),
    ),
  );
}

void main() {
  setUpAll(() async {
    registerFallbackValue(const GalleryFilter());
    await initializeDateFormatting('ru');
    await initializeDateFormatting('en');
  });

  late MockGalleryRepository gallery;
  late MockOrdersRepository orders;

  setUp(() {
    gallery = MockGalleryRepository();
    orders = MockOrdersRepository();
    when(() => gallery.loadProduct('p1')).thenAnswer((_) async => _roses);
    when(() => orders.loadMine()).thenAnswer((_) async => [_created]);
  });

  void stubCreate() {
    when(
      () => gallery.createOrder(
        productId: any(named: 'productId'),
        recipientName: any(named: 'recipientName'),
        recipientPhone: any(named: 'recipientPhone'),
        deliveryCity: any(named: 'deliveryCity'),
        deliveryAddress: any(named: 'deliveryAddress'),
        cardMessage: any(named: 'cardMessage'),
      ),
    ).thenAnswer((_) async => _created);
  }

  Future<void> pumpScreen(WidgetTester t) async {
    t.view.physicalSize = const Size(400, 1800);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);

    await t.pumpWidget(_harness(gallery, orders));
    await t.pumpAndSettle();
  }

  Future<void> fillForm(WidgetTester t) async {
    await t.enterText(
      find.widgetWithText(TextFormField, 'Имя получателя'),
      'Aýgül',
    );
    await t.enterText(
      find.widgetWithText(TextFormField, 'Телефон получателя'),
      '+99361234567',
    );
    await t.enterText(find.widgetWithText(TextFormField, 'Город'), 'Aşgabat');
    await t.enterText(
      find.widgetWithText(TextFormField, 'Адрес'),
      'Görogly 12',
    );
    await t.pumpAndSettle();
  }

  testWidgets('keeps the product in view while the form is filled', (t) async {
    await pumpScreen(t);

    expect(find.text('Букет роз "Классика"'), findsOneWidget);
    expect(find.text('350 TMT'), findsOneWidget);
  });

  testWidgets('will not submit an incomplete address', (t) async {
    stubCreate();
    await pumpScreen(t);

    await t.enterText(
      find.widgetWithText(TextFormField, 'Имя получателя'),
      'Aýgül',
    );
    await t.tap(find.text('Оформить заказ'));
    await t.pumpAndSettle();

    expect(find.text('Заполните это поле'), findsWidgets);
    verifyNever(
      () => gallery.createOrder(
        productId: any(named: 'productId'),
        recipientName: any(named: 'recipientName'),
        recipientPhone: any(named: 'recipientPhone'),
        deliveryCity: any(named: 'deliveryCity'),
        deliveryAddress: any(named: 'deliveryAddress'),
        cardMessage: any(named: 'cardMessage'),
      ),
    );
  });

  testWidgets('sends the delivery details and lands on the order', (t) async {
    stubCreate();
    await pumpScreen(t);
    await fillForm(t);

    await t.tap(find.text('Оформить заказ'));
    await t.pumpAndSettle();

    verify(
      () => gallery.createOrder(
        productId: 'p1',
        recipientName: 'Aýgül',
        recipientPhone: '+99361234567',
        deliveryCity: 'Aşgabat',
        deliveryAddress: 'Görogly 12',
        cardMessage: '',
      ),
    ).called(1);

    // The order list is refetched before navigating, because the detail screen resolves a gift
    // order out of that list — going first would send it to the top-up endpoint instead.
    verify(() => orders.loadMine()).called(greaterThanOrEqualTo(1));
    expect(find.text('order:g1'), findsOneWidget);
  });

  testWidgets('a failed order keeps the typed details on screen', (t) async {
    when(
      () => gallery.createOrder(
        productId: any(named: 'productId'),
        recipientName: any(named: 'recipientName'),
        recipientPhone: any(named: 'recipientPhone'),
        deliveryCity: any(named: 'deliveryCity'),
        deliveryAddress: any(named: 'deliveryAddress'),
        cardMessage: any(named: 'cardMessage'),
      ),
    ).thenThrow(
      const AppException(
        kind: AppErrorKind.validation,
        serverMessage: 'Товар недоступен',
        statusCode: 400,
      ),
    );

    await pumpScreen(t);
    await fillForm(t);
    await t.tap(find.text('Оформить заказ'));
    await t.pumpAndSettle();

    expect(find.text('Товар недоступен'), findsOneWidget);
    // Nothing retyped: losing a filled address to a server error is how people give up.
    expect(find.text('Görogly 12'), findsOneWidget);
  });

  testWidgets(
    'a product that disappeared says so instead of failing silently',
    (t) async {
      when(() => gallery.loadProduct('p1')).thenAnswer((_) async => null);

      await pumpScreen(t);

      expect(find.text('Товар больше не доступен'), findsOneWidget);
      expect(find.text('Оформить заказ'), findsNothing);
    },
  );
}
