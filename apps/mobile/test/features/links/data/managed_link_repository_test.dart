import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/network/api_client.dart';
import 'package:gulyaly_mobile/features/links/data/managed_link_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  test('resolves a slug to where it points', () async {
    final api = _Api();
    when(
      () => api.get<Map<String, dynamic>>('/managed-links/leto2026'),
    ).thenAnswer(
      (_) async => {
        'id': 'l1',
        'slug': 'leto2026',
        'targetUrl': 'https://gulyaly.pro/gallery/product/p1',
        'isEnabled': true,
        'clickCount': 3,
      },
    );

    final target = await ManagedLinkRepository(
      api,
    ).resolveTargetUrl('leto2026');

    expect(target, 'https://gulyaly.pro/gallery/product/p1');
  });
}
