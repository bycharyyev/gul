import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// One contact, as the system picker handed it back.
class PickedContact {
  const PickedContact({required this.phone, this.name});

  final String phone;
  final String? name;
}

/// Opens the phone's own contact list and returns the one number the person tapped.
///
/// There is no `READ_CONTACTS` behind this and no runtime prompt. The Contacts app does the
/// choosing and returns a URI we may read once, for that single row -- so the app never gains the
/// ability to read the address book, the manifest keeps its only permission (INTERNET), and the
/// Play data-safety answer "we do not collect contacts" stays true. Asking for the permission
/// would buy nothing here: we want one number, not a list.
///
/// Android only. Elsewhere [isSupported] is false and the UI hides the button rather than
/// offering something that cannot work.
class ContactPicker {
  const ContactPicker({MethodChannel channel = _defaultChannel})
    : _channel = channel;

  static const _defaultChannel = MethodChannel('pro.gulyaly/contacts');
  final MethodChannel _channel;

  /// Only Android implements the channel. `defaultTargetPlatform` rather than `Platform.isAndroid`
  /// so a widget test can state which platform it is testing instead of inheriting the host's.
  static bool get isSupported =>
      defaultTargetPlatform == TargetPlatform.android;

  /// Null when the person backed out of the picker without choosing — an ordinary outcome, not
  /// an error, and the caller should leave the field exactly as it was.
  Future<PickedContact?> pick() async {
    final result = await _channel.invokeMapMethod<String, dynamic>('pickPhone');
    if (result == null) return null;
    final phone = normalizePhone(result['phone'] as String?);
    if (phone.isEmpty) return null;
    final name = (result['name'] as String?)?.trim();
    return PickedContact(
      phone: phone,
      name: name == null || name.isEmpty ? null : name,
    );
  }
}

/// Strips a contact's formatting down to what the recipient field accepts.
///
/// Address books hold numbers as people wrote them — `+993 65 123456`, `(65) 12-34-56`,
/// `8 800 555 35 35`. The field only admits `[0-9+]`, so handing it the raw value would silently
/// drop the spaces and brackets and leave whatever fell through, which is how a number arrives
/// almost right and fails validation for a reason nobody can see. Doing it here means what lands
/// in the field is what will be sent.
///
/// A `+` is kept only in the leading position, where it means a country code. Anywhere else it is
/// punctuation from the source and goes the way of the brackets.
String normalizePhone(String? raw) {
  if (raw == null) return '';
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  final digits = trimmed.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.isEmpty) return '';
  return trimmed.startsWith('+') ? '+$digits' : digits;
}
