import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/social/data/social_feed_repository.dart';
import 'package:gulyaly_mobile/features/social/domain/social_post.dart';
import 'package:gulyaly_mobile/features/social/presentation/social_feed_screen.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements SocialFeedRepository {}

final _post = SocialPost(
  id: 'p1',
  authorName: 'Aýgül',
  createdAt: DateTime(2026),
  kind: SocialPostKind.text,
  text: 'Мой любимый чайник',
  likeCount: 12,
  savedByMe: false,
  likedByMe: false,
  isMine: false,
  product: const TaggedProduct(id: 'product-1', name: 'Чайник', priceTmt: 120),
);

void main() {
  testWidgets(
    'feed makes the post, tagged product and safety actions discoverable',
    (t) async {
      final repo = _Repository();
      when(() => repo.loadFeed(cursor: any(named: 'cursor'))).thenAnswer(
        (_) async => const SocialFeedPage(posts: [], nextCursor: null),
      );
      when(() => repo.loadFeed()).thenAnswer(
        (_) async => SocialFeedPage(posts: [_post], nextCursor: null),
      );
      final router = GoRouter(
        routes: [
          GoRoute(path: '/', builder: (_, __) => const SocialFeedScreen()),
          GoRoute(
            path: '/gallery/product/:id',
            builder: (_, __) => const SizedBox(),
          ),
        ],
      );
      await t.pumpWidget(
        ProviderScope(
          overrides: [socialFeedRepositoryProvider.overrideWithValue(repo)],
          child: MaterialApp.router(
            routerConfig: router,
            builder: (context, child) =>
                StringsScope(strings: const Strings('ru'), child: child!),
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('Мой любимый чайник'), findsOneWidget);
      expect(find.text('Чайник'), findsOneWidget);
      expect(find.text('120 TMT'), findsOneWidget);
      expect(find.byTooltip('Пожаловаться'), findsOneWidget);
    },
  );
}
