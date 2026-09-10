import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';

/// Which of the two order pipelines a row came from. They are separate tables with separate
/// status enums on the backend, and the app keeps them distinct rather than pretending otherwise.
enum OrderKind { topup, gallery }

/// One row in the combined order history.
///
/// **Every monetary value here comes from the server and is only ever displayed.** The client
/// never multiplies a rate, never applies a fee and never computes a discount — the backend owns
/// `rateApplied`, `feeAmount`, `amountCharged` and `referralDiscountTmt`, and a second
/// implementation on the client would eventually disagree with it. Disagreeing about money is the
/// one bug a payments product cannot ship.
class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.kind,
    required this.status,
    required this.amountTmt,
    required this.createdAt,
    required this.title,
    this.subtitle,
    this.imageUrl,
    this.currency,
    this.amountCharged,
    this.feeAmount,
    this.referralDiscountTmt,
    this.failureReason,
    this.deliveryNote,
    this.paidAt,
    this.completedAt,
    this.serviceId,
  });

  final String id;
  final OrderKind kind;

  /// The raw backend value. Kept as a string so a status added server-side renders rather than
  /// crashing the list — see [statusSpec].
  final String status;

  final double amountTmt;
  final DateTime? createdAt;

  /// What the row is *for*, resolved for display: the operator's name, or the product's.
  final String title;

  /// The recipient — a phone number for a top-up, a person for a gift.
  final String? subtitle;

  final String? imageUrl;
  final String? currency;
  final double? amountCharged;
  final double? feeAmount;
  final double? referralDiscountTmt;
  final String? failureReason;

  /// An activation key or promo code attached by an operator on completion.
  final String? deliveryNote;

  final DateTime? paidAt;
  final DateTime? completedAt;

  /// Only top-ups carry this. `/orders/me` does **not** include the service relation, so the name
  /// is resolved by joining against the catalogue — see [OrdersRepository].
  final String? serviceId;

  bool get isAwaitingPayment => status.toUpperCase() == 'PENDING_PAYMENT';

  /// `GET /orders/me` — bare rows, no relations included.
  factory OrderSummary.fromTopupJson(
    Map<String, dynamic> json, {
    String? serviceName,
  }) {
    final serviceId = json['serviceId'] as String?;
    return OrderSummary(
      id: json['id'] as String,
      kind: OrderKind.topup,
      status: json['status'] as String? ?? 'PENDING_PAYMENT',
      amountTmt: Money.parse(json['amountTmt']),
      createdAt: Dates.tryParse(json['createdAt']),
      // Falls back to the id fragment rather than an empty row when the catalogue lookup misses
      // (a service can be deleted while an old order still references it).
      title:
          serviceName ??
          (json['service'] as Map<String, dynamic>?)?['name'] as String? ??
          '—',
      subtitle: json['recipientIdentifier'] as String?,
      currency: json['currency'] as String?,
      amountCharged: Money.tryParse(json['amountCharged']),
      feeAmount: Money.tryParse(json['feeAmount']),
      referralDiscountTmt: Money.tryParse(json['referralDiscountTmt']),
      failureReason: json['failureReason'] as String?,
      deliveryNote: json['deliveryNote'] as String?,
      paidAt: Dates.tryParse(json['paidAt']),
      completedAt: Dates.tryParse(json['completedAt']),
      serviceId: serviceId,
    );
  }

  /// `GET /gallery/orders/me` — includes the product, unlike the top-up list.
  factory OrderSummary.fromGalleryJson(Map<String, dynamic> json) {
    final product = json['product'] as Map<String, dynamic>?;
    return OrderSummary(
      id: json['id'] as String,
      kind: OrderKind.gallery,
      status: json['status'] as String? ?? 'PENDING_PAYMENT',
      amountTmt: Money.parse(json['amountTmt']),
      createdAt: Dates.tryParse(json['createdAt']),
      title: product?['name'] as String? ?? '—',
      subtitle: json['recipientName'] as String?,
      imageUrl: product?['imageUrl'] as String?,
      completedAt: Dates.tryParse(json['deliveredAt']),
    );
  }
}
