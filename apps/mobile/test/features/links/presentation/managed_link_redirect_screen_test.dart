import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/config/app_config.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/core/network/external_links.dart';
import 'package:gulyaly_mobile/features/links/data/managed_link_repository.dart';
import 'package:gulyaly_mobile/features/links/presentation/managed_link_redirect_screen.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements ManagedLinkRepository {}

class _ExternalLinks extends Mock implements ExternalLinks {}

class _FakeBuildContext extends Fake implements BuildContext {}

const _config = AppConfig(
  environment: AppEnvironment.production,
  apiBaseUrl: 'https://api.gulyaly.pro/api',
  siteBaseUrl: 'https://gulyaly.pro',
  connectTimeout: Duration(seconds: 15),
  receiveTimeout: Duration(seconds: 30),
);

Future<void> _open(
  WidgetTester t, {
  required ManagedLinkRepository repo,
  ExternalLinks? externalLinks,
}) async {
  final router = GoRouter(
    initialLocation: '/l/leto2026',
    routes: [
      GoRoute(
        path: '/l/:slug',
        builder: (_, state) =>
            ManagedLinkRedirectScreen(slug: state.pathParameters['slug']!),
      ),
      GoRoute(
        path: '/gallery/product/:id',
        builder: (_, state) =>
            Scaffold(body: Text('product:${state.pathParameters['id']}')),
      ),
      GoRoute(
        path: '/home',
        builder: (_, __) => const Scaffold(body: Text('home')),
      ),
    ],
  );
  await t.pumpWidget(
    ProviderScope(
      overrides: [
        managedLinkRepositoryProvider.overrideWithValue(repo),
        appConfigProvider.overrideWithValue(_config),
        if (externalLinks != null)
          externalLinksProvider.overrideWithValue(externalLinks),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        builder: (context, child) =>
            StringsScope(strings: const Strings('ru'), child: child!),
      ),
    ),
  );
  await t.pumpAndSettle();
}

void main() {
  setUpAll(() => registerFallbackValue(_FakeBuildContext()));

  testWidgets('a link to this app\'s own product opens it in-app', (t) async {
    final repo = _Repository();
    when(
      () => repo.resolveTargetUrl('leto2026'),
    ).thenAnswer((_) async => 'https://gulyaly.pro/gallery/product/p1');

    await _open(t, repo: repo);

    expect(find.text('product:p1'), findsOneWidget);
  });

  testWidgets('anything else opens the way an outside link always does', (
    t,
  ) async {
    final repo = _Repository();
    when(
      () => repo.resolveTargetUrl('leto2026'),
    ).thenAnswer((_) async => 'https://vk.com/some-promo-post');
    final external = _ExternalLinks();
    when(() => external.open(any(), any())).thenAnswer((_) async => true);

    await _open(t, repo: repo, externalLinks: external);

    verify(
      () => external.open(any(), 'https://vk.com/some-promo-post'),
    ).called(1);
    // Nothing of the app's own to land on afterwards but home.
    expect(find.text('home'), findsOneWidget);
  });

  testWidgets(
    'a link nobody made, or one that was turned off, says so plainly',
    (t) async {
      final repo = _Repository();
      when(() => repo.resolveTargetUrl('leto2026')).thenThrow(Exception('404'));

      await _open(t, repo: repo);

      expect(
        find.text('Эта ссылка недействительна или больше не активна'),
        findsOneWidget,
      );

      await t.tap(find.text('На главную'));
      await t.pumpAndSettle();

      expect(find.text('home'), findsOneWidget);
    },
  );
}
