import 'package:intl/intl.dart';

/// Date rendering for order lists and detail screens.
class Dates {
  const Dates._();

  /// Parses an ISO timestamp, tolerating null and malformed input.
  ///
  /// The API returns UTC (`2026-08-19T16:26:57.698Z`); this converts to the device's zone, so an
  /// order placed at 21:00 local does not read as 16:00.
  static DateTime? tryParse(Object? raw) {
    if (raw is! String || raw.isEmpty) return null;
    return DateTime.tryParse(raw)?.toLocal();
  }

  /// `19 авг, 21:26` — day and time, which is what someone checking an order actually wants.
  /// The year is added only when it is not the current one, so the common case stays short.
  static String dateTime(DateTime value, String locale) {
    final tag = _intlLocale(locale);
    final pattern = value.year == DateTime.now().year
        ? 'd MMM, HH:mm'
        : 'd MMM yyyy, HH:mm';
    return DateFormat(pattern, tag).format(value);
  }

  static String date(DateTime value, String locale) =>
      DateFormat('d MMMM yyyy', _intlLocale(locale)).format(value);

  /// `intl` ships no `tkm` locale data. Russian month names are what this audience reads today —
  /// see the same decision in [Money].
  static String _intlLocale(String locale) => switch (locale) {
    'en' => 'en',
    _ => 'ru',
  };
}
