import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/format/dates.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../domain/chat_models.dart';
import 'channels_screen.dart';
import 'chat_room_screen.dart';
import 'join_group_screen.dart';
import 'new_group_screen.dart';
import 'official_chat_label.dart';

/// Every conversation this person is in: groups, sellers and support, in one list.
///
/// One list rather than tabs per kind. A person looking for "the message about my bouquet" does
/// not know or care whether it lives in a group or a seller thread, and splitting it would make
/// them look in two places.
class ChatInboxScreen extends ConsumerStatefulWidget {
  const ChatInboxScreen({super.key});

  static const path = '/chats';

  @override
  ConsumerState<ChatInboxScreen> createState() => _ChatInboxScreenState();
}

class _ChatInboxScreenState extends ConsumerState<ChatInboxScreen> {
  String _query = '';
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final inbox = ref.watch(chatInboxProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.get('chat.title')),
        actions: [
          IconButton(
            tooltip: strings.get('chat.channels'),
            onPressed: () => context.push(
              '${ChatInboxScreen.path}/${ChannelsScreen.pathSegment}',
            ),
            icon: const Icon(Icons.campaign_outlined),
          ),
          // Two ways in behind one control: making a group and answering somebody else's link
          // are the same intention from the person's side -- "put me in a group with them".
          IconButton(
            tooltip: strings.get('chat.newGroup'),
            onPressed: () => _showGroupActions(context, strings),
            icon: const Icon(Icons.add_circle_outline_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(chatUnreadProvider);
          ref.invalidate(chatInboxProvider);
          await ref.read(chatInboxProvider.future);
        },
        child: AsyncView<List<ChatConversation>>(
          value: inbox,
          onRetry: () => ref.invalidate(chatInboxProvider),
          skeleton: const _InboxSkeleton(),
          isEmpty: (list) => list.isEmpty,
          empty: _EmptyInbox(),
          data: (list) {
            final visible = list.where((item) {
              final title = item.title.isEmpty
                  ? strings.get('chat.support')
                  : item.title;
              final matchesQuery = '$title ${item.lastMessage ?? ''}'
                  .toLowerCase()
                  .contains(_query);
              return matchesQuery &&
                  switch (_filter) {
                    'unread' => item.unreadCount > 0,
                    'official' => item.officialCategory != null,
                    'groups' => item.kind == ChatKind.group,
                    _ => true,
                  };
            }).toList();
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(
                12,
                8,
                12,
                AppShell.contentBottomInset,
              ),
              children: [
                TextField(
                  onChanged: (value) =>
                      setState(() => _query = value.trim().toLowerCase()),
                  decoration: InputDecoration(
                    hintText: strings.get('chat.search'),
                    prefixIcon: const Icon(Icons.search_rounded),
                  ),
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final filter in [
                        'all',
                        'unread',
                        'official',
                        'groups',
                      ])
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(strings.get('chat.$filter')),
                            selected: _filter == filter,
                            onSelected: (_) => setState(() => _filter = filter),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                if (visible.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      strings.get('chat.noMatches'),
                      textAlign: TextAlign.center,
                    ),
                  ),
                for (final conversation in visible)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _ConversationTile(conversation: conversation),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// The sheet behind the plus button.
///
/// A sheet rather than two more icons in the bar: these are occasional actions, and a row of
/// four icons above a list of conversations would make the list harder to read every day to
/// save one tap on the days somebody starts a group.
Future<void> _showGroupActions(BuildContext context, Strings strings) async {
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.groups_rounded),
            title: Text(strings.get('chat.newGroup')),
            onTap: () {
              Navigator.of(sheetContext).pop();
              context.push(
                '${ChatInboxScreen.path}/${NewGroupScreen.pathSegment}',
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.link_rounded),
            title: Text(strings.get('chat.joinByLink')),
            onTap: () {
              Navigator.of(sheetContext).pop();
              context.push(
                '${ChatInboxScreen.path}/${JoinGroupScreen.pathSegment}',
              );
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conversation});

  final ChatConversation conversation;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    // Support has no counterparty to name, so the app supplies the word rather than the server
    // hardcoding one language into the database.
    final title = conversation.title.trim().isNotEmpty
        ? conversation.title
        : strings.get('chat.support');
    final unread = conversation.unreadCount;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: ListTile(
        onTap: () => context.push(
          '${ChatInboxScreen.path}/${ChatRoomScreen.pathSegment}/${Uri.encodeComponent(conversation.id)}',
        ),
        leading: CircleAvatar(
          backgroundColor: scheme.primaryContainer,
          child: Icon(switch (conversation.kind) {
            ChatKind.group => Icons.groups_rounded,
            ChatKind.channel => Icons.campaign_rounded,
            ChatKind.seller => Icons.storefront_rounded,
            ChatKind.support => Icons.support_agent_rounded,
          }, color: scheme.primary),
        ),
        title: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontWeight: unread > 0 ? FontWeight.w700 : FontWeight.w600,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (conversation.officialCategory != null)
              OfficialChatLabel(category: conversation.officialCategory!),
            Text(
              conversation.lastMessage ?? strings.get('chat.noMessages'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              Dates.dateTime(
                conversation.lastMessageAt.toLocal(),
                strings.locale,
              ),
              style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
            ),
            if (unread > 0) ...[
              const SizedBox(height: 4),
              // A count, not a dot: "three unread" and "thirty unread" are different decisions
              // about whether to open it now.
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: scheme.primary,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  unread > 99 ? '99+' : '$unread',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: scheme.onPrimary,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmptyInbox extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.forum_outlined,
              size: 44,
              color: scheme.onSurfaceVariant,
            ),
            const SizedBox(height: 12),
            Text(
              strings.get('chat.emptyTitle'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(
              strings.get('chat.emptyBody'),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

/// Rows in the shape the real list will take, so the layout does not jump when it arrives.
class _InboxSkeleton extends StatelessWidget {
  const _InboxSkeleton();

  @override
  Widget build(BuildContext context) => ListView.separated(
    padding: const EdgeInsets.fromLTRB(12, 8, 12, AppShell.contentBottomInset),
    itemCount: 5,
    separatorBuilder: (_, __) => const SizedBox(height: 8),
    itemBuilder: (_, __) => const Card(
      child: ListTile(
        leading: CircleAvatar(),
        title: SizedBox(height: 12),
        subtitle: SizedBox(height: 10),
      ),
    ),
  );
}
