import 'dart:io';

import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/my_shop.dart';
import '../domain/shop_profile.dart';

/// Opening a shop, from an account that already exists.
///
/// One call, and deliberately a thin one: the phone and the password that identify a person are
/// not sent. The server reads them off the session, so nothing in this request can name somebody
/// else's account.
class SellerRepository {
  const SellerRepository(this._api);

  final ApiClient _api;

  /// One shop's public page. No authentication: a shop is public, and a customer who has not
  /// signed in must still be able to see whose video they just watched.
  Future<ShopProfile> loadShop(String handle) async {
    final json = await _api.get<Map<String, dynamic>>('/sellers/$handle');
    return ShopProfile.fromJson(json);
  }

  Future<void> applyAsMe({
    required String handle,
    required String shopName,
    String? description,
  }) => _api.post<Map<String, dynamic>>(
    '/sellers/apply-as-me',
    body: {
      'handle': handle,
      'shopName': shopName,
      if (description != null && description.isNotEmpty)
        'description': description,
    },
  );

  /// The signed-in seller's own shop. 404s for anyone who has not been approved yet -- there is
  /// no row to read -- which the screen that calls this treats as "not a seller" rather than as
  /// a transport error.
  Future<MyShop> getMyProfile() async {
    final json = await _api.get<Map<String, dynamic>>('/sellers/me');
    return MyShop.fromJson(json);
  }

  /// Updates whichever of these the seller changed. Omitted fields are left as they were --
  /// `UpdateSellerDto` on the server treats every field as optional for exactly this reason, so a
  /// caller editing only the description never has to resend a logo it never downloaded.
  Future<MyShop> updateMyProfile({
    String? shopName,
    String? handle,
    String? description,
    String? logoUrl,
  }) async {
    final json = await _api.patch<Map<String, dynamic>>(
      '/sellers/me',
      body: {
        if (shopName != null) 'shopName': shopName,
        if (handle != null) 'handle': handle,
        if (description != null) 'description': description,
        if (logoUrl != null) 'logoUrl': logoUrl,
      },
    );
    return MyShop.fromJson(json);
  }

  /// Uploads a logo image and returns where it landed. `/uploads/image`, not the social feed's
  /// `/uploads/media` -- a shop logo is never a video, and the image-only route carries its own,
  /// smaller size limit tuned for a logo rather than a feed photo.
  Future<String> uploadLogo(File file) async {
    final raw = await _api.postMultipart<Map<String, dynamic>>(
      '/uploads/image',
      FormData.fromMap({
        'file': await MultipartFile.fromFile(
          file.path,
          filename: file.path.split(Platform.pathSeparator).last,
        ),
      }),
    );
    return raw['url'] as String;
  }

  /// Clears the logo. A separate call rather than `updateMyProfile(logoUrl: ...)`, whose omitted
  /// fields are left untouched on purpose -- there is no string that means "clear this" through
  /// that guard, only one that means "leave it". This sends an explicit JSON `null`, which
  /// `UpdateSellerDto`'s `@IsOptional()` accepts and Prisma writes as a real NULL, not `''`.
  Future<MyShop> removeLogo() async {
    final json = await _api.patch<Map<String, dynamic>>(
      '/sellers/me',
      body: {'logoUrl': null},
    );
    return MyShop.fromJson(json);
  }
}
