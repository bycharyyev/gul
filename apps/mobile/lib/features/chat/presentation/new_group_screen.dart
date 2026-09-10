import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import 'chat_inbox_screen.dart';
import 'group_info_screen.dart';

/// One field and one button.
///
/// A group is made before anybody is in it, so this asks for the only thing that cannot be
/// decided later. Members arrive by link from the next screen — which is why creating lands
/// there rather than in an empty conversation with nobody to read it.
class NewGroupScreen extends ConsumerStatefulWidget {
  const NewGroupScreen({super.key});

  static const pathSegment = 'new';

  @override
  ConsumerState<NewGroupScreen> createState() => _NewGroupScreenState();
}

class _NewGroupScreenState extends ConsumerState<NewGroupScreen> {
  final _title = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final title = _title.text.trim();
    if (title.isEmpty || _busy) return;
    final strings = Strings.of(context);
    setState(() => _busy = true);
    try {
      final made = await ref.read(chatRepositoryProvider).createGroup(title);
      ref.invalidate(chatInboxProvider);
      if (!mounted) return;
      final groupId = made.conversationId.split(':').last;
      // Replaces rather than stacks: going back from the invite screen should return to the
      // inbox, not to a form that would make a second group with the same name.
      context.pushReplacement(
        '${ChatInboxScreen.path}/${GroupInfoScreen.pathSegment}/$groupId',
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e is AppException ? strings.error(e) : strings.get('err.unknown'),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('chat.newGroup'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
        children: [
          TextField(
            controller: _title,
            autofocus: true,
            maxLength: 120,
            textCapitalization: TextCapitalization.sentences,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _create(),
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: strings.get('chat.groupName'),
              prefixIcon: const Icon(Icons.groups_rounded),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _busy || _title.text.trim().isEmpty ? null : _create,
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(strings.get('chat.create')),
          ),
        ],
      ),
    );
  }
}
