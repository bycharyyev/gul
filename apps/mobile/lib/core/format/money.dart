import 'package:intl/intl.dart';

/// Money handling.
///
/// **The backend sends Prisma `Decimal` fields as JSON strings**, not numbers — verified live:
/// `"minAmountTmt":"5"`, `"priceTmt":"350"`, `"feePercent":"0"`. A few endpoints that build their
/// response by hand (`/referrals/me`) send a real number instead. So every money field has to
/// accept both shapes; assuming one is how you get a silent `type 'String' is not a subtype of
/// type 'num'` in production.
class Money {
  const Money._();

  /// Parses a money field that may arrive as a number or a decimal string.
  ///
  /// Returns null for null/absent so a missing optional field stays missing rather than becoming
  /// a misleading zero — 0 TMT and "no value" mean different things on a receipt.
  static double? tryParse(Object? raw) {
    if (raw == null) return null;
    if (raw is num) return raw.toDouble();
    if (raw is String) return double.tryParse(raw.trim());
    return null;
  }

  /// Same, but for a field the API always sends. Falls back to 0 rather than throwing: a total
  /// that renders as 0 is a visible bug the user can report; a crashed order list is not.
  static double parse(Object? raw) => tryParse(raw) ?? 0;

  /// `350 TMT`, `1 250,50 TMT` — grouped, and without trailing `,00` on whole amounts, which is
  /// how prices are written here.
  static String tmt(double value, String locale) =>
      '${amount(value, locale)} TMT';

  /// The number alone, for places that render the currency separately.
  static String amount(double value, String locale) {
    final format = NumberFormat.decimalPatternDigits(
      locale: _intlLocale(locale),
      decimalDigits: value == value.roundToDouble() ? 0 : 2,
    );
    return format.format(value);
  }

  /// `intl` has no `tkm` data. Turkmen number formatting matches the Russian convention used
  /// throughout this product (space grouping, comma decimal), so ru is the honest fallback.
  static String _intlLocale(String locale) => switch (locale) {
    'en' => 'en',
    _ => 'ru',
  };
}
