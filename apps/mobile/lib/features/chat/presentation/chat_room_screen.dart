import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
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
  ChatAttachment? _attachment;
  bool _uploading = false;
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
    // A photo on its own is a message; an empty box with nothing attached is not.
    if ((body.isEmpty && _attachment == null) || _sending) return;
    final strings = Strings.of(context);
    setState(() => _sending = true);
    try {
      await ref
          .read(chatRepositoryProvider)
          .send(widget.conversationId, body, attachment: _attachment);
      _input.clear();
      if (mounted) setState(() => _attachment = null);
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

  /// Picks a photo or a video and uploads it, leaving it pending until the message is sent.
  Future<void> _attach({required bool video}) async {
    if (_uploading || _sending) return;
    final strings = Strings.of(context);
    final picker = ImagePicker();
    final picked = video
        ? await picker.pickVideo(source: ImageSource.gallery)
        : await picker.pickImage(source: ImageSource.gallery);
    if (picked == null) return;
    setState(() => _uploading = true);
    try {
      final uploaded = await ref
          .read(chatRepositoryProvider)
          .uploadAttachment(File(picked.path));
      if (mounted) setState(() => _attachment = uploaded);
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
      if (mounted) setState(() => _uploading = false);
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
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_attachment != null)
                          _PendingAttachment(
                            attachment: _attachment!,
                            onRemove: () => setState(() => _attachment = null),
                          ),
                        Row(
                      children: [
                        IconButton(
                          onPressed: _uploading || _sending
                              ? null
                              : () => showModalBottomSheet<void>(
                                  context: context,
                                  builder: (sheet) => SafeArea(
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        ListTile(
                                          leading: const Icon(Icons.photo_outlined),
                                          title: Text(strings.get('chat.attachPhoto')),
                                          onTap: () {
                                            Navigator.of(sheet).pop();
                                            unawaited(_attach(video: false));
                                          },
                                        ),
                                        ListTile(
                                          leading: const Icon(Icons.videocam_outlined),
                                          title: Text(strings.get('chat.attachVideo')),
                                          onTap: () {
                                            Navigator.of(sheet).pop();
                                            unawaited(_attach(video: true));
                                          },
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                          icon: _uploading
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.attach_file_rounded),
                          tooltip: strings.get('chat.attach'),
                        ),
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
            if (message.body.isNotEmpty)
              Text(
                message.body,
                style: TextStyle(
                  fontSize: 14.5,
                  height: 1.35,
                  color: mine ? scheme.onPrimary : scheme.onSurface,
                ),
              ),
            if (message.attachment != null)
              Padding(
                padding: EdgeInsets.only(top: message.body.isEmpty ? 0 : 6),
                child: _AttachmentView(
                  attachment: message.attachment!,
                  mine: mine,
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

/// Human-readable size, so a file row says what it costs to open.
String _formatBytes(int size) {
  if (size >= 1024 * 1024) {
    return '${(size / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  return '${(size / 1024).clamp(1, double.infinity).round()} KB';
}

/// A sent attachment inside a bubble: a picture shows itself, anything else is a named row.
class _AttachmentView extends StatelessWidget {
  const _AttachmentView({required this.attachment, required this.mine});

  final ChatAttachment attachment;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    if (attachment.isImage) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Image.network(
          attachment.url,
          fit: BoxFit.cover,
          // A broken or still-loading picture must not collapse the bubble to nothing.
          errorBuilder: (_, _, _) => _FileRow(attachment: attachment, mine: mine),
        ),
      );
    }
    return _FileRow(attachment: attachment, mine: mine);
  }
}

class _FileRow extends StatelessWidget {
  const _FileRow({required this.attachment, required this.mine});

  final ChatAttachment attachment;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final onColor = mine ? scheme.onPrimary : scheme.onSurface;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: (mine ? scheme.onPrimary : scheme.onSurface).withValues(
          alpha: 0.08,
        ),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            attachment.isVideo
                ? Icons.videocam_outlined
                : Icons.insert_drive_file_outlined,
            size: 18,
            color: onColor,
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              attachment.name,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13, color: onColor),
            ),
          ),
          if (attachment.size > 0) ...[
            const SizedBox(width: 8),
            Text(
              _formatBytes(attachment.size),
              style: TextStyle(
                fontSize: 11,
                color: onColor.withValues(alpha: 0.7),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The file picked but not yet sent, shown above the composer with a way to drop it.
class _PendingAttachment extends StatelessWidget {
  const _PendingAttachment({required this.attachment, required this.onRemove});

  final ChatAttachment attachment;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.fromLTRB(10, 6, 4, 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(
            attachment.isImage
                ? Icons.photo_outlined
                : attachment.isVideo
                ? Icons.videocam_outlined
                : Icons.insert_drive_file_outlined,
            size: 18,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              attachment.name,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13),
            ),
          ),
          Text(
            _formatBytes(attachment.size),
            style: TextStyle(
              fontSize: 11,
              color: scheme.onSurfaceVariant,
            ),
          ),
          IconButton(
            onPressed: onRemove,
            icon: const Icon(Icons.close_rounded, size: 18),
            tooltip: MaterialLocalizations.of(context).cancelButtonLabel,
          ),
        ],
      ),
    );
  }
}
