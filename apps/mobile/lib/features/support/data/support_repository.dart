import '../../../core/network/api_client.dart';
import '../../../core/network/message_merge.dart';
import '../domain/support_message.dart';

class SupportRepository {
  const SupportRepository(this._api);

  final ApiClient _api;

  /// The conversation: the whole thread without [after], or with it (the id of the last message
  /// the server sent) only the newer messages, flagged `incremental`. The caller adds those to
  /// what it already shows -- see SupportController.
  ///
  /// Fetching also has a **side effect**: the server marks staff and seller messages as read by
  /// the customer (only when something new from them arrived). Polling in the background would
  /// therefore mark messages read that nobody has seen, which is why the poll is tied to the
  /// visible screen.
  Future<({SupportThread thread, bool incremental})> loadThread({
    String? after,
  }) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/support/thread${afterQuery(after)}',
    );
    return (
      thread: SupportThread.fromJson(json),
      incremental: json['incremental'] == true,
    );
  }

  /// Sends one message. `@Length(1, 2000)` server-side.
  Future<SupportMessage> send(String body) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/support/thread/messages',
      body: {'body': body},
    );
    return SupportMessage.fromJson(json);
  }
}
