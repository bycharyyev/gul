import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/remote_image.dart';
import '../../../core/widgets/skeleton.dart';
import '../domain/social_post.dart';

/// Everything this author has published, and everything they have published that nobody else can
/// see yet.
///
/// The second half is the reason this screen exists. A post waiting on moderation, and a post a
/// moderator refused, appear nowhere in the feed — so an author who posted and then saw nothing
/// had no way to tell a queue from a refusal, and no way to fix what was wrong with it.
class MyPostsScreen extends ConsumerWidget {
  const MyPostsScreen({super.key});
  static const pathSegment = 'mine';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final posts = ref.watch(myPostsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(strings.get('feed.mine'))),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myPostsProvider.future),
        child: AsyncView<List<SocialPost>>(
          value: posts,
          skeleton: const _Loading(),
          onRetry: () => ref.invalidate(myPostsProvider),
          isEmpty: (list) => list.isEmpty,
          empty: _Empty(strings: strings),
          data: (list) => ListView.separated(
            // Always scrollable, so pull-to-refresh works on a short list too.
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (_, i) => _MyPostCard(post: list[i]),
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.strings});
  final Strings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(32, 96, 32, 32),
      children: [
        Icon(
          Icons.photo_library_outlined,
          size: 56,
          color: theme.colorScheme.outline,
        ),
        const SizedBox(height: 16),
        Text(
          strings.get('feed.mine.empty'),
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium,
        ),
        const SizedBox(height: 6),
        Text(
          strings.get('feed.mine.emptyHint'),
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.outline,
          ),
        ),
      ],
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) => ListView.separated(
    padding: const EdgeInsets.all(16),
    itemCount: 4,
    separatorBuilder: (_, __) => const SizedBox(height: 12),
    itemBuilder: (_, __) => const Skeleton(height: 104),
  );
}

class _MyPostCard extends ConsumerStatefulWidget {
  const _MyPostCard({required this.post});
  final SocialPost post;
  @override
  ConsumerState<_MyPostCard> createState() => _MyPostCardState();
}

/// The app's FilledButton theme is `Size.fromHeight(54)` -- full width -- for the primary button
/// at the bottom of a page. In a dialog's action row that forces Material to stack the buttons
/// one above the other, and the dialog reads as broken.
final ButtonStyle _dialogButton = FilledButton.styleFrom(
  minimumSize: const Size(0, 44),
  padding: const EdgeInsets.symmetric(horizontal: 20),
);

class _MyPostCardState extends ConsumerState<_MyPostCard> {
  bool _busy = false;

  Future<void> _edit() async {
    final strings = Strings.of(context);
    final controller = TextEditingController(text: widget.post.text ?? '');
    final text = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(strings.get('feed.mine.edit')),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 4,
          decoration: InputDecoration(
            labelText: strings.get('feed.caption'),
            hintText: strings.get('feed.captionHint'),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(strings.get('common.cancel')),
          ),
          FilledButton(
            style: _dialogButton,
            onPressed: () =>
                Navigator.of(dialogContext).pop(controller.text.trim()),
            child: Text(strings.get('common.save')),
          ),
        ],
      ),
    );
    if (text == null || !mounted) return;
    await _run(
      () => ref
          .read(socialFeedRepositoryProvider)
          .updateMine(widget.post.id, body: text),
      // An edited post goes back into the moderation queue — the server decides that, and saying
      // "saved" would leave the author expecting to see it in the feed.
      strings.get('feed.mine.sentToReview'),
    );
  }

  Future<void> _delete() async {
    final strings = Strings.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(strings.get('feed.mine.deleteTitle')),
        content: Text(strings.get('feed.mine.deleteBody')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(strings.get('common.cancel')),
          ),
          FilledButton(
            style: _dialogButton,
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(strings.get('feed.mine.delete')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _run(
      () => ref.read(socialFeedRepositoryProvider).deleteMine(widget.post.id),
      strings.get('feed.mine.deleted'),
    );
  }

  /// One write, one reload, one message. The list is refetched rather than patched in place
  /// because both operations change the post's status on the server, and guessing the new status
  /// here is how a client ends up disagreeing with what moderation actually did.
  ///
  /// The reload is awaited, not fired off with `invalidate`. An edit really does move a post back
  /// into the moderation queue, and the message says so -- so the list has to already show it as
  /// such when the message appears. Merely invalidating left the card reading "Опубликовано"
  /// under a toast that said the opposite, until the person pulled to refresh.
  Future<void> _run(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      await action();
      // ignore: unused_result -- the value is the list; what matters is having waited for it.
      await ref.refresh(myPostsProvider.future);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(done)));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              Strings.of(context).error(
                error is AppException
                    ? error
                    : const AppException(kind: AppErrorKind.unknown),
              ),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = Strings.of(context);
    final post = widget.post;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                RemoteImage(
                  url: post.thumbnailUrl ?? post.mediaUrl,
                  width: 72,
                  height: 72,
                  fallbackIcon: switch (post.kind) {
                    SocialPostKind.video => Icons.play_circle_outline_rounded,
                    SocialPostKind.photo => Icons.image_outlined,
                    SocialPostKind.text => Icons.notes_rounded,
                  },
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _StatusChip(status: post.status),
                      const SizedBox(height: 6),
                      Text(
                        post.text?.isNotEmpty == true
                            ? post.text!
                            : strings.get('feed.kind.${post.kind.name}'),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${post.likeCount} · ${_date(post.createdAt)}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.outline,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            // Only ever shown to the post's own author, which is the only place the API sends it.
            if (post.moderationNote != null) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      strings.get('feed.mine.rejected'),
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onErrorContainer,
                      ),
                    ),
                    Text(
                      post.moderationNote!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onErrorContainer,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            // The server decides what is allowed here. Deriving it from the status on this side is
            // how a button appears for something the API then refuses.
            if (post.canEdit || post.canDelete)
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (post.canEdit)
                    TextButton.icon(
                      onPressed: _busy ? null : _edit,
                      icon: const Icon(Icons.edit_outlined, size: 18),
                      label: Text(strings.get('feed.mine.edit')),
                    ),
                  if (post.canDelete)
                    TextButton.icon(
                      onPressed: _busy ? null : _delete,
                      icon: const Icon(Icons.delete_outline_rounded, size: 18),
                      label: Text(strings.get('feed.mine.delete')),
                      style: TextButton.styleFrom(
                        foregroundColor: theme.colorScheme.error,
                      ),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  static String _date(DateTime value) =>
      '${value.day.toString().padLeft(2, '0')}.'
      '${value.month.toString().padLeft(2, '0')}.${value.year}';
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final SocialPostStatus status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final (background, foreground) = switch (status) {
      SocialPostStatus.published => (
        scheme.secondaryContainer,
        scheme.onSecondaryContainer,
      ),
      SocialPostStatus.rejected || SocialPostStatus.hidden => (
        scheme.errorContainer,
        scheme.onErrorContainer,
      ),
      _ => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        Strings.of(context).get('feed.status.${status.name}'),
        style: theme.textTheme.labelSmall?.copyWith(color: foreground),
      ),
    );
  }
}
