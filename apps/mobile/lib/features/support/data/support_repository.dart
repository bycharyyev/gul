import '../../../core/network/api_client.dart';
import '../domain/support_message.dart';

class SupportRepository {
  const SupportRepository(this._api);

  final ApiClient _api;

  /// The whole conversation, every time.
  ///
  /// There is no `?sinceMessageId=` and no websocket or SSE (GAP 7), so each poll re-downloads
  /// the full thread. Fine while a thread is a handful of messages; it is the reason polling is
  /// paced at 15 seconds and stops the moment the screen is not in front of the user.
  ///
  /// Fetching also has a **side effect**: the server marks staff and seller messages as read by
  /// the customer. Polling in the background would therefore mark messages read that nobody has
  /// seen — another reason the poll is tied to the visible screen.
  Future<SupportThread> loadThread() async {
    final json = await _api.get<Map<String, dynamic>>('/support/thread');
    return SupportThread.fromJson(json);
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
