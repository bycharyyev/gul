import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/widgets/async_view.dart';
import 'post_page_view.dart';
import 'social_feed_controller.dart';

/// A shop's own posts, opened from its grid -- the same swipeable full-screen reader the discover
/// feed uses, just scoped to one shop and starting wherever the visitor tapped.
///
/// Shares [shopFeedControllerProvider] with the grid it was opened from rather than fetching its
/// own copy: the family key is the shop handle, so Riverpod hands back the posts already on
/// screen instead of a second, possibly different, round trip.
class ShopPostsScreen extends ConsumerStatefulWidget {
  const ShopPostsScreen({
    super.key,
    required this.handle,
    required this.initialIndex,
  });
  final String handle;
  final int initialIndex;

  @override
  ConsumerState<ShopPostsScreen> createState() => _ShopPostsScreenState();
}

class _ShopPostsScreenState extends ConsumerState<ShopPostsScreen> {
  late final _controller = PageController(initialPage: widget.initialIndex);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = shopFeedControllerProvider(widget.handle);
    final feed = ref.watch(provider);
    return Scaffold(
      backgroundColor: Colors.black,
      body: AsyncView<SocialFeedState>(
        value: feed,
        skeleton: const ColoredBox(color: Colors.black),
        data: (state) => Stack(
          children: [
            PageView.builder(
              controller: _controller,
              scrollDirection: Axis.vertical,
              itemCount: state.posts.length,
              onPageChanged: (index) {
                if (index >= state.posts.length - 3) {
                  ref.read(provider.notifier).loadMore();
                }
                prefetchPostsAround(state.posts, index);
              },
              itemBuilder: (_, index) {
                final post = state.posts[index];
                final notifier = ref.read(provider.notifier);
                return PostPageView(
                  post: post,
                  onToggleLike: () => notifier.toggleLike(post),
                  onToggleSave: () => notifier.toggleSave(post),
                );
              },
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                child: IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.arrow_back_rounded),
                  color: Colors.white,
                  style: IconButton.styleFrom(
                    backgroundColor: const Color(0x33000000),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
