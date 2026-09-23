import '../../../core/format/money.dart';

/// How much of `currency` one TMT costs.
///
/// The value arrives as a string (`"rate":"5.3"`) like every other Prisma `Decimal`.
class Rate {
  const Rate({required this.currency, required this.rate});

  final String currency;
  final double rate;

  factory Rate.fromJson(Map<String, dynamic> json) => Rate(
    currency: json['currency'] as String? ?? '',
    rate: Money.parse(json['rate']),
  );
}

/// A way to pay. Production returns exactly one, whose `provider` is `manual`.
class PaymentMethodOption {
  const PaymentMethodOption({
    required this.id,
    required this.code,
    required this.name,
    required this.provider,
    required this.feePercent,
    required this.sortOrder,
  });

  final String id;
  final String code;
  final String name;

  /// The adapter key on the server. `manual` means a person confirms the payment by hand — the
  /// app must not imply a card was charged.
  final String provider;

  final double feePercent;
  final int sortOrder;

  bool get isManual => provider == 'manual';

  factory PaymentMethodOption.fromJson(Map<String, dynamic> json) =>
      PaymentMethodOption(
        id: json['id'] as String,
        code: json['code'] as String? ?? '',
        name: json['name'] as String? ?? '',
        provider: json['provider'] as String? ?? '',
        feePercent: Money.parse(json['feePercent']),
        sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      );
}

/// Everything the top-up form needs beyond the service itself.
class TopupOptions {
  const TopupOptions({required this.rates, required this.paymentMethods});

  final List<Rate> rates;
  final List<PaymentMethodOption> paymentMethods;

  /// Currencies this service actually has an enabled rate for. The order endpoint rejects any
  /// other value with "Currency not available for this service", so the picker is built from
  /// this rather than from the six-value `CurrencyCode` enum.
  List<String> get currencies => rates.map((r) => r.currency).toList();

  Rate? rateFor(String? currency) {
    if (currency == null) return null;
    for (final rate in rates) {
      if (rate.currency == currency) return rate;
    }
    return null;
  }
}

/// What the customer will roughly pay, computed on the client **for display only**.
///
/// The server is the authority: `OrdersService.create` recomputes all of this and stores
/// `rateApplied`, `feeAmount` and `amountCharged` on the order, and the app shows those
/// afterwards. This estimate exists because there is no quote endpoint (see GAP 10) and nobody
/// should have to commit to a purchase to find out the price.
///
/// It can differ from the final figure in one direction: an available referral balance is
/// deducted server-side at creation time, so the customer sometimes pays **less** than this. It
/// is therefore always shown with a `≈` and never as "total".
class TopupEstimate {
  const TopupEstimate({
    required this.amountTmt,
    required this.currency,
    required this.subtotal,
    required this.fee,
    required this.total,
  });

  final double amountTmt;
  final String currency;
  final double subtotal;
  final double fee;
  final double total;

  /// Mirrors `OrdersService.create` exactly, including its rounding, so the estimate matches the
  /// order in the common case where no referral balance applies.
  static TopupEstimate? of({
    required double? amountTmt,
    required Rate? rate,
    required PaymentMethodOption? method,
  }) {
    if (amountTmt == null || amountTmt <= 0 || rate == null || method == null) {
      return null;
    }

    final subtotal = amountTmt * rate.rate;
    final fee = subtotal * (method.feePercent / 100);

    return TopupEstimate(
      amountTmt: amountTmt,
      currency: rate.currency,
      subtotal: subtotal,
      fee: (fee * 100).round() / 100,
      total: ((subtotal + fee) * 100).round() / 100,
    );
  }
}
