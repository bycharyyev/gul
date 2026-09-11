import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/config/feature_flags.dart';
import 'package:gulyaly_mobile/core/network/api_client.dart';
import 'package:gulyaly_mobile/features/home/data/home_repository.dart';
import 'package:gulyaly_mobile/features/profile/data/profile_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

/// What the Android build is allowed to declare to Google Play depends on what it actually does,
/// so these assertions are the declaration's evidence rather than a style preference.
///
/// Play rejected `pro.gulyaly.app` on 2026-09-11 because the Financial features declaration said
/// the app runs a rewards programme, and a personal developer account may not distribute one. The
/// answer we now give is "no financial features"; that answer stays true only while this build
/// neither shows a reward balance nor asks the server for one. If someone flips
/// [kReferralRewardsEnabled] back on without also moving to an organization account and
/// re-answering the declaration, these fail — which is the point.
void main() {
  group('referral rewards are absent from this build', () {
    test('the flag is off, so the declaration may say "no financial features"', () {
      expect(kReferralRewardsEnabled, isFalse);
    });

    test('the profile never asks the server for a reward summary', () async {
      final api = _Api();
      when(
        () => api.get<Map<String, dynamic>>('/account/email'),
      ).thenAnswer((_) async => {'email': 'a@b.c', 'emailVerified': true});

      final overview = await ProfileRepository(api).load();

      expect(overview.referral, isNull);
      // Not merely "the result was discarded": the request must never be made. A build that
      // fetches a reward balance it does not render still reads, in a network log, as an app
      // with a rewards programme.
      verifyNever(() => api.get<Map<String, dynamic>>('/referrals/me'));
    });

    test('home renders no balance and never asks for one', () async {
      final api = _Api();
      when(
        () => api.get<List<dynamic>>(any()),
      ).thenAnswer((_) async => <dynamic>[]);

      final snapshot = await HomeRepository(api).load();

      expect(snapshot.referralBalanceTmt, isNull);
      verifyNever(() => api.get<Map<String, dynamic>>('/referrals/me'));
    });
  });
}
