import '../../../core/network/api_client.dart';
import '../../home/domain/catalog_service.dart';
import '../../orders/domain/order.dart';
import '../domain/topup_options.dart';

class TopupRepository {
  const TopupRepository(this._api);

  final ApiClient _api;

  /// The operator list.
  ///
  /// Fetched separately from `HomeRepository`'s copy on purpose: home issues its three calls in
  /// parallel, and sharing this one would serialise it behind them. Two cached lists of five
  /// rows is the cheaper trade.
  Future<List<CatalogService>> loadServices() async {
    final raw = await _api.get<List<dynamic>>('/catalog/services');
    return raw
        .whereType<Map<String, dynamic>>()
        .map(CatalogService.fromJson)
        .toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  /// Rates for one service, plus the payment methods. Both public, both fetched together because
  /// the form cannot show a price without either.
  Future<TopupOptions> loadOptions(String serviceId) async {
    final results = await Future.wait([
      _api.get<List<dynamic>>('/catalog/services/$serviceId/rates'),
      _api.get<List<dynamic>>('/catalog/payment-methods'),
    ]);

    return TopupOptions(
      rates: results[0]
          .whereType<Map<String, dynamic>>()
          .map(Rate.fromJson)
          .toList(),
      paymentMethods:
          results[1]
              .whereType<Map<String, dynamic>>()
              .map(PaymentMethodOption.fromJson)
              .toList()
            ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),
    );
  }

  /// Creates the order.
  ///
  /// The client sends the **requested** amount and currency; the server computes `rateApplied`,
  /// `feeAmount`, `amountCharged` and any referral discount, and returns them on the order. The
  /// response is what the customer is then shown — never the estimate that got them here.
  ///
  Future<TopupSubmission> createOrder({
    required String serviceId,
    required String paymentMethodId,
    required String recipientIdentifier,
    required double amountTmt,
    required String currency,
    required String serviceName,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/orders',
      body: {
        'serviceId': serviceId,
        'paymentMethodId': paymentMethodId,
        'recipientIdentifier': recipientIdentifier,
        'amountTmt': amountTmt,
        'currency': currency,
      },
    );

    // The create response is a bare order with no service relation, exactly like `/orders/me` —
    // so the name is passed in from the form rather than looked up again.
    final order = OrderSummary.fromTopupJson(json, serviceName: serviceName);
    final payment = await _api.post<Map<String, dynamic>>(
      '/payments/orders/${order.id}/initiate',
      headers: {'Idempotency-Key': 'mobile-order:${order.id}'},
    );
    return TopupSubmission(
      order: order,
      payment: PaymentInitiation.fromJson(payment),
    );
  }
}

class PaymentInitiation {
  const PaymentInitiation({
    required this.paymentId,
    required this.redirectUrl,
    required this.status,
  });
  final String paymentId;
  final String? redirectUrl;
  final String status;

  factory PaymentInitiation.fromJson(Map<String, dynamic> json) =>
      PaymentInitiation(
        paymentId: json['paymentId'] as String,
        redirectUrl: json['redirectUrl'] as String?,
        status: json['status'] as String? ?? 'UNKNOWN',
      );
}

class TopupSubmission {
  const TopupSubmission({required this.order, required this.payment});
  final OrderSummary order;
  final PaymentInitiation payment;
}
