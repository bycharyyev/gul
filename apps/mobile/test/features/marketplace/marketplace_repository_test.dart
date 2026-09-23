import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/network/api_client.dart';
import 'package:gulyaly_mobile/features/marketplace/data/marketplace_repository.dart';
import 'package:gulyaly_mobile/features/marketplace/domain/marketplace_cart.dart';
import 'package:gulyaly_mobile/features/marketplace/domain/marketplace_models.dart';
import 'package:mocktail/mocktail.dart';

class MockApiClient extends Mock implements ApiClient {}

void main() {
  test('only accepts public-shaped HTTPS marketplace links', () {
    expect(isSafeMarketplaceUrl('https://example.com/item/1'), isTrue);
    expect(isSafeMarketplaceUrl('http://example.com/item/1'), isFalse);
    expect(isSafeMarketplaceUrl('https://user:pass@example.com/x'), isFalse);
    expect(isSafeMarketplaceUrl('https://localhost/x'), isFalse);
    expect(isSafeMarketplaceUrl('https://127.0.0.1/x'), isFalse);
    expect(isSafeMarketplaceUrl('https://169.254.169.254/x'), isFalse);
    expect(isSafeMarketplaceUrl('intent://example.com/x'), isFalse);
  });

  test('resolve calls the resolve endpoint, not the sources listing', () async {
    // The previous version POSTed to `/sources`, which is a GET listing of marketplaces and does
    // not accept a body -- the preview had never actually worked against the real API.
    final api = MockApiClient();
    when(
      () => api.post<Map<String, dynamic>>(
        MarketplaceEndpoints.resolve,
        body: any(named: 'body'),
      ),
    ).thenAnswer(
      (_) async => {
        'sourceCode': 'OZON',
        'sourceName': 'Ozon',
        'canonicalUrl': 'https://www.ozon.ru/product/ssd-1798256734/',
        'externalId': '1798256734',
        'isProductPage': true,
        'requiresManualReview': true,
      },
    );

    final preview = await MarketplaceRepository(
      api,
    ).resolve('https://www.ozon.ru/product/ssd-1798256734/?utm_source=tg');

    expect(preview.sourceName, 'Ozon');
    expect(preview.externalId, '1798256734');
    expect(preview.isProductPage, isTrue);
  });

  test(
    'create sends exactly the fields CreateMarketplacePurchaseDto declares',
    () async {
      // The API runs ValidationPipe with `forbidNonWhitelisted`, so an extra field is a 400 before
      // any business logic runs. The old body sent expectedTotalTmt/maxAuthorizedTmt/
      // priceChangeConsent -- none of them declared -- and omitted the required idempotencyKey.
      final api = MockApiClient();
      when(
        () => api.post<Map<String, dynamic>>(
          MarketplaceEndpoints.orders,
          body: any(named: 'body'),
        ),
      ).thenAnswer((_) async => _orderJson());

      const preview = MarketplaceLinkPreview(
        sourceCode: 'OZON',
        sourceName: 'Ozon',
        canonicalUrl: 'https://www.ozon.ru/product/ssd-1798256734/',
        externalId: '1798256734',
        isProductPage: true,
        requiresManualReview: true,
      );

      await MarketplaceRepository(api).create(
        items: const [
          MarketplaceCartItem(
            preview: preview,
            quantity: 2,
            variant: 'blue / M',
          ),
        ],
        currency: 'RUB',
        deliveryAddress: 'Ashgabat',
        idempotencyKey: 'mobile-buy-123456',
      );

      final body =
          verify(
                () => api.post<Map<String, dynamic>>(
                  MarketplaceEndpoints.orders,
                  body: captureAny(named: 'body'),
                ),
              ).captured.single
              as Map<String, dynamic>;

      expect(body.keys.toSet(), {
        'items',
        'currency',
        'deliveryAddress',
        'idempotencyKey',
      });
      final item = (body['items'] as List).single as Map<String, dynamic>;
      // sourceCode is required by the DTO and used to be missing entirely.
      expect(item['sourceCode'], 'OZON');
      expect(item['url'], 'https://www.ozon.ru/product/ssd-1798256734/');
      expect(item['quantity'], 2);
      expect(item['variant'], 'blue / M');
    },
  );

  group('cart', () {
    const preview = MarketplaceLinkPreview(
      sourceCode: 'OZON',
      sourceName: 'Ozon',
      canonicalUrl: 'https://www.ozon.ru/product/ssd-1798256734/',
      externalId: '1798256734',
      isProductPage: true,
      requiresManualReview: true,
    );

    test(
      'adding the same product twice raises its quantity, not its line count',
      () {
        final cart = MarketplaceCart()
          ..add(preview, quantity: 2)
          ..add(preview);

        expect(cart.state, hasLength(1));
        expect(cart.state.single.quantity, 3);
      },
    );

    test('the same product in a different variant is its own line', () {
      final cart = MarketplaceCart()
        ..add(preview, variant: 'blue')
        ..add(preview, variant: 'red');

      expect(cart.state, hasLength(2));
    });

    test('quantity stays within the range the API accepts', () {
      final cart = MarketplaceCart()..add(preview);
      cart.setQuantity(0, 0);
      expect(cart.state.single.quantity, 1);
      cart.setQuantity(0, 500);
      expect(cart.state.single.quantity, 99);
    });
  });
}

Map<String, dynamic> _orderJson() => {
  'id': 'mp1',
  'status': 'MANUAL_REVIEW',
  'expectedTotalTmt': '0',
  'maxAuthorizedTmt': '0',
  'currency': 'RUB',
  'deliveryAddress': 'Ashgabat',
  'items': <dynamic>[],
  'events': <dynamic>[],
  'createdAt': '2026-09-08T10:00:00Z',
};
