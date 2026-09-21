import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/firebase/remote_app_config.dart';

void main() {
  group('isVersionBelow', () {
    test('compares numerically, not as text', () {
      expect(isVersionBelow('1.0.6', '1.0.10'), isTrue);
      expect(isVersionBelow('1.0.10', '1.0.6'), isFalse);
      expect(isVersionBelow('1.2.0', '1.10.0'), isTrue);
    });

    test('equal or newer is never blocked', () {
      expect(isVersionBelow('1.0.6', '1.0.6'), isFalse);
      expect(isVersionBelow('2.0.0', '1.9.9'), isFalse);
      expect(isVersionBelow('1.0', '1.0.0'), isFalse);
    });

    test('an empty or garbled minimum never locks anyone out', () {
      expect(isVersionBelow('1.0.6', ''), isFalse);
      expect(isVersionBelow('1.0.6', 'abc'), isFalse);
      expect(isVersionBelow('1.0.6', '9.x'), isFalse);
      expect(isVersionBelow('', '1.0.0'), isFalse);
    });

    test('ignores a build suffix', () {
      expect(isVersionBelow('1.0.6', '1.0.7+3'), isTrue);
    });
  });
}
