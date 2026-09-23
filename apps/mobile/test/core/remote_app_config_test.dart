import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/firebase/remote_app_config.dart';

void main() {
  updateLevelTests();
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

void updateLevelTests() {
  final now = DateTime.utc(2026, 9, 21, 12);
  UpdateLevel level(String current, RemoteAppConfig config) =>
      evaluateUpdate(current: current, config: config, now: now);

  group('evaluateUpdate', () {
    test('nothing configured: nothing shown', () {
      expect(level('1.0.6', const RemoteAppConfig()), UpdateLevel.none);
    });

    test('latest version newer: a gentle recommendation only', () {
      const c = RemoteAppConfig(latestVersion: '1.1.0');
      expect(level('1.0.6', c), UpdateLevel.recommended);
      expect(level('1.1.0', c), UpdateLevel.none);
    });

    test('below the minimum with no deadline: blocked at once', () {
      const c = RemoteAppConfig(minVersion: '1.0.8');
      expect(level('1.0.6', c), UpdateLevel.required);
      expect(level('1.0.8', c), UpdateLevel.none);
    });

    test(
      'below the minimum with a future deadline: required soon, then blocked',
      () {
        const c = RemoteAppConfig(
          minVersion: '1.0.8',
          updateDeadline: '2026-09-25T00:00:00Z',
        );
        expect(level('1.0.6', c), UpdateLevel.requiredSoon);
        expect(
          evaluateUpdate(
            current: '1.0.6',
            config: c,
            now: DateTime.utc(2026, 9, 26),
          ),
          UpdateLevel.required,
        );
      },
    );

    test('an unreadable deadline never delays a security fix', () {
      const c = RemoteAppConfig(minVersion: '1.0.8', updateDeadline: 'soon');
      expect(level('1.0.6', c), UpdateLevel.required);
    });

    test('the minimum wins over the recommendation', () {
      const c = RemoteAppConfig(minVersion: '1.0.8', latestVersion: '1.2.0');
      expect(level('1.0.6', c), UpdateLevel.required);
      expect(level('1.0.9', c), UpdateLevel.recommended);
    });
  });
}
