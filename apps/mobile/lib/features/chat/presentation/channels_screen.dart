import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../domain/chat_models.dart';
import 'chat_inbox_screen.dart';
import 'chat_room_screen.dart';
import 'official_chat_label.dart';

/// Channels somebody could follow.
///
/// Separate from the inbox because these are conversations you do not have yet. Mixing them into
/// the list of ones you do would put strangers' announcements among your own messages.
class ChannelsScreen extends ConsumerWidget {
  const ChannelsScreen({super.key});

  static const pathSegment = 'channels';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final channels = ref.watch(chatChannelsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('chat.channels'))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(chatChannelsProvider);
          await ref.read(chatChannelsProvider.future);
        },
        child: AsyncView<List<ChatChannel>>(
          value: channels,
          onRetry: () => ref.invalidate(chatChannelsProvider),
          skeleton: const Center(child: CircularProgressIndicator()),
          isEmpty: (list) => list.isEmpty,
          empty: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                strings.get('chat.noChannels'),
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
          data: (list) => ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              12,
              8,
              12,
              AppShell.contentBottomInset,
            ),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, i) => _ChannelTile(channel: list[i]),
          ),
        ),
      ),
    );
  }
}

class _ChannelTile extends ConsumerStatefulWidget {
  const _ChannelTile({required this.channel});

  final ChatChannel channel;

  @override
  ConsumerState<_ChannelTile> createState() => _ChannelTileState();
}

class _ChannelTileState extends ConsumerState<_ChannelTile> {
  bool _busy = false;

  Future<void> _toggle() async {
    final channel = widget.channel;
    final strings = Strings.of(context);
    setState(() => _busy = true);
    try {
      await ref
          .read(chatRepositoryProvider)
          .setSubscribed(channel.id, subscribed: !channel.subscribed);
      // Both lists change: the inbox gains or loses a row, and the badge follows it.
      ref.invalidate(chatChannelsProvider);
      ref.invalidate(chatInboxProvider);
      ref.invalidate(chatUnreadProvider);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e is AppException ? strings.error(e) : strings.get('err.unknown'),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final channel = widget.channel;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: scheme.primaryContainer,
                  child: Icon(Icons.campaign_rounded, color: scheme.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        channel.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        [
                          if (channel.shopName != null) channel.shopName!,
                          '${channel.subscriberCount} ${strings.get('chat.subscribers')}',
                        ].join(' · '),
                        style: TextStyle(
                          fontSize: 12,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                      if (channel.officialCategory != null)
                        OfficialChatLabel(category: channel.officialCategory!),
                    ],
                  ),
                ),
              ],
            ),
            if (channel.description != null) ...[
              const SizedBox(height: 8),
              Text(
                channel.description!,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.35,
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                // Reading comes first for a channel already followed: the point of following was
                // to read it, not to admire the button.
                if (channel.subscribed)
                  Expanded(
                    child: FilledButton.tonal(
                      onPressed: () => context.push(
                        '${ChatInboxScreen.path}/${ChatRoomScreen.pathSegment}/${Uri.encodeComponent(channel.conversationId)}',
                      ),
                      child: Text(strings.get('chat.open')),
                    ),
                  ),
                if (channel.subscribed) const SizedBox(width: 10),
                Expanded(
                  child: channel.subscribed
                      ? OutlinedButton(
                          onPressed: _busy ? null : _toggle,
                          child: Text(strings.get('chat.unsubscribe')),
                        )
                      : FilledButton(
                          onPressed: _busy ? null : _toggle,
                          child: Text(strings.get('chat.subscribe')),
                        ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
