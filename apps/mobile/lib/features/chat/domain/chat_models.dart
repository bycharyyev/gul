/// What kind of conversation a row is. The app renders all three the same way; the kind only
/// decides the icon and, for the platform thread, where its name comes from.
enum ChatKind { group, channel, seller, support }

/// Only server-assigned categories confer an official identity; titles never do.
enum ChatOfficialCategory { news, promotions, security }

ChatOfficialCategory? _officialFrom(String? raw) => switch (raw) {
  'NEWS' => ChatOfficialCategory.news,
  'PROMOTIONS' => ChatOfficialCategory.promotions,
  'SECURITY' => ChatOfficialCategory.security,
  _ => null,
};

ChatKind _kindFrom(String? raw) => switch (raw) {
  'GROUP' => ChatKind.group,
  'CHANNEL' => ChatKind.channel,
  'SELLER' => ChatKind.seller,
  _ => ChatKind.support,
};

/// One row of the inbox.
///
/// [id] carries its own routing: `room:<id>` for a group, `thread:<id>` for a support or seller
/// conversation. The app never branches on storage -- it passes the id back and the API resolves
/// it. That is deliberate: the two shapes exist on the server for historical reasons and must not
/// leak into screens.
class ChatConversation {
  const ChatConversation({
    required this.id,
    required this.kind,
    required this.title,
    required this.lastMessage,
    required this.lastMessageAt,
    required this.unreadCount,
    this.officialCategory,
  });

  final String id;
  final ChatKind kind;

  /// Empty for the platform support conversation, which has no counterparty to name. The screen
  /// supplies its own wording rather than the server hardcoding a language.
  final String title;
  final String? lastMessage;
  final DateTime lastMessageAt;
  final int unreadCount;
  final ChatOfficialCategory? officialCategory;

  bool get isRoom => id.startsWith('room:');

  /// The bare id, without the routing prefix.
  String get rawId => id.substring(id.indexOf(':') + 1);

  factory ChatConversation.fromJson(Map<String, dynamic> json) =>
      ChatConversation(
        id: json['id'] as String? ?? '',
        kind: _kindFrom(json['kind'] as String?),
        title: json['title'] as String? ?? '',
        lastMessage: json['lastMessage'] as String?,
        lastMessageAt:
            DateTime.tryParse(json['lastMessageAt'] as String? ?? '') ??
            DateTime.now(),
        unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
        officialCategory: _officialFrom(json['officialCategory'] as String?),
      );
}

class ChatAuthor {
  const ChatAuthor({required this.id, required this.name});

  final String id;
  final String name;

  factory ChatAuthor.fromJson(Map<String, dynamic>? json) => ChatAuthor(
    id: json?['id'] as String? ?? '',
    name: (json?['fullName'] as String?)?.trim().isNotEmpty == true
        ? (json!['fullName'] as String).trim()
        : (json?['username'] as String? ?? ''),
  );
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.body,
    required this.createdAt,
    required this.authorId,
    required this.author,
  });

  final String id;
  final String body;
  final DateTime createdAt;

  /// Null for a message written by staff on the platform thread, which has no app account behind
  /// it. The bubble sides itself on this, so null must mean "not mine" rather than crash.
  final String? authorId;
  final ChatAuthor author;

  bool isMine(String? myUserId) => authorId != null && authorId == myUserId;

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
    id: json['id'] as String? ?? '',
    body: json['body'] as String? ?? '',
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    authorId: json['authorId'] as String?,
    author: ChatAuthor.fromJson(json['author'] as Map<String, dynamic>?),
  );
}

class ChatRoomView {
  const ChatRoomView({
    required this.title,
    required this.kind,
    required this.messages,
    required this.canPost,
    this.officialCategory,
  });

  final String title;

  /// Decides whether the conversation offers a members screen. Only a group has one; a thread
  /// with a shop has exactly two sides and nothing to show about them.
  final ChatKind kind;
  final List<ChatMessage> messages;

  /// Whether this person may write here. False in a channel they only follow. The server refuses
  /// either way -- this exists so nobody types a message that was never going to be accepted.
  final bool canPost;
  final ChatOfficialCategory? officialCategory;

  factory ChatRoomView.fromJson(Map<String, dynamic> json) {
    final room = json['room'] as Map<String, dynamic>?;
    return ChatRoomView(
      title: room?['title'] as String? ?? '',
      kind: _kindFrom(room?['kind'] as String?),
      // Defaults to true: an older server that does not send the flag had no channels either.
      canPost: room?['canPost'] as bool? ?? true,
      officialCategory: _officialFrom(room?['officialCategory'] as String?),
      messages: ((json['messages'] as List<dynamic>?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ChatMessage.fromJson)
          .toList(),
    );
  }
}

/// A channel somebody could follow, as the discovery list shows it.
class ChatChannel {
  const ChatChannel({
    required this.id,
    required this.title,
    required this.description,
    required this.shopName,
    required this.subscriberCount,
    required this.subscribed,
    this.officialCategory,
  });

  final String id;
  final String title;
  final String? description;
  final String? shopName;
  final int subscriberCount;
  final bool subscribed;
  final ChatOfficialCategory? officialCategory;

  /// The id the conversation screen takes. A channel is a room like any other once you are in it.
  String get conversationId => 'room:$id';

  factory ChatChannel.fromJson(Map<String, dynamic> json) => ChatChannel(
    id: json['id'] as String? ?? '',
    title: json['title'] as String? ?? '',
    description: json['description'] as String?,
    shopName: json['shopName'] as String?,
    subscriberCount: (json['subscriberCount'] as num?)?.toInt() ?? 0,
    subscribed: json['subscribed'] as bool? ?? false,
    officialCategory: _officialFrom(json['officialCategory'] as String?),
  );
}

/// A group as its own members see it: who is in it, and the link that brings in one more.
class ChatGroupInfo {
  const ChatGroupInfo({
    required this.id,
    required this.title,
    required this.isOwner,
    required this.inviteCode,
    required this.members,
  });

  final String id;
  final String title;

  /// Only the owner may reset the link or close the group. Everybody may share it.
  final bool isOwner;
  final String? inviteCode;
  final List<ChatGroupMember> members;

  factory ChatGroupInfo.fromJson(Map<String, dynamic> json) => ChatGroupInfo(
    id: json['id'] as String? ?? '',
    title: json['title'] as String? ?? '',
    isOwner: json['isOwner'] as bool? ?? false,
    inviteCode: json['inviteCode'] as String?,
    members: ((json['members'] as List<dynamic>?) ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ChatGroupMember.fromJson)
        .toList(),
  );
}

class ChatGroupMember {
  const ChatGroupMember({
    required this.id,
    required this.name,
    required this.avatarPath,
    required this.isOwner,
  });

  final String id;
  final String name;
  final String? avatarPath;
  final bool isOwner;

  factory ChatGroupMember.fromJson(Map<String, dynamic> json) =>
      ChatGroupMember(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        avatarPath: json['avatarPath'] as String?,
        isOwner: json['isOwner'] as bool? ?? false,
      );
}

/// What an invite link shows before somebody commits to joining: a name and a size, nothing else.
class ChatInvitePreview {
  const ChatInvitePreview({
    required this.title,
    required this.memberCount,
    required this.alreadyMember,
    required this.conversationId,
  });

  final String title;
  final int memberCount;

  /// True when this link leads somewhere this person already is. The screen then opens the group
  /// instead of offering to join it a second time.
  final bool alreadyMember;
  final String conversationId;

  factory ChatInvitePreview.fromJson(Map<String, dynamic> json) =>
      ChatInvitePreview(
        title: json['title'] as String? ?? '',
        memberCount: (json['memberCount'] as num?)?.toInt() ?? 0,
        alreadyMember: json['alreadyMember'] as bool? ?? false,
        conversationId: json['conversationId'] as String? ?? '',
      );
}
