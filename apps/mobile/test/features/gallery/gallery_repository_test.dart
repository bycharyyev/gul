import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/network/api_client.dart';
import 'package:gulyaly_mobile/features/gallery/data/gallery_repository.dart';
import 'package:gulyaly_mobile/features/orders/domain/order.dart';
import 'package:mocktail/mocktail.dart';

class MockApiClient extends Mock implements ApiClient {}

final _product = {
  'id': 'p1',
  'categoryId': 'c1',
  'sellerId': null,
  'sku': 'FLW-001',
  'name': 'Букет роз "Классика"',
  'description': '25 красных роз с оформлением и лентой.',
  'imageUrl': 'https://example.test/rose.png',
  'priceTmt': '350',
  'sortOrder': 1,
  'category': {'id': 'c1', 'name': 'Цветы', 'slug': 'flowers'},
  'seller': null,
};

void main() {
  late MockApiClient api;
  late GalleryRepository repository;

  setUp(() {
    api = MockApiClient();
    repository = GalleryRepository(api);
  });

  group('filters', () {
    test('sends no query parameters when nothing is filtered', () async {
      when(
        () => api.get<List<dynamic>>(
          '/gallery/products',
          query: any(named: 'query'),
        ),
      ).thenAnswer((_) async => [_product]);

      await repository.loadProducts(const GalleryFilter());

      final query =
          verify(
                () => api.get<List<dynamic>>(
                  '/gallery/products',
                  query: captureAny(named: 'query'),
                ),
              ).captured.single
              as Map<String, dynamic>;

      expect(query, isEmpty);
    });

    test('pushes category and search to the server', () async {
      // The endpoint filters and searches server-side (verified live, Cyrillic included).
      // Filtering a downloaded list would work at five products and break at five hundred.
      when(
        () => api.get<List<dynamic>>(
          '/gallery/products',
          query: any(named: 'query'),
        ),
      ).thenAnswer((_) async => [_product]);

      await repository.loadProducts(
        const GalleryFilter(categoryId: 'c1', search: 'роз'),
      );

      final query =
          verify(
                () => api.get<List<dynamic>>(
                  '/gallery/products',
                  query: captureAny(named: 'query'),
                ),
              ).captured.single
              as Map<String, dynamic>;

      expect(query, {'categoryId': 'c1', 'search': 'роз'});
    });

    test('a blank search is not sent as an empty parameter', () async {
      when(
        () => api.get<List<dynamic>>(
          '/gallery/products',
          query: any(named: 'query'),
        ),
      ).thenAnswer((_) async => [_product]);

      await repository.loadProducts(const GalleryFilter(search: '   '));

      final query =
          verify(
                () => api.get<List<dynamic>>(
                  '/gallery/products',
                  query: captureAny(named: 'query'),
                ),
              ).captured.single
              as Map<String, dynamic>;

      expect(query, isEmpty);
    });
  });

  group('parsing', () {
    test('reads the string price and the included relations', () async {
      when(
        () => api.get<List<dynamic>>(
          '/gallery/products',
          query: any(named: 'query'),
        ),
      ).thenAnswer(
        (_) async => [
          {
            ..._product,
            'seller': {
              'id': 's1',
              'handle': 'gulshop',
              'shopName': 'Gül dükany',
            },
          },
        ],
      );

      final product = (await repository.loadProducts(
        const GalleryFilter(),
      )).single;

      expect(product.priceTmt, 350);
      expect(product.categoryName, 'Цветы');
      // shopName is what a customer recognises; handle is the seller's id-ish login.
      expect(product.sellerName, 'Gül dükany');
    });

    test('house stock has no seller', () async {
      when(
        () => api.get<List<dynamic>>(
          '/gallery/products',
          query: any(named: 'query'),
        ),
      ).thenAnswer((_) async => [_product]);

      expect(
        (await repository.loadProducts(
          const GalleryFilter(),
        )).single.sellerName,
        isNull,
      );
    });
  });

  group('loadProduct', () {
    test(
      'finds one in the full list, since there is no detail endpoint',
      () async {
        when(
          () => api.get<List<dynamic>>(
            '/gallery/products',
            query: any(named: 'query'),
          ),
        ).thenAnswer(
          (_) async => [
            _product,
            {..._product, 'id': 'p2', 'name': 'Другой'},
          ],
        );

        expect((await repository.loadProduct('p2'))?.name, 'Другой');
      },
    );

    test(
      'returns null for a product that is gone rather than throwing',
      () async {
        when(
          () => api.get<List<dynamic>>(
            '/gallery/products',
            query: any(named: 'query'),
          ),
        ).thenAnswer((_) async => [_product]);

        expect(await repository.loadProduct('missing'), isNull);
      },
    );
  });

  group('createOrder', () {
    test('sends no price — the server reads it from the product', () async {
      when(
        () => api.post<Map<String, dynamic>>(
          '/gallery/orders',
          body: any(named: 'body'),
        ),
      ).thenAnswer(
        (_) async => {
          'id': 'g1',
          'status': 'PENDING_PAYMENT',
          'amountTmt': '350',
          'recipientName': 'Aýgül',
          'product': _product,
        },
      );

      final order = await repository.createOrder(
        productId: 'p1',
        recipientName: 'Aýgül',
        recipientPhone: '+99361234567',
        deliveryCity: 'Aşgabat',
        deliveryAddress: 'Görogly 12',
        cardMessage: 'Doglan günüň gutly bolsun',
      );

      final body =
          verify(
                () => api.post<Map<String, dynamic>>(
                  '/gallery/orders',
                  body: captureAny(named: 'body'),
                ),
              ).captured.single
              as Map<String, dynamic>;

      // A client that could name its own price is a client that can be told to name zero.
      expect(body.containsKey('amountTmt'), isFalse);
      expect(body.containsKey('priceTmt'), isFalse);
      expect(body.keys.toSet(), {
        'productId',
        'recipientName',
        'recipientPhone',
        'deliveryCity',
        'deliveryAddress',
        'cardMessage',
      });

      expect(order.kind, OrderKind.gallery);
      expect(order.amountTmt, 350);
    });

    test(
      'omits an empty card message rather than sending a blank one',
      () async {
        when(
          () => api.post<Map<String, dynamic>>(
            '/gallery/orders',
            body: any(named: 'body'),
          ),
        ).thenAnswer(
          (_) async => {'id': 'g1', 'status': 'PAID', 'amountTmt': '350'},
        );

        await repository.createOrder(
          productId: 'p1',
          recipientName: 'Aýgül',
          recipientPhone: '+99361234567',
          deliveryCity: 'Aşgabat',
          deliveryAddress: 'Görogly 12',
          cardMessage: '',
        );

        final body =
            verify(
                  () => api.post<Map<String, dynamic>>(
                    '/gallery/orders',
                    body: captureAny(named: 'body'),
                  ),
                ).captured.single
                as Map<String, dynamic>;

        expect(body.containsKey('cardMessage'), isFalse);
      },
    );
  });

  group('GalleryFilter', () {
    test('compares by value, so an identical filter is one cached request', () {
      expect(
        const GalleryFilter(categoryId: 'c1', search: 'a'),
        const GalleryFilter(categoryId: 'c1', search: 'a'),
      );
    });

    test('clearing the category is distinct from leaving it alone', () {
      const filter = GalleryFilter(categoryId: 'c1', search: 'a');
      expect(filter.copyWith(clearCategory: true).categoryId, isNull);
      expect(filter.copyWith(search: 'b').categoryId, 'c1');
    });

    test('knows when nothing is filtered', () {
      expect(const GalleryFilter().isEmpty, isTrue);
      expect(const GalleryFilter(search: 'a').isEmpty, isFalse);
      expect(const GalleryFilter(categoryId: 'c1').isEmpty, isFalse);
    });
  });
}
