import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:video_player/video_player.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/format/money.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/media/video_cache.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/remote_image.dart';
import '../../seller/presentation/shop_screen.dart';
import '../domain/social_post.dart';
import 'my_posts_screen.dart';
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
                _prefetchAround(feed.posts, index);
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

/// Caches the next couple of videos.
///
/// Two, not ten: a feed opened and abandoned after one post should not have spent someone's data
/// on eight videos they never saw. Failures are ignored by design -- an uncached video streams.
void _prefetchAround(List<SocialPost> posts, int index) {
  for (var i = index + 1; i <= index + 2 && i < posts.length; i++) {
    final post = posts[i];
    if (post.kind != SocialPostKind.video) continue;
    final url = post.mediaUrl;
    if (url != null) VideoCache.instance.prefetch(url);
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
          // IgnorePointer, because a childless DecoratedBox answers a hit test itself: this
          // decoration covers the whole page and was quietly eating every tap meant for the
          // video under it, which is why tap-to-pause did nothing anywhere. It darkens the
          // bottom so the rail and the caption stay readable; it was never meant to be touched.
          const IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.center,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Color(0xCE000000)],
                  stops: [.35, 1],
                ),
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

class _FeedVideoState extends State<_FeedVideo> with WidgetsBindingObserver {
  /// Null until the cache has been asked whether it holds this video. Everything that touches it
  /// reads it into a local first -- the answer arrives asynchronously, and a tap or a tab switch
  /// can land before it does.
  VideoPlayerController? _controller;

  /// Mirrors `_controller.value.isPlaying`, updated only when it actually flips. The controller
  /// notifies on every position tick — rebuilding the video surface dozens of times a second to
  /// redraw one icon would be the most expensive thing on this screen.
  bool _playing = false;

  /// Set when the person taps to pause, so returning to the tab resumes what was playing and
  /// leaves paused what they chose to stop.
  bool _pausedByUser = false;

  /// Whether this branch of the bottom navigation is the one on screen.
  bool _onScreen = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_open());
  }

  /// Plays the cached file when there is one, and streams otherwise.
  ///
  /// The check is a single stat on a path, so the wait before the first frame is not measurable;
  /// what it saves is the whole download, every time this video is watched again. Nothing is
  /// downloaded here -- the feed prefetches ahead (see `_prefetchAround`), so a video reached by
  /// swiping is usually already a file by the time this runs.
  Future<void> _open() async {
    final file = await VideoCache.instance.cached(widget.url);
    if (!mounted) return;
    final controller = file != null
        ? VideoPlayerController.file(file)
        : VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _controller = controller;
    unawaited(controller.setLooping(true));
    controller.addListener(_syncPlaying);
    try {
      await controller.initialize();
    } catch (_) {
      return;
    }
    // Disposed while the file was opening: this widget's own dispose ran before the controller
    // existed, so nothing else will ever let go of it.
    if (!mounted) {
      controller.removeListener(_syncPlaying);
      await controller.dispose();
      return;
    }
    if (_onScreen && !_pausedByUser) unawaited(controller.play());
    setState(() {});
  }

  void _syncPlaying() {
    final playing = _controller?.value.isPlaying ?? false;
    if (playing == _playing || !mounted) return;
    setState(() => _playing = playing);
  }

  /// go_router wraps every inactive branch of `StatefulShellRoute.indexedStack` in a disabled
  /// [TickerMode], so this is the signal that the feed left the screen for another tab. Without
  /// it the branch stays alive and the video keeps playing under Home or Chats, heard but not
  /// seen — `dispose` never runs, because nothing was disposed.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final onScreen = TickerMode.of(context);
    if (onScreen == _onScreen) return;
    _onScreen = onScreen;
    final controller = _controller;
    if (!onScreen) {
      controller?.pause();
    } else if (!_pausedByUser &&
        controller != null &&
        controller.value.isInitialized) {
      controller.play();
    }
  }

  /// Leaving the app entirely is the same situation as leaving the tab: sound continuing out of a
  /// backgrounded app is the version of this people notice fastest.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null) return;
    if (state == AppLifecycleState.resumed) {
      if (_onScreen && !_pausedByUser && controller.value.isInitialized) {
        controller.play();
      }
    } else {
      controller.pause();
    }
  }

  void _toggle() {
    final controller = _controller;
    if (controller == null) return;
    if (controller.value.isPlaying) {
      _pausedByUser = true;
      controller.pause();
    } else {
      _pausedByUser = false;
      controller.play();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.removeListener(_syncPlaying);
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return const Center(
        child: Icon(
          Icons.play_circle_outline_rounded,
          color: Colors.white,
          size: 58,
        ),
      );
    }
    final strings = Strings.of(context);
    return GestureDetector(
      // Opaque, not the default deferToChild. The only thing under the finger across most of this
      // page is the video surface -- a Texture, which does not take part in hit testing at all --
      // so a GestureDetector that defers to its child received nothing over the video itself and
      // the tap-to-pause simply did not happen anywhere it mattered.
      behavior: HitTestBehavior.opaque,
      onTap: _toggle,
      child: Stack(
        fit: StackFit.expand,
        children: [
          FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: controller.value.size.width,
              height: controller.value.size.height,
              child: VideoPlayer(controller),
            ),
          ),
          // A paused video is otherwise indistinguishable from a still photo, and the tap that
          // resumes it is invisible until you happen to try. The mark appears only while paused,
          // so it never sits on top of something being watched.
          if (!_playing)
            Center(
              child: Semantics(
                button: true,
                label: strings.get('feed.play'),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: const BoxDecoration(
                    color: Color(0x66000000),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.play_arrow_rounded,
                    color: Colors.white,
                    size: 54,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
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
            // The way out of the feed and into the shop. Present only when the server sent a
            // handle, which it does only for a shop that is open -- a button leading to a page
            // that refuses to load is worse than no button. Without this, someone could watch a
            // seller's video, want what was in it, and have nowhere to go.
            if (post.shop != null)
              Semantics(
                button: true,
                label: strings.get('feed.openShop'),
                child: InkWell(
                  onTap: () =>
                      context.push(ShopScreen.pathFor(post.shop!.handle)),
                  borderRadius: BorderRadius.circular(999),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0x33FFFFFF),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: const Color(0x55FFFFFF)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.storefront_outlined,
                          size: 15,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          strings.get('feed.openShop'),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
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
  Future<void> _toggle(WidgetRef ref, bool like) {
    final feed = ref.read(socialFeedProvider.notifier);
    return like ? feed.toggleLike(post) : feed.toggleSave(post);
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
          // Short on purpose: the label sets the rail's width, and the rail sits over the video.
          // The tooltip and the screen-reader label keep the full wording.
          label: strings.get('feed.report.short'),
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

  /// Wide enough for the icon button and a short word under it, and fixed so that it stays that
  /// wide. A [Column] takes the width of its widest child, so before this the longest label --
  /// "Пожаловаться", and longer still in Turkmen -- set the width of the whole rail and pushed
  /// every icon away from the edge and towards the middle of the video. Translated text must not
  /// be able to move the layout.
  static const _width = 72.0;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: tooltip,
    child: SizedBox(
      width: _width,
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
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              shadows: [Shadow(blurRadius: 6)],
            ),
          ),
        ],
      ),
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
