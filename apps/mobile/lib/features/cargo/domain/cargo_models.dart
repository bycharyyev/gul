import '../../../core/format/money.dart';
import '../../topup/domain/topup_options.dart' show PaymentMethodOption;

/// Origin and destination are two independent lists: any enabled origin can reach any enabled
/// destination, and the price does not depend on the pair.
class CargoCity {
  const CargoCity({
    required this.id,
    required this.name,
    required this.country,
  });

  final String id;
  final String name;
  final String country;

  factory CargoCity.fromJson(Map<String, dynamic> json) => CargoCity(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    country: json['country'] as String? ?? '',
  );
}

/// What is shipped decides how it is priced: weighed goods against the weight brackets, counted
/// goods (phones, medicines) at a flat price per unit.
class CargoItemType {
  const CargoItemType({
    required this.id,
    required this.code,
    required this.name,
    required this.description,
    required this.pricingUnit,
    required this.pricePerItemRub,
    required this.minWeightKg,
  });

  final String id;
  final String code;
  final String name;
  final String? description;
  final String pricingUnit;
  final double? pricePerItemRub;
  final double? minWeightKg;

  bool get isCounted => pricingUnit == 'PER_ITEM';

  factory CargoItemType.fromJson(Map<String, dynamic> json) => CargoItemType(
    id: json['id'] as String? ?? '',
    code: json['code'] as String? ?? '',
    name: json['name'] as String? ?? '',
    description: json['description'] as String?,
    pricingUnit: json['pricingUnit'] as String? ?? 'PER_KG',
    pricePerItemRub: json['pricePerItemRub'] == null
        ? null
        : Money.parse(json['pricePerItemRub']),
    minWeightKg: json['minWeightKg'] == null
        ? null
        : Money.parse(json['minWeightKg']),
  );
}

class CargoBanner {
  const CargoBanner({
    required this.title,
    required this.subtitle,
    required this.imageUrl,
    required this.linkUrl,
  });

  final String title;
  final String? subtitle;
  final String imageUrl;
  final String? linkUrl;

  factory CargoBanner.fromJson(Map<String, dynamic> json) => CargoBanner(
    title: json['title'] as String? ?? '',
    subtitle: json['subtitle'] as String?,
    imageUrl: json['imageUrl'] as String? ?? '',
    linkUrl: json['linkUrl'] as String?,
  );
}

/// One payload so the form is never drawn half-populated on a slow connection.
class CargoDirections {
  const CargoDirections({
    required this.origins,
    required this.destinations,
    required this.itemTypes,
  });

  final List<CargoCity> origins;
  final List<CargoCity> destinations;
  final List<CargoItemType> itemTypes;

  factory CargoDirections.fromJson(Map<String, dynamic> json) =>
      CargoDirections(
        origins: ((json['origins'] as List<dynamic>?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(CargoCity.fromJson)
            .toList(),
        destinations: ((json['destinations'] as List<dynamic>?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(CargoCity.fromJson)
            .toList(),
        itemTypes: ((json['itemTypes'] as List<dynamic>?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(CargoItemType.fromJson)
            .toList(),
      );
}

class CargoQuote {
  const CargoQuote({
    required this.pricePerKgTmt,
    required this.pricePerItemTmt,
    required this.quantity,
    required this.pickupFeeTmt,
    required this.totalPriceTmt,
  });

  /// Exactly one of these is set, matching the cargo type's pricing unit.
  final double? pricePerKgTmt;
  final double? pricePerItemTmt;
  final int quantity;
  final double pickupFeeTmt;
  final double totalPriceTmt;

  factory CargoQuote.fromJson(Map<String, dynamic> json) => CargoQuote(
    pricePerKgTmt: json['pricePerKgTmt'] == null
        ? null
        : Money.parse(json['pricePerKgTmt']),
    pricePerItemTmt: json['pricePerItemTmt'] == null
        ? null
        : Money.parse(json['pricePerItemTmt']),
    quantity: (json['quantity'] as num?)?.toInt() ?? 1,
    pickupFeeTmt: Money.parse(json['pickupFeeTmt']),
    totalPriceTmt: Money.parse(json['totalPriceTmt']),
  );
}

enum ShipmentDeliveryMode { warehousePickup, doorDelivery }

ShipmentDeliveryMode _deliveryModeFrom(String? value) =>
    value == 'DOOR_DELIVERY'
    ? ShipmentDeliveryMode.doorDelivery
    : ShipmentDeliveryMode.warehousePickup;

String deliveryModeToJson(ShipmentDeliveryMode mode) =>
    mode == ShipmentDeliveryMode.doorDelivery
    ? 'DOOR_DELIVERY'
    : 'WAREHOUSE_PICKUP';

class ShipmentTrackingEvent {
  const ShipmentTrackingEvent({
    required this.status,
    required this.note,
    required this.createdAt,
  });

  final String status;
  final String? note;
  final DateTime createdAt;

  factory ShipmentTrackingEvent.fromJson(Map<String, dynamic> json) =>
      ShipmentTrackingEvent(
        status: json['status'] as String? ?? '',
        note: json['note'] as String?,
        createdAt:
            DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
      );
}

class CargoPickupRequest {
  const CargoPickupRequest({required this.status});

  final String status;

  factory CargoPickupRequest.fromJson(Map<String, dynamic> json) =>
      CargoPickupRequest(status: json['status'] as String? ?? '');
}

/// A shipment, in whichever detail level the endpoint returned -- list rows and full detail share
/// this one model; fields the list endpoint doesn't include (pickup, trackingEvents) are just
/// empty/null rather than needing a second class.
class Shipment {
  const Shipment({
    required this.id,
    required this.publicTrackingNumber,
    required this.status,
    required this.originCity,
    required this.destinationCity,
    required this.itemType,
    required this.quantity,
    required this.declaredWeightKg,
    required this.totalPriceTmt,
    required this.paymentMethod,
    required this.senderName,
    required this.senderPhone,
    required this.pickupAddress,
    required this.recipientName,
    required this.recipientPhone,
    required this.deliveryMode,
    required this.deliveryAddress,
    required this.createdAt,
    required this.pickup,
    required this.trackingEvents,
  });

  final String id;
  final String publicTrackingNumber;
  final String status;
  final CargoCity originCity;
  final CargoCity destinationCity;
  final CargoItemType itemType;
  final int quantity;
  final double declaredWeightKg;
  final double totalPriceTmt;
  final PaymentMethodOption paymentMethod;
  final String senderName;
  final String senderPhone;
  final String pickupAddress;
  final String recipientName;
  final String recipientPhone;
  final ShipmentDeliveryMode deliveryMode;
  final String? deliveryAddress;
  final DateTime createdAt;
  final CargoPickupRequest? pickup;
  final List<ShipmentTrackingEvent> trackingEvents;

  factory Shipment.fromJson(Map<String, dynamic> json) => Shipment(
    id: json['id'] as String,
    publicTrackingNumber: json['publicTrackingNumber'] as String? ?? '',
    status: json['status'] as String? ?? '',
    originCity: CargoCity.fromJson(
      (json['originCity'] as Map<String, dynamic>?) ?? const {},
    ),
    destinationCity: CargoCity.fromJson(
      (json['destinationCity'] as Map<String, dynamic>?) ?? const {},
    ),
    itemType: CargoItemType.fromJson(
      (json['itemType'] as Map<String, dynamic>?) ?? const {},
    ),
    quantity: (json['quantity'] as num?)?.toInt() ?? 1,
    declaredWeightKg: Money.parse(json['declaredWeightKg']),
    totalPriceTmt: Money.parse(json['totalPriceTmt']),
    paymentMethod: PaymentMethodOption.fromJson(
      (json['paymentMethod'] as Map<String, dynamic>?) ?? const {'id': ''},
    ),
    senderName: json['senderName'] as String? ?? '',
    senderPhone: json['senderPhone'] as String? ?? '',
    pickupAddress: json['pickupAddress'] as String? ?? '',
    recipientName: json['recipientName'] as String? ?? '',
    recipientPhone: json['recipientPhone'] as String? ?? '',
    deliveryMode: _deliveryModeFrom(json['deliveryMode'] as String?),
    deliveryAddress: json['deliveryAddress'] as String?,
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    pickup: json['pickup'] == null
        ? null
        : CargoPickupRequest.fromJson(json['pickup'] as Map<String, dynamic>),
    trackingEvents: ((json['trackingEvents'] as List<dynamic>?) ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ShipmentTrackingEvent.fromJson)
        .toList(),
  );
}

/// The public tracking result -- deliberately a separate, smaller shape: `/cargo/track/:code` is
/// unauthenticated and the API never sends sender/recipient/price for it.
class PublicTracking {
  const PublicTracking({
    required this.trackingNumber,
    required this.status,
    required this.originCity,
    required this.destinationCity,
    required this.events,
  });

  final String trackingNumber;
  final String status;
  final CargoCity originCity;
  final CargoCity destinationCity;
  final List<ShipmentTrackingEvent> events;

  factory PublicTracking.fromJson(Map<String, dynamic> json) => PublicTracking(
    trackingNumber: json['publicTrackingNumber'] as String? ?? '',
    status: json['status'] as String? ?? '',
    originCity: CargoCity.fromJson(
      (json['originCity'] as Map<String, dynamic>?) ?? const {},
    ),
    destinationCity: CargoCity.fromJson(
      (json['destinationCity'] as Map<String, dynamic>?) ?? const {},
    ),
    events: ((json['trackingEvents'] as List<dynamic>?) ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ShipmentTrackingEvent.fromJson)
        .toList(),
  );
}
