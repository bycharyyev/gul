import 'dart:io';

import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../auth/domain/user.dart';
import '../../home/domain/promo.dart';
import '../domain/legal_page.dart';
import '../domain/profile_overview.dart';

class ProfileRepository {
  const ProfileRepository(this._api);

  final ApiClient _api;

  /// The two secondary calls the profile screen needs, both failing soft.
  ///
  /// The user object itself already lives in auth state; this is the extra detail. Neither piece
  /// is worth blanking the screen over — someone opening Profile to sign out should not be
  /// blocked because the referral service is briefly down.
  Future<ProfileOverview> load() async {
    final results = await Future.wait([
      _tryGet('/account/email'),
      _tryGet('/referrals/me'),
    ]);

    final email = results[0];
    final referral = results[1];

    return ProfileOverview(
      email: email == null ? EmailStatus.unknown : EmailStatus.fromJson(email),
      referral: referral == null ? null : ReferralSummary.fromJson(referral),
    );
  }

  Future<Map<String, dynamic>?> _tryGet(String path) async {
    try {
      return await _api.get<Map<String, dynamic>>(path);
    } catch (_) {
      return null;
    }
  }

  /// `fullName` is required by the backend's `UpdateMeDto` even when only the phone changes, so
  /// the caller always passes the current value.
  Future<User> updateProfile({
    required String fullName,
    String? phone,
    String? locale,
  }) async {
    final data = await _api.patch<Map<String, dynamic>>(
      '/auth/me',
      body: {
        'fullName': fullName,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        if (locale != null) 'locale': locale,
      },
    );
    return User.fromJson(data);
  }

  /// A dedicated endpoint, because changing language should not require sending the name back.
  Future<void> updateLocale(String locale) =>
      _api.patch<void>('/auth/me/locale', body: {'locale': locale});

  /// Every other session is revoked server-side on success, so the caller must expect the current
  /// tokens to keep working only because they were just reissued — treat a failure here as "the
  /// password did not change".
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) => _api.post<void>(
    '/auth/change-password',
    body: {'currentPassword': currentPassword, 'newPassword': newPassword},
  );

  /// The current user, refetched.
  ///
  /// Avatar upload and removal both return the avatar record rather than the user, so the caller
  /// needs one more read to get the new `avatarUrl` -- and every screen that shows it, the nav
  /// bar included, then updates from a single source.
  Future<User> me() async =>
      User.fromJson(await _api.get<Map<String, dynamic>>('/auth/me'));

  /// The shop's social accounts.
  ///
  /// Fails soft to an empty list: a missing social row is not worth an error state on a screen
  /// someone opened to sign out.
  Future<List<SocialLink>> loadSocialLinks() async {
    try {
      final raw = await _api.get<List<dynamic>>('/social-links');
      return raw
          .whereType<Map<String, dynamic>>()
          .map(SocialLink.fromJson)
          .where((link) => link.isUsable)
          .toList()
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    } catch (_) {
      return const [];
    }
  }

  /// One CMS page by slug, resolved into the caller's locale.
  Future<LegalPage> loadLegalPage(String slug, String locale) async {
    final json = await _api.get<Map<String, dynamic>>('/content-pages/$slug');
    return LegalPage.fromJson(json, locale);
  }

  /// Uploads a new avatar and returns the refreshed user.
  ///
  /// Multipart, field name `file`, which is what `FileInterceptor("file")` expects. The server
  /// caps it at 5 MB and accepts jpeg/png/webp; the picker downscales before sending so a 12 MP
  /// camera shot does not become a rejected upload on a slow connection.
  Future<User> uploadAvatar(File file) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        file.path,
        filename: file.path.split(Platform.pathSeparator).last,
      ),
    });
    await _api.postMultipart<dynamic>('/avatar', form);
    // The upload response is the avatar record, not the user -- refetch so every screen that
    // reads `user.avatarUrl` (the nav bar included) updates from one source.
    return me();
  }

  Future<User> removeAvatar() async {
    await _api.delete<void>('/avatar');
    return me();
  }

  /// Starts email verification. The code is six digits and expires; the confirm step is separate.
  Future<void> requestEmailVerification(String email) =>
      _api.post<void>('/account/email/request', body: {'email': email});

  Future<void> confirmEmailVerification(String code) =>
      _api.post<void>('/account/email/confirm', body: {'code': code});
}
