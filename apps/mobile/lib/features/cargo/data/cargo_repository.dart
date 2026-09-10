import '../../../core/network/api_client.dart';
import '../../topup/domain/topup_options.dart' show PaymentMethodOption;
import '../domain/cargo_models.dart';

class CargoRepository {
  const CargoRepository(this._api);

  final ApiClient _api;

  Future<CargoDirections> loadDirections() async {
    final json = await _api.get<Map<String, dynamic>>('/cargo/directions');
    return CargoDirections.fromJson(json);
  }

  Future<List<CargoBanner>> loadBanners() async {
    final raw = await _api.get<List<dynamic>>('/cargo/banners');
    return raw
        .whereType<Map<String, dynamic>>()
        .map(CargoBanner.fromJson)
        .toList();
  }

  /// Same public, unauthenticated list the top-up flow uses -- purely informational for Cargo
  /// (price never depends on which one is picked, see `Shipment.paymentMethod`'s doc comment).
  Future<List<PaymentMethodOption>> loadPaymentMethods() async {
    final raw = await _api.get<List<dynamic>>('/catalog/payment-methods');
    return raw
        .whereType<Map<String, dynamic>>()
        .map(PaymentMethodOption.fromJson)
        .toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  /// Send only the field the cargo type is actually priced on -- the API rejects the other one
  /// by name rather than silently ignoring it.
  Future<CargoQuote> quote({
    required String itemTypeId,
    double? declaredWeightKg,
    int? quantity,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/cargo/quote',
      body: {
        'itemTypeId': itemTypeId,
        if (declaredWeightKg != null) 'declaredWeightKg': declaredWeightKg,
        if (quantity != null) 'quantity': quantity,
      },
    );
    return CargoQuote.fromJson(json);
  }

  Future<Shipment> createShipment({
    required String originCityId,
    required String destinationCityId,
    required String itemTypeId,
    required String paymentMethodId,
    required String senderName,
    required String senderPhone,
    required String pickupAddress,
    required String recipientName,
    required String recipientPhone,
    required ShipmentDeliveryMode deliveryMode,
    String? deliveryAddress,
    double? declaredWeightKg,
    int? quantity,
    bool fragile = false,
    String? notes,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/cargo/shipments',
      body: {
        'originCityId': originCityId,
        'destinationCityId': destinationCityId,
        'itemTypeId': itemTypeId,
        'paymentMethodId': paymentMethodId,
        'senderName': senderName,
        'senderPhone': senderPhone,
        'pickupAddress': pickupAddress,
        'recipientName': recipientName,
        'recipientPhone': recipientPhone,
        'deliveryMode': deliveryModeToJson(deliveryMode),
        if (deliveryMode == ShipmentDeliveryMode.doorDelivery)
          'deliveryAddress': deliveryAddress,
        if (declaredWeightKg != null) 'declaredWeightKg': declaredWeightKg,
        if (quantity != null) 'quantity': quantity,
        'fragile': fragile,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
    );
    return Shipment.fromJson(json);
  }

  Future<List<Shipment>> loadMine() async {
    final raw = await _api.get<List<dynamic>>('/cargo/shipments/me');
    return raw
        .whereType<Map<String, dynamic>>()
        .map(Shipment.fromJson)
        .toList();
  }

  Future<Shipment> loadOne(String id) async {
    final json = await _api.get<Map<String, dynamic>>('/cargo/shipments/$id');
    return Shipment.fromJson(json);
  }

  Future<Shipment> requestPickup(
    String shipmentId, {
    required String address,
    required DateTime requestedDate,
    required String timeWindow,
    required String phone,
    String? notes,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/cargo/shipments/$shipmentId/pickup',
      body: {
        'address': address,
        'requestedDate': requestedDate.toIso8601String(),
        'timeWindow': timeWindow,
        'phone': phone,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
    );
    return Shipment.fromJson(json);
  }

  Future<PublicTracking> track(String trackingNumber) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/cargo/track/$trackingNumber',
    );
    return PublicTracking.fromJson(json);
  }
}
