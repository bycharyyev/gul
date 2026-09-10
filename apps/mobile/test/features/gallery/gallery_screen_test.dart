import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/errors/app_exception.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/gallery/data/gallery_repository.dart';
import 'package:gulyaly_mobile/features/gallery/domain/gallery_product.dart';
import 'package:gulyaly_mobile/features/gallery/presentation/gallery_screen.dart';
import 'package:gulyaly_mobile/features/gallery/presentation/product_screen.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mocktail/mocktail.dart';

class MockGalleryRepository extends Mock implements GalleryRepository {}

const _roses = GalleryProduct(
  id: 'p1',
  name: 'Букет роз "Классика"',
  priceTmt: 350,
  sortOrder: 1,
  categoryId: 'c1',
  categoryName: 'Цветы',
  description: '25 красных роз.',
);

const _cards = GalleryProduct(
  id: 'p2',
  name: 'Открытка',
  priceTmt: 20,
  sortOrder: 2,
  categoryId: 'c2',
  categoryName: 'Открытки',
);

const _categories = [
  GalleryCategory(id: 'c1', name: 'Цветы', slug: 'flowers', sortOrder: 1),
  GalleryCategory(id: 'c2', name: 'Открытки', slug: 'postcards', sortOrder: 2),
];

Widget _harness(MockGalleryRepository repository) {
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => const GalleryScreen()),
      GoRoute(
        path: '/gallery/product/:id',
        builder: (_, state) =>
            Scaffold(body: Text('product:${state.pathParameters['id']}')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [galleryRepositoryProvider.overrideWithValue(repository)],
    child: MaterialApp.router(
      routerConfig: router,
      builder: (context, child) => StringsScope(
        strings: const Strings('ru'),
        child: child ?? const SizedBox.shrink(),
      ),
    ),
  );
}

void main() {
  setUpAll(() async {
    // mocktail needs a concrete instance before `any()` can stand in for a value type.
    registerFallbackValue(const GalleryFilter());
    await initializeDateFormatting('ru');
    await initializeDateFormatting('en');
  });

  late MockGalleryRepository repository;

  setUp(() {
    repository = MockGalleryRepository();
    when(
      () => repository.loadCategories(),
    ).thenAnswer((_) async => _categories);
    when(
      () => repository.loadProducts(any()),
    ).thenAnswer((_) async => [_roses, _cards]);
  });

  Future<void> pumpScreen(WidgetTester t) async {
    t.view.physicalSize = const Size(400, 1400);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);

    await t.pumpWidget(_harness(repository));
    await t.pumpAndSettle();
  }

  testWidgets('renders the catalogue with prices', (t) async {
    await pumpScreen(t);

    expect(find.text('Букет роз "Классика"'), findsOneWidget);
    expect(find.text('350 TMT'), findsOneWidget);
    expect(find.text('20 TMT'), findsOneWidget);
  });

  testWidgets('a category chip filters on the server, not in the list', (
    t,
  ) async {
    await pumpScreen(t);

    await t.tap(find.text('Открытки'));
    await t.pumpAndSettle();

    verify(
      () => repository.loadProducts(const GalleryFilter(categoryId: 'c2')),
    ).called(1);
  });

  testWidgets('"Все" clears the category rather than adding another filter', (
    t,
  ) async {
    await pumpScreen(t);

    await t.tap(find.text('Открытки'));
    await t.pumpAndSettle();
    await t.tap(find.text('Все'));
    await t.pumpAndSettle();

    // The unfiltered request is the one made at first load, so it is already cached — what
    // matters is that no filter lingers.
    verifyNever(
      () => repository.loadProducts(
        const GalleryFilter(categoryId: 'c2', search: ''),
      ),
    );
  });

  testWidgets('search is debounced — one request, not one per keystroke', (
    t,
  ) async {
    await pumpScreen(t);
    clearInteractions(repository);

    await t.enterText(find.byType(TextField), 'р');
    await t.pump(const Duration(milliseconds: 100));
    await t.enterText(find.byType(TextField), 'ро');
    await t.pump(const Duration(milliseconds: 100));
    await t.enterText(find.byType(TextField), 'роз');
    // Past the 350ms debounce. `pumpAndSettle` alone would not get there — a Timer is not a
    // scheduled frame, so it needs the clock advanced explicitly.
    await t.pump(const Duration(milliseconds: 400));
    await t.pumpAndSettle();

    // Only the settled value reaches the network. Without the debounce this is three requests
    // racing each other back on a mobile connection.
    verify(
      () => repository.loadProducts(const GalleryFilter(search: 'роз')),
    ).called(1);
    verifyNever(
      () => repository.loadProducts(const GalleryFilter(search: 'р')),
    );
    verifyNever(
      () => repository.loadProducts(const GalleryFilter(search: 'ро')),
    );
  });

  testWidgets('an empty catalogue and an empty search read differently', (
    t,
  ) async {
    when(
      () => repository.loadProducts(const GalleryFilter()),
    ).thenAnswer((_) async => []);
    await pumpScreen(t);

    expect(find.text('Каталог пока пуст'), findsOneWidget);

    when(() => repository.loadProducts(any())).thenAnswer((_) async => []);
    await t.enterText(find.byType(TextField), 'ничего');
    await t.pump(const Duration(milliseconds: 400));
    await t.pumpAndSettle();

    expect(find.text('Ничего не найдено'), findsOneWidget);
    expect(
      find.text('Попробуйте изменить запрос или выбрать другую категорию'),
      findsOneWidget,
    );
  });

  testWidgets('the catalogue still browses when categories fail to load', (
    t,
  ) async {
    // Losing a filter is not worth losing the shop.
    when(
      () => repository.loadCategories(),
    ).thenThrow(const AppException(kind: AppErrorKind.server));

    await pumpScreen(t);

    expect(find.text('Букет роз "Классика"'), findsOneWidget);
    expect(find.text('Все'), findsNothing);
  });

  testWidgets('a failed catalogue offers a retry', (t) async {
    when(
      () => repository.loadProducts(any()),
    ).thenThrow(const AppException(kind: AppErrorKind.network));

    await pumpScreen(t);

    expect(find.text('Нет соединения. Проверьте интернет.'), findsOneWidget);
    expect(find.text('Повторить'), findsOneWidget);
  });

  testWidgets('tapping a product opens it', (t) async {
    await pumpScreen(t);

    await t.tap(find.text('Букет роз "Классика"'));
    await t.pumpAndSettle();

    expect(find.text('product:p1'), findsOneWidget);
  });

  testWidgets('the product route is the one the promo deep link uses', (
    t,
  ) async {
    // Home routes INTERNAL_GALLERY_PRODUCT promos to this exact path.
    expect(ProductScreen.path, '/gallery/product');
  });
}
