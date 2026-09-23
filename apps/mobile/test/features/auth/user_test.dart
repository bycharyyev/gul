import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/features/auth/domain/user.dart';

void main() {
  group('User.fromJson', () {
    test('reads the full payload', () {
      final user = User.fromJson(const {
        'id': 'usr_1',
        'phone': '+99361234567',
        'username': 'aygul',
        'role': 'CUSTOMER',
        'locale': 'tkm',
        'fullName': 'Aýgül',
        'avatarUrl': 'https://s3.example/avatar.png',
      });

      expect(user.id, 'usr_1');
      expect(user.phone, '+99361234567');
      expect(user.locale, 'tkm');
      expect(user.fullName, 'Aýgül');
      expect(user.referralCode, 'aygul');
    });

    test('survives a response that omits the optional fields', () {
      final user = User.fromJson(const {
        'id': 'usr_2',
        'phone': '+99361111111',
        'username': 'merjen',
      });

      expect(user.role, 'CUSTOMER');
      expect(user.locale, 'ru');
      expect(user.fullName, isNull);
      expect(user.avatarUrl, isNull);
    });

    test('keeps an unknown role instead of breaking', () {
      // The client must not crash when the backend introduces a role. Authorization is enforced
      // server-side, so an unrecognised value is inert here.
      expect(
        User.fromJson(const {
          'id': 'u',
          'phone': '+993',
          'username': 'x',
          'role': 'PARTNER_MANAGER',
        }).role,
        'PARTNER_MANAGER',
      );
    });

    test(
      'compares by value, so Riverpod does not rebuild on an identical payload',
      () {
        const json = {
          'id': 'usr_1',
          'phone': '+99361234567',
          'username': 'aygul',
          'role': 'CUSTOMER',
          'locale': 'ru',
        };
        expect(User.fromJson(json), User.fromJson(json));
        expect(User.fromJson(json).hashCode, User.fromJson(json).hashCode);
      },
    );

    test('copyWith leaves identity fields alone', () {
      final user = User.fromJson(const {
        'id': 'usr_1',
        'phone': '+993',
        'username': 'aygul',
        'role': 'CUSTOMER',
        'locale': 'ru',
      });
      final updated = user.copyWith(locale: 'en', fullName: 'A');

      expect(updated.id, user.id);
      expect(updated.username, user.username);
      expect(updated.role, user.role);
      expect(updated.locale, 'en');
      expect(updated.fullName, 'A');
    });
  });
}
