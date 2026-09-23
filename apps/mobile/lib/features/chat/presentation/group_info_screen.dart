import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../domain/chat_models.dart';
import 'chat_inbox_screen.dart';

/// A group's members, and the link that brings in one more.
///
/// The link is the first thing on the screen because it is the reason anybody opens this: a
/// group exists to have people in it, and the whole of "adding a friend" is sending them this.
class GroupInfoScreen extends ConsumerWidget {
  const GroupInfoScreen({super.key, required this.groupId});

  static const pathSegment = 'g';

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final info = ref.watch(chatGroupInfoProvider(groupId));

    return Scaffold(
      appBar: AppBar(
        title: Text(info.valueOrNull?.title ?? strings.get('chat.members')),
      ),
      body: AsyncView<ChatGroupInfo>(
        value: info,
        onRetry: () => ref.invalidate(chatGroupInfoProvider(groupId)),
        skeleton: const Center(child: CircularProgressIndicator()),
        data: (group) => _Body(group: group),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.group});

  final ChatGroupInfo group;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;

  String? get _link {
    final code = widget.group.inviteCode;
    if (code == null || code.isEmpty) return null;
    return ref.read(appConfigProvider).groupInviteLink(code);
  }

  void _complain(Object e) {
    if (!mounted) return;
    final strings = Strings.of(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          e is AppException ? strings.error(e) : strings.get('err.unknown'),
        ),
      ),
    );
  }

  Future<void> _share() async {
    final link = _link;
    if (link == null) return;
    final strings = Strings.of(context);
    // The message carries the group's name as well as the address: a bare link in a chat says
    // nothing about what tapping it would join.
    final text = strings
        .get('chat.groupShareText')
        .replaceAll('{title}', widget.group.title)
        .replaceAll('{link}', link);
    await Share.share(text);
  }

  Future<void> _copy() async {
    final link = _link;
    if (link == null) return;
    final strings = Strings.of(context);
    await Clipboard.setData(ClipboardData(text: link));
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(strings.get('chat.linkCopied'))));
  }

  Future<void> _rotate() async {
    final strings = Strings.of(context);
    final ok = await _confirm(
      title: strings.get('chat.resetLink'),
      body: strings.get('chat.resetLinkHint'),
      action: strings.get('chat.resetLink'),
    );
    if (!ok) return;
    setState(() => _busy = true);
    try {
      await ref.read(chatRepositoryProvider).rotateInvite(widget.group.id);
      ref.invalidate(chatGroupInfoProvider(widget.group.id));
    } catch (e) {
      _complain(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _leaveOrDelete() async {
    final strings = Strings.of(context);
    final owner = widget.group.isOwner;
    final ok = await _confirm(
      title: strings.get(owner ? 'chat.deleteGroup' : 'chat.leaveGroup'),
      body: strings
          .get(owner ? 'chat.deleteGroupConfirm' : 'chat.leaveGroupConfirm')
          .replaceAll('{title}', widget.group.title),
      action: strings.get(owner ? 'chat.deleteGroup' : 'chat.leaveGroup'),
      destructive: true,
    );
    if (!ok) return;
    setState(() => _busy = true);
    try {
      final chat = ref.read(chatRepositoryProvider);
      if (owner) {
        await chat.deleteGroup(widget.group.id);
      } else {
        await chat.leaveGroup(widget.group.id);
      }
      ref.invalidate(chatInboxProvider);
      ref.invalidate(chatUnreadProvider);
      if (!mounted) return;
      // Back to the inbox, not to the conversation: whichever of the two just happened, the
      // room behind this screen is gone or no longer readable.
      context.go(ChatInboxScreen.path);
    } catch (e) {
      _complain(e);
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _confirm({
    required String title,
    required String body,
    required String action,
    bool destructive = false,
  }) async {
    final scheme = Theme.of(context).colorScheme;
    final answer = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(Strings.of(context).get('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: destructive
                ? TextButton.styleFrom(foregroundColor: scheme.error)
                : null,
            child: Text(action),
          ),
        ],
      ),
    );
    return answer ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final group = widget.group;
    final link = _link;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        if (link != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    strings.get('chat.inviteLink'),
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Shown in full rather than hidden behind the buttons: somebody reading it
                  // aloud or typing it on another device needs to see the whole thing.
                  SelectableText(
                    link,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.4,
                      fontFamily: 'monospace',
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: _busy ? null : _share,
                          icon: const Icon(Icons.ios_share_rounded, size: 18),
                          label: Text(strings.get('chat.shareInvite')),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : _copy,
                          icon: const Icon(Icons.copy_rounded, size: 18),
                          label: Text(strings.get('chat.copyLink')),
                        ),
                      ),
                    ],
                  ),
                  if (group.isOwner)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: _busy ? null : _rotate,
                        child: Text(strings.get('chat.resetLink')),
                      ),
                    ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 16),
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            '${strings.get('chat.members')} · ${group.members.length}',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
          ),
        ),
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (final member in group.members)
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: scheme.primaryContainer,
                    child: Text(
                      _initial(member.name),
                      style: TextStyle(
                        color: scheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  title: Text(
                    member.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: member.isOwner
                      ? Text(strings.get('chat.owner'))
                      : null,
                ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: _busy ? null : _leaveOrDelete,
          style: OutlinedButton.styleFrom(
            foregroundColor: scheme.error,
            side: BorderSide(color: scheme.error.withValues(alpha: 0.5)),
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          icon: Icon(
            group.isOwner ? Icons.delete_outline_rounded : Icons.logout_rounded,
            size: 18,
          ),
          label: Text(
            strings.get(group.isOwner ? 'chat.deleteGroup' : 'chat.leaveGroup'),
          ),
        ),
      ],
    );
  }

  /// First letter of a name, for an avatar this app has no picture for.
  static String _initial(String name) {
    final trimmed = name.trim();
    return trimmed.isEmpty ? '?' : trimmed.characters.first.toUpperCase();
  }
}
