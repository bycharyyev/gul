import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/format/money.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('ru');
    await initializeDateFormatting('en');
  });

  group('parsing', () {
    test('accepts the decimal strings the API actually sends', () {
      // Verified live: {"minAmountTmt":"5"}, {"priceTmt":"350"}, {"feePercent":"0"}. Prisma
      // serialises every Decimal as a string, and typing these as num is a runtime crash.
      expect(Money.parse('350'), 350);
      expect(Money.parse('25.50'), 25.5);
      expect(Money.parse('0'), 0);
    });

    test('accepts real numbers too', () {
      // /referrals/me builds its response by hand and sends a number.
      expect(Money.parse(12), 12);
      expect(Money.parse(12.5), 12.5);
    });

    test('tryParse keeps null distinct from zero', () {
      // A missing fee and a zero fee mean different things on a receipt.
      expect(Money.tryParse(null), isNull);
      expect(Money.tryParse('0'), 0);
      expect(Money.tryParse('nonsense'), isNull);
      expect(Money.tryParse(const {}), isNull);
    });

    test('parse falls back to zero rather than throwing', () {
      // A total that renders as 0 is a bug the user can report; a crashed order list is not.
      expect(Money.parse(null), 0);
      expect(Money.parse('nonsense'), 0);
    });

    test('tolerates whitespace', () {
      expect(Money.parse(' 42.00 '), 42);
    });
  });

  group('formatting', () {
    test('drops the decimals on whole amounts', () {
      expect(Money.tmt(350, 'ru'), '350 TMT');
      expect(Money.tmt(350, 'en'), '350 TMT');
    });

    test('keeps them when they carry information', () {
      expect(Money.tmt(25.5, 'en'), '25.50 TMT');
    });

    test('groups thousands', () {
      expect(Money.amount(1250, 'en'), '1,250');
    });

    test('tkm falls back to the Russian convention rather than failing', () {
      // intl has no `tkm` data at all; asking for it throws.
      expect(() => Money.tmt(1250, 'tkm'), returnsNormally);
    });
  });
}
