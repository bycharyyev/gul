import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/format/dates.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../domain/chat_models.dart';
import 'chat_inbox_screen.dart';
import 'group_info_screen.dart';
import 'official_chat_label.dart';

/// One conversation, whichever kind it is.
///
/// A group room and a seller or support thread render identically because to the person reading
/// them they are the same thing. The id's prefix picks the endpoints; nothing here branches on it.
class ChatRoomScreen extends ConsumerStatefulWidget {
  const ChatRoomScreen({super.key, required this.conversationId});

  static const pathSegment = 'c';

  final String conversationId;

  @override
  ConsumerState<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

class _ChatRoomScreenState extends ConsumerState<ChatRoomScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;
  Timer? _refreshTimer;
  bool _refreshing = false;

  Future<void> _refreshVisibleRoom() async {
    if (!mounted ||
        _refreshing ||
        WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed ||
        ModalRoute.of(context)?.isCurrent != true) {
      return;
    }
    _refreshing = true;
    try {
      ref.invalidate(chatMessagesProvider(widget.conversationId));
      await ref.read(chatMessagesProvider(widget.conversationId).future);
      if (!mounted) return;
      await ref.read(chatRepositoryProvider).markRead(widget.conversationId);
      if (!mounted) return;
      ref.invalidate(chatUnreadProvider);
      ref.invalidate(chatInboxProvider);
    } catch (_) {
      // Keep the conversation readable; the provider exposes retry on a failed fetch.
    } finally {
      _refreshing = false;
    }
  }

  @override
  void initState() {
    super.initState();
    _refreshTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      unawaited(_refreshVisibleRoom());
    });
    // Opening a conversation is reading it. Fire-and-forget: a failed mark-read leaves the badge
    // up a little longer, which is not worth an error in front of somebody mid-sentence.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await ref
          .read(chatRepositoryProvider)
          .markRead(widget.conversationId)
          .catchError((_) {});
      if (mounted) {
        ref.invalidate(chatUnreadProvider);
        ref.invalidate(chatInboxProvider);
      }
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _input.text.trim();
    if (body.isEmpty || _sending) return;
    final strings = Strings.of(context);
    setState(() => _sending = true);
    try {
      await ref.read(chatRepositoryProvider).send(widget.conversationId, body);
      _input.clear();
      ref.invalidate(chatMessagesProvider(widget.conversationId));
      ref.invalidate(chatInboxProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e is AppException ? strings.error(e) : strings.get('err.unknown'),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final myId = ref.watch(authControllerProvider).user?.id;
    final view = ref.watch(chatMessagesProvider(widget.conversationId));

    final isGroup = view.valueOrNull?.kind == ChatKind.group;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              view.valueOrNull?.title.trim().isNotEmpty == true
                  ? view.value!.title
                  : strings.get('chat.support'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            if (view.valueOrNull?.officialCategory != null)
              OfficialChatLabel(category: view.value!.officialCategory!),
          ],
        ),
        actions: [
          // Only a group has anything to show here. A conversation with a shop has exactly two
          // sides, and an icon that opened a list of them would be a control that does nothing.
          if (isGroup)
            IconButton(
              tooltip: strings.get('chat.members'),
              onPressed: () => context.push(
                '${ChatInboxScreen.path}/${GroupInfoScreen.pathSegment}/${widget.conversationId.split(':').last}',
              ),
              icon: const Icon(Icons.group_outlined),
            ),
        ],
      ),
      body: Column(
        children: [
          if (view.valueOrNull?.officialCategory ==
              ChatOfficialCategory.security)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: Text(
                strings.get('chat.securityHint'),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          Expanded(
            child: AsyncView<ChatRoomView>(
              value: view,
              onRetry: () =>
                  ref.invalidate(chatMessagesProvider(widget.conversationId)),
              skeleton: const Center(child: CircularProgressIndicator()),
              isEmpty: (room) => room.messages.isEmpty,
              empty: Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(
                    strings.get('chat.roomEmpty'),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
              data: (room) => ListView.builder(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                itemCount: room.messages.length,
                itemBuilder: (context, i) =>
                    _Bubble(message: room.messages[i], myUserId: myId),
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: view.valueOrNull?.canPost == false
                // A channel somebody follows. The note replaces the composer rather than showing a
                // disabled one: a greyed-out field invites tapping to find out why.
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    child: Text(
                      strings.get('chat.readOnly'),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12.5,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  )
                : Padding(
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _input,
                            minLines: 1,
                            maxLines: 4,
                            maxLength: 2000,
                            textInputAction: TextInputAction.send,
                            onSubmitted: (_) => _send(),
                            decoration: InputDecoration(
                              hintText: strings.get('chat.inputHint'),
                              counterText: '',
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          onPressed: _sending ? null : _send,
                          icon: _sending
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.send_rounded),
                          tooltip: strings.get('chat.send'),
                        ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.myUserId});

  final ChatMessage message;
  final String? myUserId;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final mine = message.isMine(myUserId);

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.78,
        ),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
        decoration: BoxDecoration(
          color: mine ? scheme.primary : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(mine ? 14 : 4),
            bottomRight: Radius.circular(mine ? 4 : 14),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Who said it, but only in a conversation where that can be ambiguous — repeating the
            // seller's name above every one of their messages is noise in a two-party thread.
            if (!mine && message.author.name.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(
                  message.author.name,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: scheme.primary,
                  ),
                ),
              ),
            Text(
              message.body,
              style: TextStyle(
                fontSize: 14.5,
                height: 1.35,
                color: mine ? scheme.onPrimary : scheme.onSurface,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              Dates.dateTime(message.createdAt.toLocal(), strings.locale),
              style: TextStyle(
                fontSize: 10.5,
                color: (mine ? scheme.onPrimary : scheme.onSurfaceVariant)
                    .withValues(alpha: 0.75),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
