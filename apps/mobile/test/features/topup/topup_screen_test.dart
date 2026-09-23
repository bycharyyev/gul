import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/home/domain/catalog_service.dart';
import 'package:gulyaly_mobile/features/orders/domain/order.dart';
import 'package:gulyaly_mobile/features/topup/data/topup_repository.dart';
import 'package:gulyaly_mobile/features/topup/domain/topup_options.dart';
import 'package:gulyaly_mobile/features/topup/presentation/topup_screen.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mocktail/mocktail.dart';

class MockTopupRepository extends Mock implements TopupRepository {}

TopupSubmission _submission(String id) => TopupSubmission(
  order: OrderSummary.fromTopupJson({
    'id': id,
    'status': 'PENDING_PAYMENT',
    'amountTmt': '25',
  }, serviceName: 'TMCELL'),
  payment: const PaymentInitiation(
    paymentId: 'pay1',
    redirectUrl: null,
    status: 'PENDING',
  ),
);

const _service = CatalogService(
  id: 's1',
  code: 'TMCELL',
  name: 'TMCELL',
  inputType: 'PHONE',
  minAmountTmt: 5,
  maxAmountTmt: 500,
  sortOrder: 1,
  // The pattern the admin console stores for this operator; the server compiles this exact one.
  validationRegex: r'^\+993\d{8}$',
);

const _options = TopupOptions(
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
      feePercent: 0,
      sortOrder: 1,
    ),
  ],
);

/// A real router, because a successful submit navigates to the created order — asserting where
/// it lands is part of the contract, not incidental.
Widget _harness(MockTopupRepository repository) {
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => const TopupScreen()),
      GoRoute(
        path: '/orders/detail/:id',
        builder: (_, state) =>
            Scaffold(body: Text('order-detail:${state.pathParameters['id']}')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [topupRepositoryProvider.overrideWithValue(repository)],
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
    await initializeDateFormatting('ru');
    await initializeDateFormatting('en');
  });

  late MockTopupRepository repository;

  setUp(() {
    repository = MockTopupRepository();
    when(() => repository.loadServices()).thenAnswer((_) async => [_service]);
    when(() => repository.loadOptions(any())).thenAnswer((_) async => _options);
  });

  /// The default test surface is 800x600 — a desktop shape the whole form does not fit on, which
  /// makes the submit button untappable. A tall phone-shaped viewport is both realistic for this
  /// app and deterministic.
  Future<void> pumpScreen(
    WidgetTester t,
    MockTopupRepository repository,
  ) async {
    t.view.physicalSize = const Size(400, 1600);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);

    await t.pumpWidget(_harness(repository));
    await t.pumpAndSettle();
  }

  Future<void> fillValidForm(WidgetTester t) async {
    await t.enterText(find.byType(TextFormField).first, '+99361234567');
    await t.enterText(find.byType(TextFormField).last, '25');
    await t.pumpAndSettle();
  }

  Future<void> tapSubmit(WidgetTester t) async {
    await t.tap(find.text('Создать заказ'));
    await t.pumpAndSettle();
  }

  testWidgets('the button says what it does — creates an order, not pays', (
    t,
  ) async {
    await pumpScreen(t, repository);

    // The web storefront labels this "Pay {amount}", which promises something the manual flow
    // does not deliver.
    expect(find.text('Создать заказ'), findsOneWidget);
    expect(
      find.text(
        'Оплата подтверждается вручную. Заказ появится в списке со статусом «Ждёт оплаты».',
      ),
      findsOneWidget,
    );
  });

  testWidgets("applies the operator's own validationRegex before any request", (
    t,
  ) async {
    await pumpScreen(t, repository);

    await t.enterText(find.byType(TextFormField).first, '+7912345678');
    await t.enterText(find.byType(TextFormField).last, '25');
    await tapSubmit(t);

    expect(find.text('Проверьте номер получателя'), findsOneWidget);
    verifyNever(
      () => repository.createOrder(
        serviceId: any(named: 'serviceId'),
        serviceName: any(named: 'serviceName'),
        paymentMethodId: any(named: 'paymentMethodId'),
        recipientIdentifier: any(named: 'recipientIdentifier'),
        amountTmt: any(named: 'amountTmt'),
        currency: any(named: 'currency'),
      ),
    );
  });

  testWidgets('rejects an amount outside the service bounds', (t) async {
    await pumpScreen(t, repository);

    await t.enterText(find.byType(TextFormField).first, '+99361234567');
    await t.enterText(find.byType(TextFormField).last, '900'); // max is 500
    await tapSubmit(t);

    expect(find.text('Сумма вне допустимого диапазона'), findsOneWidget);
  });

  testWidgets('shows an estimate, marked as one', (t) async {
    await pumpScreen(t, repository);
    await fillValidForm(t);

    // 25 TMT x 5.3 RUB, no fee. Prefixed with ≈ because the server has the last word — a
    // referral balance can make the real figure lower.
    expect(find.text('≈ 132,50 RUB'), findsOneWidget);
    expect(find.text('Предварительный расчёт'), findsOneWidget);
  });

  testWidgets('recomputes when the currency changes', (t) async {
    await pumpScreen(t, repository);
    await fillValidForm(t);

    await t.tap(find.text('USD'));
    await t.pumpAndSettle();

    // 25 x 0.062 = 1.55
    expect(find.text('≈ 1,55 USD'), findsOneWidget);
  });

  testWidgets('submits exactly what the user asked for', (t) async {
    when(
      () => repository.createOrder(
        serviceId: any(named: 'serviceId'),
        serviceName: any(named: 'serviceName'),
        paymentMethodId: any(named: 'paymentMethodId'),
        recipientIdentifier: any(named: 'recipientIdentifier'),
        amountTmt: any(named: 'amountTmt'),
        currency: any(named: 'currency'),
      ),
    ).thenAnswer((_) async => _submission('o1'));

    await pumpScreen(t, repository);
    await fillValidForm(t);
    await tapSubmit(t);

    verify(
      () => repository.createOrder(
        serviceId: 's1',
        serviceName: 'TMCELL',
        paymentMethodId: 'pm1',
        recipientIdentifier: '+99361234567',
        amountTmt: 25,
        currency: 'RUB',
      ),
    ).called(1);

    // Lands on the order itself, which shows the server's figures — not on an invented
    // "success" screen that would have to restate numbers the client does not own.
    expect(find.text('order-detail:o1'), findsOneWidget);
  });

  testWidgets(
    'a bad validationRegex in the catalogue does not block a real order',
    (t) async {
      // An admin can save a pattern Dart cannot compile. Failing closed here would take the whole
      // operator offline in the app over the catalogue's own bad data.
      when(() => repository.loadServices()).thenAnswer(
        (_) async => [
          const CatalogService(
            id: 's1',
            code: 'X',
            name: 'X',
            inputType: 'PHONE',
            minAmountTmt: 5,
            maxAmountTmt: 500,
            sortOrder: 1,
            validationRegex: '[unclosed',
          ),
        ],
      );
      when(
        () => repository.createOrder(
          serviceId: any(named: 'serviceId'),
          serviceName: any(named: 'serviceName'),
          paymentMethodId: any(named: 'paymentMethodId'),
          recipientIdentifier: any(named: 'recipientIdentifier'),
          amountTmt: any(named: 'amountTmt'),
          currency: any(named: 'currency'),
        ),
      ).thenAnswer((_) async => _submission('o1'));

      await pumpScreen(t, repository);
      await fillValidForm(t);
      await tapSubmit(t);

      expect(find.text('Проверьте номер получателя'), findsNothing);
      verify(
        () => repository.createOrder(
          serviceId: any(named: 'serviceId'),
          serviceName: any(named: 'serviceName'),
          paymentMethodId: any(named: 'paymentMethodId'),
          recipientIdentifier: any(named: 'recipientIdentifier'),
          amountTmt: any(named: 'amountTmt'),
          currency: any(named: 'currency'),
        ),
      ).called(1);
    },
  );
}
