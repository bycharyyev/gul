import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import '../domain/chat_models.dart';
import 'chat_inbox_screen.dart';
import 'chat_room_screen.dart';

/// The other end of an invite link.
///
/// Shows what the group is before joining it, rather than joining on arrival: a link arrives
/// forwarded, out of context, and a person who lands in a conversation they did not choose has
/// no way to tell that from an app that went wrong.
class JoinGroupScreen extends ConsumerStatefulWidget {
  const JoinGroupScreen({super.key, this.code});

  static const pathSegment = 'join';

  /// Absent when this was opened from the inbox rather than from a link.
  final String? code;

  @override
  ConsumerState<JoinGroupScreen> createState() => _JoinGroupScreenState();
}

class _JoinGroupScreenState extends ConsumerState<JoinGroupScreen> {
  final _input = TextEditingController();
  ChatInvitePreview? _preview;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final code = widget.code;
    if (code != null && code.isNotEmpty) {
      _input.text = code;
      WidgetsBinding.instance.addPostFrameCallback((_) => _check());
    }
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  /// The code out of whatever was pasted. A person sending an invite sends the whole link, and
  /// asking them to extract the last part of it themselves would be a puzzle, not a step.
  String get _code {
    final raw = _input.text.trim();
    final segments = raw.split(RegExp(r'[/\s?#]+')).where((s) => s.isNotEmpty);
    return segments.isEmpty ? '' : segments.last;
  }

  Future<void> _check() async {
    final code = _code;
    if (code.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final preview = await ref
          .read(chatRepositoryProvider)
          .invitePreview(code);
      if (mounted) setState(() => _preview = preview);
    } catch (e) {
      if (mounted) {
        final strings = Strings.of(context);
        setState(() {
          _preview = null;
          _error = e is AppException
              ? strings.error(e)
              : strings.get('err.unknown');
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _join() async {
    final preview = _preview;
    if (preview == null || _busy) return;
    setState(() => _busy = true);
    try {
      final conversationId = preview.alreadyMember
          ? preview.conversationId
          : await ref.read(chatRepositoryProvider).joinByInvite(_code);
      ref.invalidate(chatInboxProvider);
      ref.invalidate(chatUnreadProvider);
      if (!mounted) return;
      // Replaces this screen: coming back to an invite that has already been accepted would
      // only offer to accept it again.
      context.pushReplacement(
        '${ChatInboxScreen.path}/${ChatRoomScreen.pathSegment}/${Uri.encodeComponent(conversationId)}',
      );
    } catch (e) {
      if (!mounted) return;
      final strings = Strings.of(context);
      setState(() {
        _busy = false;
        _error = e is AppException
            ? strings.error(e)
            : strings.get('err.unknown');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final preview = _preview;

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('chat.joinByLink'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        children: [
          TextField(
            controller: _input,
            autofocus: preview == null,
            textInputAction: TextInputAction.go,
            onSubmitted: (_) => _check(),
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: strings.get('chat.invitePaste'),
              prefixIcon: const Icon(Icons.link_rounded),
            ),
          ),
          const SizedBox(height: 12),
          if (preview == null)
            FilledButton(
              onPressed: _busy || _code.isEmpty ? null : _check,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(strings.get('chat.inviteCheck')),
            ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: scheme.error, fontSize: 13)),
          ],
          if (preview != null) ...[
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 20, 18, 18),
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: scheme.primaryContainer,
                      child: Icon(
                        Icons.groups_rounded,
                        color: scheme.primary,
                        size: 28,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      strings.get('chat.inviteIntro'),
                      style: TextStyle(
                        fontSize: 12.5,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      preview.title,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${preview.memberCount} ${strings.get('chat.inviteMembers')}',
                      style: TextStyle(
                        fontSize: 13,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _busy ? null : _join,
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 15),
                        ),
                        child: Text(
                          // Somebody already in the group gets a door, not a second invitation.
                          strings.get(
                            preview.alreadyMember ? 'chat.open' : 'chat.join',
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
