import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/network/api_client.dart';
import 'package:gulyaly_mobile/features/seller/data/seller_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

final _row = <String, dynamic>{
  'id': 's1',
  'handle': 'altyn',
  'shopName': 'Altyn Ay',
  'description': 'Букеты и подарки',
  'logoUrl': 'https://open.s3.regru.cloud/uploads/logo.jpg',
  'isEnabled': true,
};

void main() {
  late _Api api;
  late SellerRepository repository;

  setUpAll(() => registerFallbackValue(FormData()));

  setUp(() {
    api = _Api();
    repository = SellerRepository(api);
  });

  test('reads the signed-in seller from /sellers/me', () async {
    when(
      () => api.get<Map<String, dynamic>>('/sellers/me'),
    ).thenAnswer((_) async => _row);

    final shop = await repository.getMyProfile();

    expect(shop.handle, 'altyn');
    expect(shop.shopName, 'Altyn Ay');
    expect(shop.logoUrl, 'https://open.s3.regru.cloud/uploads/logo.jpg');
    expect(shop.isEnabled, isTrue);
  });

  test('sends only the fields that actually changed', () async {
    // The server's UpdateSellerDto treats every field as optional and leaves an omitted one
    // exactly as it was -- so editing only the description must not resend a logo, a handle, or
    // anything else that would otherwise silently overwrite something nobody touched.
    when(
      () => api.patch<Map<String, dynamic>>(
        '/sellers/me',
        body: any(named: 'body'),
      ),
    ).thenAnswer((_) async => _row);

    await repository.updateMyProfile(description: 'Новое описание');

    final body =
        verify(
              () => api.patch<Map<String, dynamic>>(
                '/sellers/me',
                body: captureAny(named: 'body'),
              ),
            ).captured.single
            as Map<String, dynamic>;
    expect(body, {'description': 'Новое описание'});
  });

  test('sends a real JSON null to clear the logo, not an omitted field', () async {
    // Omitting logoUrl means "leave it"; only an explicit null means "clear it". Reusing
    // updateMyProfile's omit-when-null guard for removal would never be able to say the second
    // thing at all.
    when(
      () => api.patch<Map<String, dynamic>>(
        '/sellers/me',
        body: any(named: 'body'),
      ),
    ).thenAnswer((_) async => {..._row, 'logoUrl': null});

    final shop = await repository.removeLogo();

    final body =
        verify(
              () => api.patch<Map<String, dynamic>>(
                '/sellers/me',
                body: captureAny(named: 'body'),
              ),
            ).captured.single
            as Map<String, dynamic>;
    expect(body, {'logoUrl': null});
    expect(shop.logoUrl, isNull);
  });

  test('uploads a logo through the image-only route and returns its URL', () async {
    final dir = await Directory.systemTemp.createTemp('logo-test');
    final file = File('${dir.path}/logo.jpg')
      ..writeAsBytesSync([0, 1, 2, 3]);
    addTearDown(() => dir.delete(recursive: true));

    when(
      () => api.postMultipart<Map<String, dynamic>>(any(), any()),
    ).thenAnswer((_) async => {'url': 'https://open.s3.regru.cloud/uploads/new.jpg'});

    final url = await repository.uploadLogo(file);

    expect(url, 'https://open.s3.regru.cloud/uploads/new.jpg');
    final path =
        verify(
          () => api.postMultipart<Map<String, dynamic>>(
            captureAny(),
            any(),
          ),
        ).captured.single;
    // The image route, not the social feed's media one -- a logo is never a video, and the two
    // routes carry different size limits.
    expect(path, '/uploads/image');
  });
}
