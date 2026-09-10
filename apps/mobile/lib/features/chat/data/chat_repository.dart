import '../../../core/network/api_client.dart';
import '../domain/chat_models.dart';

/// HTTP boundary for conversations.
///
/// One pair of paths per operation, chosen by the id's own prefix. The server addresses a group
/// room and an existing support or seller thread the same way on purpose, so nothing above this
/// class has to know there are two stores behind them.
class ChatRepository {
  const ChatRepository(this._api);

  final ApiClient _api;

  String _base(String conversationId) =>
      conversationId.startsWith('room:') ? '/chat/rooms' : '/chat/threads';

  String _raw(String conversationId) =>
      conversationId.substring(conversationId.indexOf(':') + 1);

  Future<List<ChatConversation>> inbox() async {
    final raw = await _api.get<List<dynamic>>('/chat/inbox');
    return raw
        .whereType<Map<String, dynamic>>()
        .map(ChatConversation.fromJson)
        .toList();
  }

  Future<int> unreadTotal() async {
    final raw = await _api.get<Map<String, dynamic>>('/chat/unread');
    return (raw['unread'] as num?)?.toInt() ?? 0;
  }

  /// The conversation with one shop, created on first use. Returns the id the conversation screen
  /// takes, so the caller never has to know a thread from a room.
  Future<String> conversationWithSeller(String sellerId) async {
    final raw = await _api.post<Map<String, dynamic>>(
      '/chat/with-seller/$sellerId',
      body: const {},
    );
    return raw['conversationId'] as String;
  }

  /// Makes a group and answers with the id the conversation screen takes, plus the code its
  /// share link carries -- both, because the next thing anybody does is send the link.
  Future<({String conversationId, String? inviteCode})> createGroup(
    String title,
  ) async {
    final raw = await _api.post<Map<String, dynamic>>(
      '/chat/groups',
      body: {'title': title},
    );
    return (
      conversationId: raw['conversationId'] as String? ?? '',
      inviteCode: raw['inviteCode'] as String?,
    );
  }

  Future<ChatGroupInfo> groupInfo(String groupId) async {
    final raw = await _api.get<Map<String, dynamic>>('/chat/groups/$groupId');
    return ChatGroupInfo.fromJson(raw);
  }

  Future<String?> rotateInvite(String groupId) async {
    final raw = await _api.post<Map<String, dynamic>>(
      '/chat/groups/$groupId/invite/rotate',
      body: const {},
    );
    return raw['inviteCode'] as String?;
  }

  Future<void> leaveGroup(String groupId) =>
      _api.post<void>('/chat/groups/$groupId/leave', body: const {});

  Future<void> deleteGroup(String groupId) =>
      _api.delete<void>('/chat/groups/$groupId');

  Future<ChatInvitePreview> invitePreview(String code) async {
    final raw = await _api.get<Map<String, dynamic>>('/chat/invites/$code');
    return ChatInvitePreview.fromJson(raw);
  }

  Future<String> joinByInvite(String code) async {
    final raw = await _api.post<Map<String, dynamic>>(
      '/chat/invites/$code/join',
      body: const {},
    );
    return raw['conversationId'] as String? ?? '';
  }

  Future<List<ChatChannel>> channels() async {
    final raw = await _api.get<List<dynamic>>('/chat/channels');
    return raw
        .whereType<Map<String, dynamic>>()
        .map(ChatChannel.fromJson)
        .toList();
  }

  Future<void> setSubscribed(String channelId, {required bool subscribed}) =>
      _api.post<void>(
        '/chat/channels/$channelId/${subscribed ? 'subscribe' : 'unsubscribe'}',
        body: const {},
      );

  Future<ChatRoomView> messages(String conversationId) async {
    final raw = await _api.get<Map<String, dynamic>>(
      '${_base(conversationId)}/${_raw(conversationId)}/messages',
    );
    return ChatRoomView.fromJson(raw);
  }

  Future<void> send(String conversationId, String body) => _api.post<void>(
    '${_base(conversationId)}/${_raw(conversationId)}/messages',
    body: {'body': body},
  );

  /// Marking read is fire-and-forget from the screen's point of view: a failure means the badge
  /// stays up a little longer, which is not worth an error in front of somebody reading a chat.
  Future<void> markRead(String conversationId) => _api.post<void>(
    '${_base(conversationId)}/${_raw(conversationId)}/read',
    body: const {},
  );
}
