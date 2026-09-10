import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:video_player/video_player.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/format/money.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/remote_image.dart';
import '../domain/social_post.dart';
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
              },
              itemBuilder: (_, index) => _PostPage(post: feed.posts[index]),
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

class _PostPage extends ConsumerWidget {
  const _PostPage({required this.post});
  final SocialPost post;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isMedia = post.kind != SocialPostKind.text && post.mediaUrl != null;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        gradient: isMedia
            ? LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  theme.colorScheme.surfaceContainerHighest,
                  Colors.black87,
                ],
              )
            : null,
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (isMedia && post.kind == SocialPostKind.photo)
            RemoteImage(
              url: post.mediaUrl,
              width: double.infinity,
              height: double.infinity,
              borderRadius: 0,
              fallbackIcon: post.kind == SocialPostKind.video
                  ? Icons.play_circle_outline_rounded
                  : Icons.image_outlined,
            ),
          if (post.kind == SocialPostKind.video && post.mediaUrl != null)
            _FeedVideo(url: post.mediaUrl!),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.center,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, Color(0xCE000000)],
                stops: [.35, 1],
              ),
            ),
          ),
          Positioned(
            right: 14,
            bottom: AppShell.contentBottomInset + 122,
            child: _ActionRail(post: post),
          ),
          Positioned(
            left: 18,
            right: 78,
            bottom: AppShell.contentBottomInset + 18,
            child: _PostMeta(post: post),
          ),
        ],
      ),
    );
  }
}

/// Keeps player lifecycle inside one page. [PageView] disposes off-screen pages, so an inactive
/// feed never keeps five videos decoding in the background.
class _FeedVideo extends StatefulWidget {
  const _FeedVideo({required this.url});
  final String url;
  @override
  State<_FeedVideo> createState() => _FeedVideoState();
}

class _FeedVideoState extends State<_FeedVideo> {
  late final VideoPlayerController _controller;
  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url))
      ..setLooping(true)
      ..initialize()
          .then((_) {
            if (mounted) {
              _controller.play();
              setState(() {});
            }
          })
          .catchError((_) {});
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _controller.value.isInitialized
      ? GestureDetector(
          onTap: () => setState(
            () => _controller.value.isPlaying
                ? _controller.pause()
                : _controller.play(),
          ),
          child: FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: _controller.value.size.width,
              height: _controller.value.size.height,
              child: VideoPlayer(_controller),
            ),
          ),
        )
      : const Center(
          child: Icon(
            Icons.play_circle_outline_rounded,
            color: Colors.white,
            size: 58,
          ),
        );
}

class _PostMeta extends StatelessWidget {
  const _PostMeta({required this.post});
  final SocialPost post;
  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 16,
              backgroundColor: Colors.white24,
              backgroundImage: post.authorAvatarUrl == null
                  ? null
                  : NetworkImage(post.authorAvatarUrl!),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Text(
                post.authorName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        if (post.text != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(
              post.text!,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, height: 1.32),
            ),
          ),
        if (post.product != null)
          Padding(
            padding: const EdgeInsets.only(top: 13),
            child: Semantics(
              button: true,
              label: strings.get('feed.openProduct'),
              child: InkWell(
                onTap: () =>
                    context.push('/gallery/product/${post.product!.id}'),
                borderRadius: BorderRadius.circular(16),
                child: _ProductTag(product: post.product!),
              ),
            ),
          ),
      ],
    );
  }
}

class _ProductTag extends StatelessWidget {
  const _ProductTag({required this.product});
  final TaggedProduct product;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(8),
    decoration: BoxDecoration(
      color: const Color(0xEFFFFFFF),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        RemoteImage(
          url: product.imageUrl,
          width: 46,
          height: 46,
          borderRadius: 11,
          fallbackIcon: Icons.shopping_bag_outlined,
        ),
        const SizedBox(width: 9),
        Flexible(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                product.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Color(0xFF161320),
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                Money.tmt(product.priceTmt, Strings.of(context).locale),
                style: const TextStyle(
                  color: AppTheme.brand,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
        const Icon(Icons.chevron_right_rounded, color: Color(0xFF161320)),
      ],
    ),
  );
}

class _ActionRail extends ConsumerWidget {
  const _ActionRail({required this.post});
  final SocialPost post;
  Future<void> _toggle(WidgetRef ref, bool like) async {
    final repository = ref.read(socialFeedRepositoryProvider);
    // Optimism makes a lightweight reaction feel immediate. A failed mutation gets the feed
    // invalidated, rather than silently leaving an invented local truth on screen.
    try {
      await (like ? repository.toggleLike(post) : repository.toggleSave(post));
    } finally {
      ref.invalidate(socialFeedProvider);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _RailButton(
          icon: post.likedByMe
              ? Icons.favorite_rounded
              : Icons.favorite_border_rounded,
          label: '${post.likeCount}',
          selected: post.likedByMe,
          tooltip: strings.get('feed.like'),
          onTap: () => _toggle(ref, true),
        ),
        const SizedBox(height: 14),
        _RailButton(
          icon: post.savedByMe
              ? Icons.bookmark_rounded
              : Icons.bookmark_border_rounded,
          label: strings.get('feed.save'),
          selected: post.savedByMe,
          tooltip: strings.get('feed.save'),
          onTap: () => _toggle(ref, false),
        ),
        const SizedBox(height: 14),
        _RailButton(
          icon: Icons.flag_outlined,
          label: strings.get('feed.report'),
          tooltip: strings.get('feed.report'),
          onTap: () => _report(context, ref),
        ),
      ],
    );
  }

  Future<void> _report(BuildContext context, WidgetRef ref) async {
    final reason = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => _ReportSheet(),
    );
    if (reason == null || !context.mounted) return;
    await ref.read(socialFeedRepositoryProvider).report(post.id, reason);
  }
}

class _RailButton extends StatelessWidget {
  const _RailButton({
    required this.icon,
    required this.label,
    required this.tooltip,
    required this.onTap,
    this.selected = false,
  });
  final IconData icon;
  final String label;
  final String tooltip;
  final VoidCallback onTap;
  final bool selected;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: tooltip,
    child: Column(
      children: [
        IconButton.filledTonal(
          onPressed: onTap,
          tooltip: tooltip,
          icon: Icon(icon, color: selected ? Colors.pinkAccent : null),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            shadows: [Shadow(blurRadius: 6)],
          ),
        ),
      ],
    ),
  );
}

class _ReportSheet extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final reasons = ['spam', 'misleading_product', 'inappropriate'];
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              strings.get('feed.reportTitle'),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            for (final reason in reasons)
              ListTile(
                title: Text(strings.get('feed.report.$reason')),
                onTap: () => Navigator.pop(context, reason),
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
