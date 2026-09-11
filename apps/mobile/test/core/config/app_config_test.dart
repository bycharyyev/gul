import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/config/app_config.dart';

void main() {
  group('AppConfig.fromEnvironment', () {
    test('a build with no APP_ENV never points a release at the emulator host', () {
      // The default used to be development for every build. A release built without the flag
      // therefore talked to 10.0.2.2 — the emulator's view of its own host — which is dead on
      // every real phone, and the app also forbids cleartext, so it could not even try. That is
      // a build nobody can use and nobody notices until it is in the store.
      final config = AppConfig.fromEnvironment();

      if (kReleaseMode) {
        expect(config.environment, AppEnvironment.production);
        expect(config.apiBaseUrl, startsWith('https://'));
      } else {
        expect(config.environment, AppEnvironment.development);
      }
    });

    test('production never points anywhere but https', () {
      // Whatever else changes, a production build must not be reachable over plain http: the
      // manifest sets usesCleartextTraffic=false, so such a build would fail every request.
      const config = AppConfig(
        environment: AppEnvironment.production,
        apiBaseUrl: 'https://api.gulyaly.pro/api',
        siteBaseUrl: 'https://gulyaly.pro',
        connectTimeout: Duration(seconds: 15),
        receiveTimeout: Duration(seconds: 30),
      );

      expect(config.apiBaseUrl, startsWith('https://'));
      expect(config.siteBaseUrl, startsWith('https://'));
    });

    test('production keeps request bodies out of the log', () {
      const config = AppConfig(
        environment: AppEnvironment.production,
        apiBaseUrl: 'https://api.gulyaly.pro/api',
        siteBaseUrl: 'https://gulyaly.pro',
        connectTimeout: Duration(seconds: 15),
        receiveTimeout: Duration(seconds: 30),
      );

      expect(config.verboseLogging, isFalse);
    });

    test(
      'a trailing slash on the site url is trimmed, so links never double up',
      () {
        // The invite and referral links concatenate onto this. `gulyaly.pro//i/CODE` resolves for
        // a browser and looks like a mistake to the person reading it.
        const config = AppConfig(
          environment: AppEnvironment.production,
          apiBaseUrl: 'https://api.gulyaly.pro/api',
          siteBaseUrl: 'https://gulyaly.pro',
          connectTimeout: Duration(seconds: 15),
          receiveTimeout: Duration(seconds: 30),
        );

        expect(
          config.groupInviteLink('ABCDEFGHJK'),
          'https://gulyaly.pro/i/ABCDEFGHJK',
        );
        expect(config.referralLink('AMAN'), 'https://gulyaly.pro/r/AMAN');
      },
    );
  });
}
