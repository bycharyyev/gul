import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/contacts/contact_picker.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('normalizePhone', () {
    test('keeps a leading + and drops every other decoration', () {
      // How address books actually hold numbers. The recipient field admits only [0-9+], so
      // anything not cleaned here is silently mangled on its way in.
      expect(normalizePhone('+993 65 123456'), '+99365123456');
      expect(normalizePhone('(65) 12-34-56'), '651234 56'.replaceAll(' ', ''));
      expect(normalizePhone('8 800 555 35 35'), '88005553535');
      expect(normalizePhone(' +7 (989) 787-66-40 '), '+79897876640');
    });

    test('a + anywhere but the front is punctuation, not a country code', () {
      expect(normalizePhone('65+123456'), '65123456');
    });

    test('nothing usable gives an empty string, never a stray sign', () {
      expect(normalizePhone(null), '');
      expect(normalizePhone('   '), '');
      expect(normalizePhone('+'), '');
      expect(normalizePhone('нет номера'), '');
    });
  });

  group('ContactPicker', () {
    const channel = MethodChannel('test/contacts');
    TestDefaultBinaryMessenger messenger() =>
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

    tearDown(() => messenger().setMockMethodCallHandler(channel, null));

    test('returns the chosen number, cleaned', () async {
      messenger().setMockMethodCallHandler(
        channel,
        (call) async => {'phone': '+993 65 123456', 'name': ' Aman '},
      );

      final contact = await const ContactPicker(channel: channel).pick();

      expect(contact!.phone, '+99365123456');
      expect(contact.name, 'Aman');
    });

    test('cancelling the picker is null, not an error', () async {
      messenger().setMockMethodCallHandler(channel, (call) async => null);
      expect(await const ContactPicker(channel: channel).pick(), isNull);
    });

    test('a contact with no usable number is treated as no choice', () async {
      // Better to leave the field untouched than to fill it with something that cannot be sent.
      messenger().setMockMethodCallHandler(
        channel,
        (call) async => {'phone': '---', 'name': 'Aman'},
      );
      expect(await const ContactPicker(channel: channel).pick(), isNull);
    });

    test('a blank name is dropped rather than kept as empty text', () async {
      messenger().setMockMethodCallHandler(
        channel,
        (call) async => {'phone': '651234', 'name': '   '},
      );
      final contact = await const ContactPicker(channel: channel).pick();
      expect(contact!.name, isNull);
    });
  });
}
