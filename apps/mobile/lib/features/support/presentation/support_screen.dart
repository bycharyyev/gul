import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/format/dates.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../domain/support_message.dart';
import 'support_controller.dart';

class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key});

  static const path = '/profile/support';

  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen>
    with WidgetsBindingObserver {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Deferred to after the first frame: touching a provider during initState is a build-phase
    // mutation.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final controller = ref.read(supportControllerProvider.notifier);
      controller.load();
      controller.startPolling();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = ref.read(supportControllerProvider.notifier);
    // Polling stops the moment the app leaves the foreground. Two reasons: it is someone's mobile
    // data, and fetching the thread marks staff messages read server-side — doing that while the
    // phone is in a pocket would mark messages read that nobody has seen.
    if (state == AppLifecycleState.resumed) {
      controller.load();
      controller.startPolling();
    } else {
      controller.stopPolling();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    ref.read(supportControllerProvider.notifier).stopPolling();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _input.text;
    if (text.trim().isEmpty) return;

    final sent = await ref.read(supportControllerProvider.notifier).send(text);
    if (!sent || !mounted) return;

    _input.clear();
    // After the new message has been laid out.
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
  }

  void _scrollToBottom() {
    if (!_scroll.hasClients) return;
    _scroll.animateTo(
      _scroll.position.maxScrollExtent,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final state = ref.watch(supportControllerProvider);

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('support.title'))),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(child: _body(context, state, strings)),
            _Composer(
              controller: _input,
              sending: state.sending,
              error: state.sendError,
              onSend: _send,
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context, SupportState state, Strings strings) {
    if (state.loading) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Skeleton(height: 56, borderRadius: 16),
            SizedBox(height: 12),
            Skeleton(height: 76, borderRadius: 16),
            SizedBox(height: 12),
            Skeleton(height: 48, borderRadius: 16),
          ],
        ),
      );
    }

    if (state.error != null) {
      return ErrorState(
        error: state.error!,
        onRetry: () => ref.read(supportControllerProvider.notifier).load(),
      );
    }

    final messages = state.thread?.messages ?? const <SupportMessage>[];
    if (messages.isEmpty) {
      return EmptyState(
        icon: Icons.support_agent_rounded,
        title: strings.get('support.empty'),
        message: strings.get('support.empty.hint'),
      );
    }

    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      itemCount: messages.length,
      itemBuilder: (context, i) => _Bubble(message: messages[i]),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});

  final SupportMessage message;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final mine = message.isMine;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: mine
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        children: [
          Flexible(
            child: Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.sizeOf(context).width * 0.78,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: mine ? scheme.primary : scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  // The squared-off corner points at the sender — side and shape both carry it,
                  // so the two are still distinguishable in grayscale.
                  bottomLeft: Radius.circular(mine ? 16 : 4),
                  bottomRight: Radius.circular(mine ? 4 : 16),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (!mine)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Text(
                        strings.get(
                          message.sender == SupportSender.seller
                              ? 'support.sender.seller'
                              : 'support.sender.staff',
                        ),
                        style: TextStyle(
                          color: scheme.primary,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  Text(
                    message.body,
                    style: TextStyle(
                      color: mine ? scheme.onPrimary : scheme.onSurface,
                      height: 1.35,
                      fontSize: 14.5,
                    ),
                  ),
                  if (message.createdAt != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      Dates.dateTime(message.createdAt!, strings.locale),
                      style: TextStyle(
                        color: mine
                            ? scheme.onPrimary.withValues(alpha: 0.75)
                            : scheme.onSurfaceVariant,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.error,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool sending;
  final Object? error;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Container(
      padding: EdgeInsets.fromLTRB(
        12,
        10,
        12,
        10 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(top: BorderSide(color: scheme.outlineVariant)),
      ),
      child: Column(
        children: [
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Icon(
                    Icons.error_outline_rounded,
                    size: 16,
                    color: scheme.error,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      strings.get('support.sendFailed'),
                      style: TextStyle(color: scheme.error, fontSize: 12.5),
                    ),
                  ),
                ],
              ),
            ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  enabled: !sending,
                  // Grows to five lines then scrolls, so a long message is composable without
                  // the field swallowing the screen.
                  minLines: 1,
                  maxLines: 5,
                  maxLength: 2000, // @Length(1, 2000) server-side
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: strings.get('support.placeholder'),
                    counterText: '',
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 48,
                height: 48,
                child: IconButton.filled(
                  onPressed: sending ? null : onSend,
                  tooltip: strings.get('support.send'),
                  icon: sending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send_rounded, size: 20),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
