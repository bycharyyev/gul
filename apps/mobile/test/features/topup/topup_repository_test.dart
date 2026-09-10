import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/network/api_client.dart';
import 'package:gulyaly_mobile/features/topup/data/topup_repository.dart';
import 'package:mocktail/mocktail.dart';

class MockApiClient extends Mock implements ApiClient {}

void main() {
  late MockApiClient api;
  late TopupRepository repository;

  setUp(() {
    api = MockApiClient();
    repository = TopupRepository(api);
  });

  test('loads rates and payment methods together', () async {
    when(() => api.get<List<dynamic>>('/catalog/services/s1/rates')).thenAnswer(
      (_) async => [
        {'currency': 'RUB', 'rate': '5.3'},
        {'currency': 'USD', 'rate': '0.062'},
      ],
    );
    when(() => api.get<List<dynamic>>('/catalog/payment-methods')).thenAnswer(
      (_) async => [
        {
          'id': 'pm2',
          'name': 'Second',
          'provider': 'manual',
          'feePercent': '0',
          'sortOrder': 2,
        },
        {
          'id': 'pm1',
          'name': 'First',
          'provider': 'manual',
          'feePercent': '0',
          'sortOrder': 1,
        },
      ],
    );

    final options = await repository.loadOptions('s1');

    expect(options.currencies, ['RUB', 'USD']);
    // sortOrder is what the admin console controls; the API does not sort payment methods for
    // the caller on every route.
    expect(options.paymentMethods.map((m) => m.id), ['pm1', 'pm2']);
  });

  test('sends the requested amount and reads back the server figures', () async {
    when(
      () => api.post<Map<String, dynamic>>('/orders', body: any(named: 'body')),
    ).thenAnswer(
      (_) async => {
        'id': 'o1',
        'serviceId': 's1',
        'status': 'PENDING_PAYMENT',
        'amountTmt': '25',
        // The server computed these; the client sent none of them.
        'rateApplied': '5.3',
        'amountCharged': '132.50',
        'feeAmount': '0',
        'currency': 'RUB',
        'recipientIdentifier': '+99361234567',
        'createdAt': '2026-09-01T10:00:00.000Z',
      },
    );
    when(
      () => api.post<Map<String, dynamic>>(
        '/payments/orders/o1/initiate',
        headers: any(named: 'headers'),
      ),
    ).thenAnswer(
      (_) async => {
        'paymentId': 'pay1',
        'redirectUrl': 'https://yoomoney.ru/checkout/pay1',
        'status': 'PENDING',
      },
    );

    final submission = await repository.createOrder(
      serviceId: 's1',
      serviceName: 'TMCELL',
      paymentMethodId: 'pm1',
      recipientIdentifier: '+99361234567',
      amountTmt: 25,
      currency: 'RUB',
    );

    final captured =
        verify(
              () => api.post<Map<String, dynamic>>(
                '/orders',
                body: captureAny(named: 'body'),
              ),
            ).captured.single
            as Map<String, dynamic>;

    // Exactly the five fields CreateOrderDto declares — no locally computed rate, fee or total.
    expect(captured.keys.toSet(), {
      'serviceId',
      'paymentMethodId',
      'recipientIdentifier',
      'amountTmt',
      'currency',
    });
    expect(captured['amountTmt'], 25);
    expect(captured['currency'], 'RUB');

    expect(submission.order.id, 'o1');
    expect(submission.order.amountCharged, 132.5);
    expect(submission.order.title, 'TMCELL');
    expect(submission.order.isAwaitingPayment, isTrue);
    expect(submission.payment.redirectUrl, 'https://yoomoney.ru/checkout/pay1');
    final headers =
        verify(
              () => api.post<Map<String, dynamic>>(
                '/payments/orders/o1/initiate',
                headers: captureAny(named: 'headers'),
              ),
            ).captured.single
            as Map<String, Object?>;
    expect(headers['Idempotency-Key'], 'mobile-order:o1');
  });

  test('sorts the operator list by sortOrder', () async {
    when(() => api.get<List<dynamic>>('/catalog/services')).thenAnswer(
      (_) async => [
        {
          'id': 's2',
          'code': 'B',
          'name': 'Second',
          'inputType': 'PHONE',
          'minAmountTmt': '5',
          'maxAmountTmt': '500',
          'sortOrder': 2,
        },
        {
          'id': 's1',
          'code': 'A',
          'name': 'First',
          'inputType': 'PHONE',
          'minAmountTmt': '5',
          'maxAmountTmt': '500',
          'sortOrder': 1,
        },
      ],
    );

    final services = await repository.loadServices();

    expect(services.map((s) => s.id), ['s1', 's2']);
  });
}
