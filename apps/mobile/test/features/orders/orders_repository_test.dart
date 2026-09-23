import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/network/api_client.dart';
import 'package:gulyaly_mobile/features/orders/data/orders_repository.dart';
import 'package:gulyaly_mobile/features/orders/domain/order.dart';
import 'package:mocktail/mocktail.dart';

class MockApiClient extends Mock implements ApiClient {}

void main() {
  late MockApiClient api;
  late OrdersRepository repository;

  setUp(() {
    api = MockApiClient();
    repository = OrdersRepository(api);
  });

  void stub({
    List<dynamic> topups = const [],
    List<dynamic> gallery = const [],
    List<dynamic> services = const [],
  }) {
    when(
      () => api.get<List<dynamic>>('/orders/me'),
    ).thenAnswer((_) async => topups);
    when(
      () => api.get<List<dynamic>>('/gallery/orders/me'),
    ).thenAnswer((_) async => gallery);
    when(
      () => api.get<List<dynamic>>('/catalog/services'),
    ).thenAnswer((_) async => services);
  }

  test('joins the operator name in from the catalogue', () async {
    // /orders/me returns bare rows with a serviceId and no service relation — the name has to
    // come from somewhere, and getting this wrong shows every order as a dash.
    stub(
      topups: [
        {
          'id': 'o1',
          'serviceId': 's1',
          'status': 'COMPLETED',
          'amountTmt': '25.00',
          'recipientIdentifier': '+99361234567',
          'createdAt': '2026-08-20T10:00:00.000Z',
        },
      ],
      services: [
        {
          'id': 's1',
          'code': 'TMCELL',
          'name': 'TMCELL',
          'inputType': 'PHONE',
          'minAmountTmt': '5',
          'maxAmountTmt': '500',
        },
      ],
    );

    final orders = await repository.loadMine();

    expect(orders.single.title, 'TMCELL');
    expect(orders.single.amountTmt, 25);
    expect(orders.single.subtitle, '+99361234567');
    expect(orders.single.kind, OrderKind.topup);
  });

  test('an order for a deleted service still renders', () async {
    stub(
      topups: [
        {
          'id': 'o1',
          'serviceId': 'gone',
          'status': 'COMPLETED',
          'amountTmt': '10',
        },
      ],
    );

    final orders = await repository.loadMine();

    expect(orders.single.title, '—');
  });

  test('merges both pipelines newest first', () async {
    stub(
      topups: [
        {
          'id': 'topup-old',
          'serviceId': 's1',
          'status': 'COMPLETED',
          'amountTmt': '10',
          'createdAt': '2026-08-01T10:00:00.000Z',
        },
      ],
      gallery: [
        {
          'id': 'gift-new',
          'status': 'DELIVERED',
          'amountTmt': '350',
          'recipientName': 'Aýgül',
          'createdAt': '2026-08-25T10:00:00.000Z',
          'product': {
            'name': 'Букет роз',
            'imageUrl': 'https://example.test/rose.png',
          },
        },
      ],
    );

    final orders = await repository.loadMine();

    expect(orders.map((o) => o.id), ['gift-new', 'topup-old']);
    expect(orders.first.kind, OrderKind.gallery);
    expect(orders.first.title, 'Букет роз');
    expect(orders.first.imageUrl, 'https://example.test/rose.png');
  });

  test('rows with no date sort last instead of jumping to the top', () async {
    stub(
      topups: [
        {
          'id': 'undated',
          'serviceId': 's1',
          'status': 'PAID',
          'amountTmt': '10',
        },
        {
          'id': 'dated',
          'serviceId': 's1',
          'status': 'PAID',
          'amountTmt': '10',
          'createdAt': '2026-08-01T10:00:00.000Z',
        },
      ],
    );

    final orders = await repository.loadMine();

    expect(orders.map((o) => o.id), ['dated', 'undated']);
  });

  test('an empty history is empty, not an error', () async {
    stub();
    expect(await repository.loadMine(), isEmpty);
  });
}
