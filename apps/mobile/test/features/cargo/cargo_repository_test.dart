import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/network/api_client.dart';
import 'package:gulyaly_mobile/features/cargo/data/cargo_repository.dart';
import 'package:gulyaly_mobile/features/cargo/domain/cargo_models.dart';
import 'package:mocktail/mocktail.dart';

class MockApiClient extends Mock implements ApiClient {}

void main() {
  late MockApiClient api;
  late CargoRepository repository;

  setUp(() {
    api = MockApiClient();
    repository = CargoRepository(api);
  });

  group('quote', () {
    test(
      'a weighed type sends the weight only, and reads back the server-computed price',
      () async {
        when(
          () => api.post<Map<String, dynamic>>(
            '/cargo/quote',
            body: any(named: 'body'),
          ),
        ).thenAnswer(
          (_) async => {
            'pricePerKgTmt': 50,
            'pickupFeeTmt': 20,
            'totalPriceTmt': 195,
          },
        );

        final quote = await repository.quote(
          itemTypeId: 'type-kg',
          declaredWeightKg: 3.5,
        );

        final captured =
            verify(
                  () => api.post<Map<String, dynamic>>(
                    '/cargo/quote',
                    body: captureAny(named: 'body'),
                  ),
                ).captured.single
                as Map<String, dynamic>;
        // No `quantity` key at all: sending the field the type is not priced on is a 400.
        expect(captured, {'itemTypeId': 'type-kg', 'declaredWeightKg': 3.5});
        expect(quote.totalPriceTmt, 195);
      },
    );

    test(
      'a counted type sends the quantity only, and never the weight',
      () async {
        when(
          () => api.post<Map<String, dynamic>>(
            '/cargo/quote',
            body: any(named: 'body'),
          ),
        ).thenAnswer(
          (_) async => {
            'pricePerItemTmt': 200,
            'quantity': 3,
            'pickupFeeTmt': 0,
            'totalPriceTmt': 600,
          },
        );

        final quote = await repository.quote(
          itemTypeId: 'type-item',
          quantity: 3,
        );

        final captured =
            verify(
                  () => api.post<Map<String, dynamic>>(
                    '/cargo/quote',
                    body: captureAny(named: 'body'),
                  ),
                ).captured.single
                as Map<String, dynamic>;
        expect(captured, {'itemTypeId': 'type-item', 'quantity': 3});
        expect(quote.pricePerKgTmt, isNull);
        expect(quote.totalPriceTmt, 600);
      },
    );

    test(
      'parses money fields whether the server sends a number or a Decimal string',
      () {
        final fromNumbers = CargoQuote.fromJson({
          'pricePerKgTmt': 50,
          'pickupFeeTmt': 20,
          'totalPriceTmt': 195,
        });
        final fromStrings = CargoQuote.fromJson({
          'pricePerKgTmt': '50',
          'pickupFeeTmt': '20',
          'totalPriceTmt': '195',
        });
        expect(fromNumbers.totalPriceTmt, 195);
        expect(fromStrings.totalPriceTmt, 195);
      },
    );
  });

  group('createShipment', () {
    test('omits deliveryAddress for warehouse pickup', () async {
      when(
        () => api.post<Map<String, dynamic>>(
          '/cargo/shipments',
          body: any(named: 'body'),
        ),
      ).thenAnswer((_) async => _shipmentJson());

      await repository.createShipment(
        originCityId: 'city-ru',
        destinationCityId: 'city-tm',
        itemTypeId: 'type-kg',
        paymentMethodId: 'method-1',
        senderName: 'Ahmet',
        senderPhone: '+70000000001',
        pickupAddress: 'Moscow, some street',
        recipientName: 'Merjen',
        recipientPhone: '+99312345678',
        deliveryMode: ShipmentDeliveryMode.warehousePickup,
        declaredWeightKg: 2,
      );

      final captured =
          verify(
                () => api.post<Map<String, dynamic>>(
                  '/cargo/shipments',
                  body: captureAny(named: 'body'),
                ),
              ).captured.single
              as Map<String, dynamic>;
      expect(captured.containsKey('deliveryAddress'), isFalse);
      expect(captured['deliveryMode'], 'WAREHOUSE_PICKUP');
      expect(captured['paymentMethodId'], 'method-1');
    });

    test('includes deliveryAddress for door delivery', () async {
      when(
        () => api.post<Map<String, dynamic>>(
          '/cargo/shipments',
          body: any(named: 'body'),
        ),
      ).thenAnswer((_) async => _shipmentJson());

      await repository.createShipment(
        originCityId: 'city-ru',
        destinationCityId: 'city-tm',
        itemTypeId: 'type-kg',
        paymentMethodId: 'method-1',
        senderName: 'Ahmet',
        senderPhone: '+70000000001',
        pickupAddress: 'Moscow, some street',
        recipientName: 'Merjen',
        recipientPhone: '+99312345678',
        deliveryMode: ShipmentDeliveryMode.doorDelivery,
        deliveryAddress: 'Ashgabat, some street',
        declaredWeightKg: 2,
      );

      final captured =
          verify(
                () => api.post<Map<String, dynamic>>(
                  '/cargo/shipments',
                  body: captureAny(named: 'body'),
                ),
              ).captured.single
              as Map<String, dynamic>;
      expect(captured['deliveryAddress'], 'Ashgabat, some street');
      expect(captured['deliveryMode'], 'DOOR_DELIVERY');
    });
  });

  group('loadPaymentMethods', () {
    test(
      'fetches the same public catalog endpoint the top-up flow uses, sorted by sortOrder',
      () async {
        when(
          () => api.get<List<dynamic>>('/catalog/payment-methods'),
        ).thenAnswer(
          (_) async => [
            {
              'id': 'm2',
              'code': 'CARD',
              'name': 'Card',
              'provider': 'manual',
              'feePercent': '0',
              'sortOrder': 2,
            },
            {
              'id': 'm1',
              'code': 'MANUAL',
              'name': 'Manual transfer',
              'provider': 'manual',
              'feePercent': '0',
              'sortOrder': 1,
            },
          ],
        );

        final methods = await repository.loadPaymentMethods();

        expect(methods.map((m) => m.id), ['m1', 'm2']);
      },
    );
  });

  group('Shipment.fromJson', () {
    test(
      'parses both cities and the cargo type, a null pickup, and an empty timeline',
      () {
        final shipment = Shipment.fromJson(_shipmentJson());

        expect(shipment.originCity.name, 'Москва');
        expect(shipment.destinationCity.name, 'Ашхабад');
        expect(shipment.itemType.name, 'Личные вещи');
        expect(shipment.itemType.isCounted, isFalse);
        expect(shipment.pickup, isNull);
        expect(shipment.trackingEvents, isEmpty);
        expect(shipment.deliveryMode, ShipmentDeliveryMode.warehousePickup);
        expect(shipment.paymentMethod.name, 'Manual transfer');
      },
    );

    test('parses a present pickup and tracking events in order', () {
      final json = _shipmentJson();
      json['pickup'] = {'status': 'CONFIRMED'};
      json['trackingEvents'] = [
        {
          'status': 'PAID',
          'note': null,
          'createdAt': '2026-09-04T10:00:00.000Z',
        },
        {
          'status': 'PICKUP_REQUESTED',
          'note': 'left at the door',
          'createdAt': '2026-09-04T11:00:00.000Z',
        },
      ];

      final shipment = Shipment.fromJson(json);

      expect(shipment.pickup?.status, 'CONFIRMED');
      expect(shipment.trackingEvents, hasLength(2));
      expect(shipment.trackingEvents.last.note, 'left at the door');
    });
  });

  group('requestPickup', () {
    test('sends the date as ISO 8601', () async {
      when(
        () => api.post<Map<String, dynamic>>(
          '/cargo/shipments/s1/pickup',
          body: any(named: 'body'),
        ),
      ).thenAnswer((_) async => _shipmentJson());

      await repository.requestPickup(
        's1',
        address: 'Moscow, some street',
        requestedDate: DateTime.utc(2026, 9, 10),
        timeWindow: '10:00-14:00',
        phone: '+70000000001',
      );

      final captured =
          verify(
                () => api.post<Map<String, dynamic>>(
                  '/cargo/shipments/s1/pickup',
                  body: captureAny(named: 'body'),
                ),
              ).captured.single
              as Map<String, dynamic>;
      expect(captured['requestedDate'], '2026-09-10T00:00:00.000Z');
    });
  });
}

Map<String, dynamic> _shipmentJson() => {
  'id': 's1',
  'publicTrackingNumber': 'CRG-2026-000001',
  'status': 'PENDING_PAYMENT',
  'originCity': {'id': 'city-ru', 'name': 'Москва', 'country': 'RU'},
  'destinationCity': {'id': 'city-tm', 'name': 'Ашхабад', 'country': 'TM'},
  'itemType': {
    'id': 'type-kg',
    'code': 'PERSONAL_ITEMS',
    'name': 'Личные вещи',
    'pricingUnit': 'PER_KG',
    'minWeightKg': '5',
  },
  'quantity': 1,
  'declaredWeightKg': '2',
  'totalPriceTmt': '120',
  'paymentMethod': {
    'id': 'method-1',
    'code': 'MANUAL',
    'name': 'Manual transfer',
    'provider': 'manual',
    'feePercent': '0',
    'sortOrder': 0,
  },
  'senderName': 'Ahmet',
  'senderPhone': '+70000000001',
  'pickupAddress': 'Moscow, some street',
  'recipientName': 'Merjen',
  'recipientPhone': '+99312345678',
  'deliveryMode': 'WAREHOUSE_PICKUP',
  'deliveryAddress': null,
  'createdAt': '2026-09-04T10:00:00.000Z',
  'pickup': null,
  'trackingEvents': <dynamic>[],
};
