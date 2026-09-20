import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/l10n/countries.dart';
import 'package:gulyaly_mobile/core/notifications/push_notification_builder.dart';
import 'package:gulyaly_mobile/features/auth/domain/user.dart';

void main() {
  group('push payload', () {
    test('round-trips the route and the delivery id', () {
      final payload = encodePushPayload(
        route: '/home/orders/detail/7',
        deliveryId: 'd1',
      );
      final decoded = decodePushPayload(payload);
      expect(decoded.route, '/home/orders/detail/7');
      expect(decoded.deliveryId, 'd1');
    });

    test('a payload with nothing in it is null', () {
      expect(encodePushPayload(), isNull);
    });

    test('a notification drawn by an older build carries the bare route', () {
      final decoded = decodePushPayload('/feed');
      expect(decoded.route, '/feed');
      expect(decoded.deliveryId, isNull);
    });

    test('garbage never throws', () {
      expect(decodePushPayload('{not json').route, isNull);
      expect(decodePushPayload('').route, isNull);
      expect(decodePushPayload(null).route, isNull);
    });
  });

  group('push categories', () {
    test('an unknown category falls back to orders instead of failing', () {
      expect(PushCategory.byId('nope'), PushCategory.orders);
      expect(PushCategory.byId(null), PushCategory.orders);
    });

    test('every section has its own channel id', () {
      final ids = PushCategory.all.map((c) => c.channelId).toSet();
      expect(ids.length, PushCategory.all.length);
    });
  });

  group('country', () {
    test('the account carries the country the server worked out', () {
      final user = User.fromJson(const {
        'id': 'u1',
        'phone': '+99361234567',
        'username': 'aygul',
        'role': 'CUSTOMER',
        'locale': 'ru',
        'country': 'TM',
      });
      expect(user.country, 'TM');
      expect(user.copyWith(country: 'TR').country, 'TR');
    });

    test('an account without a country is fine', () {
      final user = User.fromJson(const {
        'id': 'u1',
        'phone': '+2547123456789',
        'username': 'x',
        'role': 'CUSTOMER',
        'locale': 'ru',
      });
      expect(user.country, isNull);
    });

    test('the profile list covers the countries targeted from the admin', () {
      final codes = countryOptions.map((c) => c.code).toSet();
      expect(codes, containsAll(['TM', 'RU', 'CN', 'TR']));
      expect(
        countryOptions.firstWhere((c) => c.code == 'CN').name('en'),
        'China',
      );
      expect(
        countryOptions.firstWhere((c) => c.code == 'TR').name('tkm'),
        'Türkiýe',
      );
    });
  });
}
