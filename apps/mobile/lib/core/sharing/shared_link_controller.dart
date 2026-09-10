import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'shared_text.dart';

/// A link the customer sent into the app from somewhere else, waiting to be acted on.
///
/// Holding it in state rather than navigating from the channel callback is what makes the
/// sequence survive the parts we do not control: a share can arrive before sign-in, before the
/// router exists, or while a completely different screen is open. Whoever is ready first reads
/// it, and clearing is explicit, so a link is used once and never replays on the next resume.
class SharedLinkController extends StateNotifier<String?> {
  SharedLinkController(this._channel) : super(null) {
    _start();
  }

  final SharedTextChannel _channel;
  StreamSubscription<String>? _subscription;

  Future<void> _start() async {
    final launchedWith = await _channel.takePending();
    if (!mounted) return;
    _offer(launchedWith);
    _subscription = _channel.stream.listen(_offer);
  }

  void _offer(String? text) {
    if (text == null) return;
    final url = firstUrlIn(text);
    // Shared text with no address in it is somebody using the share sheet for something else.
    // Opening a buying form over that would be worse than doing nothing.
    if (url == null) return;
    state = url;
  }

  /// Called by whoever acted on the link. Not automatic: the screen that consumes it decides when
  /// it has actually been handled.
  void clear() => state = null;

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
