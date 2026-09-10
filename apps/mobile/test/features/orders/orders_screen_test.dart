import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/errors/app_exception.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/core/widgets/skeleton.dart';
import 'package:gulyaly_mobile/core/widgets/status_chip.dart';
import 'package:gulyaly_mobile/features/orders/data/orders_repository.dart';
import 'package:gulyaly_mobile/features/orders/domain/order.dart';
import 'package:gulyaly_mobile/features/orders/presentation/orders_screen.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mocktail/mocktail.dart';

class MockOrdersRepository extends Mock implements OrdersRepository {}

OrderSummary _topup({
  String id = 'o1',
  String status = 'COMPLETED',
  double amount = 25,
}) => OrderSummary(
  id: id,
  kind: OrderKind.topup,
  status: status,
  amountTmt: amount,
  createdAt: DateTime(2026, 8, 20, 13, 5),
  title: 'TMCELL',
  subtitle: '+99361234567',
);

Widget _harness(MockOrdersRepository repository) => ProviderScope(
  overrides: [ordersRepositoryProvider.overrideWithValue(repository)],
  child: const MaterialApp(
    home: StringsScope(strings: Strings('ru'), child: OrdersScreen()),
  ),
);

void main() {
  setUpAll(() async {
    await initializeDateFormatting('ru');
    await initializeDateFormatting('en');
  });

  late MockOrdersRepository repository;

  setUp(() => repository = MockOrdersRepository());

  testWidgets('shows skeletons while loading, not a bare spinner', (t) async {
    when(() => repository.loadMine()).thenAnswer(
      (_) => Future.delayed(const Duration(milliseconds: 50), () => [_topup()]),
    );

    await t.pumpWidget(_harness(repository));
    await t.pump();

    expect(find.byType(Skeleton), findsWidgets);

    await t.pumpAndSettle();
    expect(find.byType(Skeleton), findsNothing);
  });

  testWidgets('renders an order with its status word, not just a colour', (
    t,
  ) async {
    when(() => repository.loadMine()).thenAnswer((_) async => [_topup()]);

    await t.pumpWidget(_harness(repository));
    await t.pumpAndSettle();

    expect(find.text('TMCELL'), findsOneWidget);
    expect(find.text('+99361234567'), findsOneWidget);
    expect(find.text('25 TMT'), findsOneWidget);
    // The status carries a word and an icon; colour alone would be invisible to a large share of
    // users.
    expect(find.text('Выполнен'), findsOneWidget);
    expect(find.byType(StatusChip), findsOneWidget);
  });

  testWidgets(
    'an unknown status shows the server value rather than a lookup key',
    (t) async {
      when(
        () => repository.loadMine(),
      ).thenAnswer((_) async => [_topup(status: 'AWAITING_OPERATOR')]);

      await t.pumpWidget(_harness(repository));
      await t.pumpAndSettle();

      expect(find.text('AWAITING_OPERATOR'), findsOneWidget);
      expect(find.text('status.awaiting_operator'), findsNothing);
    },
  );

  testWidgets(
    'an empty history explains itself instead of showing a blank screen',
    (t) async {
      when(() => repository.loadMine()).thenAnswer((_) async => []);

      await t.pumpWidget(_harness(repository));
      await t.pumpAndSettle();

      expect(find.text('Заказов пока нет'), findsOneWidget);
      expect(
        find.text('Здесь появятся ваши пополнения и заказы из магазина'),
        findsOneWidget,
      );
    },
  );

  testWidgets('a failed load offers a retry', (t) async {
    when(
      () => repository.loadMine(),
    ).thenThrow(const AppException(kind: AppErrorKind.network));

    await t.pumpWidget(_harness(repository));
    await t.pumpAndSettle();

    expect(find.text('Нет соединения. Проверьте интернет.'), findsOneWidget);
    expect(find.text('Повторить'), findsOneWidget);
  });
}
