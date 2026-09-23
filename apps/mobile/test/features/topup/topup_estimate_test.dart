import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/features/topup/domain/topup_options.dart';
import 'package:gulyaly_mobile/features/topup/presentation/widgets/amount_field.dart';

const _rub = Rate(currency: 'RUB', rate: 5.3);

PaymentMethodOption _method({double fee = 0}) => PaymentMethodOption(
  id: 'pm1',
  code: 'MANUAL',
  name: 'Bank card / SBP (demo)',
  provider: 'manual',
  feePercent: fee,
  sortOrder: 1,
);

void main() {
  group('TopupEstimate', () {
    test('matches the server formula with no fee', () {
      // OrdersService.create: subtotal = amountTmt * rate; amountCharged = round(subtotal*100)/100
      final estimate = TopupEstimate.of(
        amountTmt: 25,
        rate: _rub,
        method: _method(),
      );

      expect(estimate!.subtotal, closeTo(132.5, 0.0001));
      expect(estimate.fee, 0);
      expect(estimate.total, 132.5);
      expect(estimate.currency, 'RUB');
    });

    test('matches the server formula with a fee, including its rounding', () {
      // subtotal 132.5, fee 3.3125 -> stored 3.31, charged round(13581.25)/100 = 135.81.
      // The server rounds the same way; a client that rounded differently would quote a price
      // the receipt then contradicts by a kopeck.
      final estimate = TopupEstimate.of(
        amountTmt: 25,
        rate: _rub,
        method: _method(fee: 2.5),
      );

      expect(estimate!.fee, 3.31);
      expect(estimate.total, 135.81);
    });

    test('needs an amount, a rate and a method', () {
      expect(
        TopupEstimate.of(amountTmt: null, rate: _rub, method: _method()),
        isNull,
      );
      expect(
        TopupEstimate.of(amountTmt: 25, rate: null, method: _method()),
        isNull,
      );
      expect(TopupEstimate.of(amountTmt: 25, rate: _rub, method: null), isNull);
    });

    test('rejects a non-positive amount rather than quoting zero', () {
      expect(
        TopupEstimate.of(amountTmt: 0, rate: _rub, method: _method()),
        isNull,
      );
      expect(
        TopupEstimate.of(amountTmt: -5, rate: _rub, method: _method()),
        isNull,
      );
    });
  });

  group('TopupOptions', () {
    final options = TopupOptions(
      rates: const [
        _rub,
        Rate(currency: 'USD', rate: 0.062),
      ],
      paymentMethods: [_method()],
    );

    test('offers only currencies this service has a rate for', () {
      // The order endpoint answers "Currency not available for this service" for anything else,
      // so the picker is built from the rates, not from the six-value CurrencyCode enum.
      expect(options.currencies, ['RUB', 'USD']);
    });

    test('looks a rate up, and returns null for one that is not offered', () {
      expect(options.rateFor('USD')?.rate, 0.062);
      expect(options.rateFor('KZT'), isNull);
      expect(options.rateFor(null), isNull);
    });
  });

  group('parseAmount', () {
    test('accepts both decimal separators', () {
      // People here type 25,5 as readily as 25.5; rejecting the comma blames the user for a
      // locale difference.
      expect(parseAmount('25.5'), 25.5);
      expect(parseAmount('25,5'), 25.5);
      expect(parseAmount(' 100 '), 100);
    });

    test('rejects anything that is not a usable amount', () {
      expect(parseAmount(''), isNull);
      expect(parseAmount(null), isNull);
      expect(parseAmount('abc'), isNull);
      expect(parseAmount('0'), isNull);
      expect(parseAmount('-5'), isNull);
    });
  });

  group('PaymentMethodOption', () {
    test('reads the string feePercent the API sends', () {
      final method = PaymentMethodOption.fromJson(const {
        'id': 'pm1',
        'code': 'MANUAL',
        'name': 'Bank card / SBP (demo)',
        'provider': 'manual',
        'feePercent': '0',
        'sortOrder': 1,
      });

      expect(method.feePercent, 0);
      expect(method.isManual, isTrue);
    });

    test('a real gateway is not flagged as manual', () {
      final method = PaymentMethodOption.fromJson(const {
        'id': 'pm2',
        'code': 'CARD',
        'name': 'Card',
        'provider': 'stripe',
        'feePercent': '2.5',
      });

      expect(method.isManual, isFalse);
      expect(method.feePercent, 2.5);
    });
  });

  group('Rate', () {
    test('reads the string rate the API sends', () {
      // Verified live: {"currency":"RUB","rate":"5.3"}
      final rate = Rate.fromJson(const {'currency': 'RUB', 'rate': '5.3'});
      expect(rate.rate, 5.3);
      expect(rate.currency, 'RUB');
    });
  });
}
