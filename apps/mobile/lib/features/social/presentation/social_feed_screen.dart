import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import 'my_posts_screen.dart';
import 'post_page_view.dart';
import 'social_feed_controller.dart';

/// A deliberately quiet full-screen shop window. The content gets the whole canvas; controls
/// gather into one right edge rail, so watching and shopping do not fight for attention.
class SocialFeedScreen extends ConsumerWidget {
  const SocialFeedScreen({super.key});
  static const path = '/feed';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final posts = ref.watch(socialFeedProvider);
    return Scaffold(
      body: AsyncView<SocialFeedState>(
        value: posts,
        onRetry: () => ref.read(socialFeedProvider.notifier).refresh(),
        skeleton: const ColoredBox(color: Colors.transparent),
        isEmpty: (feed) => feed.posts.isEmpty,
        empty: _EmptyFeed(onCreate: () => context.push('$path/create')),
        data: (feed) => Stack(
          children: [
            PageView.builder(
              scrollDirection: Axis.vertical,
              itemCount: feed.posts.length,
              // Ask for the next page three posts before the end. A full-screen feed has no
              // scrollbar and no visible bottom, so a request that starts only on the last post
              // shows the customer a dead end for as long as the round trip takes.
              onPageChanged: (index) {
                if (index >= feed.posts.length - 3) {
                  ref.read(socialFeedProvider.notifier).loadMore();
                }
                // Fetch what is about to be swiped into, never what is playing: the current video
                // is already streaming, and downloading it again beside itself would double the
                // data bill for no gain. By the time a finger arrives, the file is on the device.
                prefetchPostsAround(feed.posts, index);
              },
              itemBuilder: (_, index) {
                final post = feed.posts[index];
                final notifier = ref.read(socialFeedProvider.notifier);
                return PostPageView(
                  post: post,
                  onToggleLike: () => notifier.toggleLike(post),
                  onToggleSave: () => notifier.toggleSave(post),
                );
              },
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 12, 12, 0),
                child: Row(
                  children: [
                    Text(
                      strings.get('feed.title'),
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: Colors.white,
                        shadows: const [Shadow(blurRadius: 10)],
                      ),
                    ),
                    const Spacer(),
                    // An author's own posts live behind this, including the ones moderation has
                    // not released yet -- which are invisible everywhere else in the app.
                    IconButton.filledTonal(
                      tooltip: strings.get('feed.mine'),
                      onPressed: () =>
                          context.push('$path/${MyPostsScreen.pathSegment}'),
                      icon: const Icon(Icons.video_library_outlined),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filledTonal(
                      tooltip: strings.get('feed.create'),
                      onPressed: () => context.push('$path/create'),
                      icon: const Icon(Icons.add_rounded),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyFeed extends StatelessWidget {
  const _EmptyFeed({required this.onCreate});
  final VoidCallback onCreate;
  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.auto_awesome_outlined, size: 42),
            const SizedBox(height: 14),
            Text(
              s.get('feed.empty'),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(s.get('feed.emptyHint'), textAlign: TextAlign.center),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: onCreate,
              icon: const Icon(Icons.add_rounded),
              label: Text(s.get('feed.create')),
            ),
          ],
        ),
      ),
    );
  }
}
