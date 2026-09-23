import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/features/orders/domain/order.dart';

void main() {
  group('OrderSummary.fromTopupJson', () {
    test('reads every money field as a string decimal', () {
      final order = OrderSummary.fromTopupJson(const {
        'id': 'o1',
        'serviceId': 's1',
        'status': 'COMPLETED',
        'amountTmt': '25.00',
        'amountCharged': '250.00',
        'feeAmount': '2.50',
        'referralDiscountTmt': '5.00',
        'currency': 'RUB',
        'recipientIdentifier': '+99361234567',
        'createdAt': '2026-08-20T10:00:00.000Z',
        'paidAt': '2026-08-20T10:05:00.000Z',
        'completedAt': '2026-08-20T10:06:00.000Z',
      }, serviceName: 'TMCELL');

      expect(order.amountTmt, 25);
      expect(order.amountCharged, 250);
      expect(order.feeAmount, 2.5);
      expect(order.referralDiscountTmt, 5);
      expect(order.currency, 'RUB');
      expect(order.paidAt, isNotNull);
      expect(order.completedAt, isNotNull);
    });

    test('optional money fields stay null rather than becoming zero', () {
      final order = OrderSummary.fromTopupJson(const {
        'id': 'o1',
        'status': 'PENDING_PAYMENT',
        'amountTmt': '25',
      });

      expect(order.feeAmount, isNull);
      expect(order.referralDiscountTmt, isNull);
      expect(order.amountCharged, isNull);
    });

    test(
      'prefers an included service relation when the detail endpoint supplies one',
      () {
        final order = OrderSummary.fromTopupJson(const {
          'id': 'o1',
          'status': 'PAID',
          'amountTmt': '25',
          'service': {'name': 'Turkmen Telecom'},
        });

        expect(order.title, 'Turkmen Telecom');
      },
    );

    test('flags an order that is waiting to be paid', () {
      final pending = OrderSummary.fromTopupJson(const {
        'id': 'o1',
        'status': 'PENDING_PAYMENT',
        'amountTmt': '25',
      });
      final paid = OrderSummary.fromTopupJson(const {
        'id': 'o2',
        'status': 'PAID',
        'amountTmt': '25',
      });

      expect(pending.isAwaitingPayment, isTrue);
      expect(paid.isAwaitingPayment, isFalse);
    });

    test('keeps a status this build has never seen', () {
      final order = OrderSummary.fromTopupJson(const {
        'id': 'o1',
        'status': 'AWAITING_OPERATOR',
        'amountTmt': '25',
      });

      expect(order.status, 'AWAITING_OPERATOR');
    });
  });

  group('OrderSummary.fromGalleryJson', () {
    test('reads the included product', () {
      final order = OrderSummary.fromGalleryJson(const {
        'id': 'g1',
        'status': 'DELIVERED',
        'amountTmt': '350',
        'recipientName': 'Aýgül',
        'deliveredAt': '2026-08-25T10:00:00.000Z',
        'product': {
          'name': 'Букет роз',
          'imageUrl': 'https://example.test/rose.png',
        },
      });

      expect(order.kind, OrderKind.gallery);
      expect(order.title, 'Букет роз');
      expect(order.subtitle, 'Aýgül');
      expect(order.amountTmt, 350);
      expect(order.completedAt, isNotNull);
    });

    test('survives a missing product relation', () {
      final order = OrderSummary.fromGalleryJson(const {
        'id': 'g1',
        'status': 'PAID',
        'amountTmt': '350',
      });

      expect(order.title, '—');
      expect(order.imageUrl, isNull);
    });
  });
}
