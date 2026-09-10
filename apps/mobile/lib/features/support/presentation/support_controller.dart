import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_exception.dart';
import '../data/support_repository.dart';
import '../domain/support_message.dart';

class SupportState {
  const SupportState({
    this.thread,
    this.loading = true,
    this.sending = false,
    this.error,
    this.sendError,
  });

  final SupportThread? thread;

  /// True only for the very first load. A poll must not replace the conversation with a spinner.
  final bool loading;

  final bool sending;

  /// A failed load. Cleared as soon as any poll succeeds.
  final AppException? error;

  /// A failed send, kept separate: the conversation is still on screen and readable, only the
  /// outgoing message failed.
  final AppException? sendError;

  SupportState copyWith({
    SupportThread? thread,
    bool? loading,
    bool? sending,
    AppException? error,
    AppException? sendError,
    bool clearError = false,
    bool clearSendError = false,
  }) => SupportState(
    thread: thread ?? this.thread,
    loading: loading ?? this.loading,
    sending: sending ?? this.sending,
    error: clearError ? null : (error ?? this.error),
    sendError: clearSendError ? null : (sendError ?? this.sendError),
  );

  @override
  bool operator ==(Object other) =>
      other is SupportState &&
      other.thread == thread &&
      other.loading == loading &&
      other.sending == sending &&
      other.error == error &&
      other.sendError == sendError;

  @override
  int get hashCode => Object.hash(thread, loading, sending, error, sendError);
}

/// The conversation, kept current by polling.
///
/// Polling rather than a stream because the backend offers no other option (GAP 7). Three rules
/// keep it from being wasteful:
///
/// * it only runs while the screen says so — [startPolling] / [stopPolling] are driven by the
///   screen's lifecycle, so a backgrounded app polls nothing;
/// * a poll never shows a spinner or clears the messages already on screen;
/// * a failed poll is swallowed once the thread has loaded — a dropped packet must not replace a
///   readable conversation with an error page.
class SupportController extends StateNotifier<SupportState> {
  SupportController(this._repository) : super(const SupportState());

  final SupportRepository _repository;

  static const pollInterval = Duration(seconds: 15);

  Timer? _timer;
  bool _inFlight = false;

  Future<void> load() => _fetch(isPoll: false);

  void startPolling() {
    _timer?.cancel();
    _timer = Timer.periodic(pollInterval, (_) => _fetch(isPoll: true));
  }

  void stopPolling() {
    _timer?.cancel();
    _timer = null;
  }

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }

  Future<void> _fetch({required bool isPoll}) async {
    // A slow request must not stack up behind the 15-second timer.
    if (_inFlight) return;
    _inFlight = true;

    try {
      final thread = await _repository.loadThread();
      if (!mounted) return;
      state = state.copyWith(thread: thread, loading: false, clearError: true);
    } on AppException catch (e) {
      if (!mounted) return;
      // Only a *first* load failure is worth an error screen; a failed poll leaves what is
      // already readable alone and tries again in fifteen seconds.
      if (isPoll && state.thread != null) return;
      state = state.copyWith(loading: false, error: e);
    } finally {
      _inFlight = false;
    }
  }

  /// Returns true when the message went out.
  Future<bool> send(String body) async {
    final text = body.trim();
    if (text.isEmpty || state.sending) return false;

    state = state.copyWith(sending: true, clearSendError: true);
    try {
      await _repository.send(text);
      // Refetched rather than appended locally: the server owns ids and timestamps, and a
      // locally-built message would disagree with the next poll.
      await _fetch(isPoll: true);
      if (mounted) state = state.copyWith(sending: false);
      return true;
    } on AppException catch (e) {
      if (mounted) state = state.copyWith(sending: false, sendError: e);
      return false;
    }
  }
}
