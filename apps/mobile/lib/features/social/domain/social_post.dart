import '../../../core/format/money.dart';

/// A commerce post is deliberately a snapshot. A tagged product can disappear or change price,
/// but a post must keep saying what its author actually showed to people.
class SocialPost {
  const SocialPost({
    required this.id,
    required this.authorName,
    required this.createdAt,
    required this.kind,
    required this.likeCount,
    required this.savedByMe,
    required this.likedByMe,
    required this.isMine,
    this.authorAvatarUrl,
    this.text,
    this.mediaUrl,
    this.product,
    this.status = SocialPostStatus.published,
  });

  final String id;
  final String authorName;
  final String? authorAvatarUrl;
  final DateTime createdAt;
  final SocialPostKind kind;
  final String? text;
  final String? mediaUrl;
  final TaggedProduct? product;
  final int likeCount;
  final bool savedByMe;
  final bool likedByMe;
  final bool isMine;
  final SocialPostStatus status;

  factory SocialPost.fromJson(Map<String, dynamic> json) {
    final author = json['author'] as Map<String, dynamic>?;
    final product = json['product'] as Map<String, dynamic>?;
    return SocialPost(
      id: json['id'] as String,
      authorName: (author?['fullName'] ?? json['authorName'] ?? '') as String,
      authorAvatarUrl: _text(author?['avatarUrl']),
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime(1970),
      kind: SocialPostKind.parse(
        json['mediaType'] as String? ?? json['kind'] as String?,
      ),
      text: _text(json['body'] ?? json['text']),
      mediaUrl: _text(json['mediaUrl']),
      product: product == null
          ? (json['products'] is List && (json['products'] as List).isNotEmpty
                ? TaggedProduct.fromJson(
                    (json['products'] as List).first as Map<String, dynamic>,
                  )
                : null)
          : TaggedProduct.fromJson(product),
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      savedByMe:
          (json['viewer'] as Map<String, dynamic>?)?['saved'] == true ||
          json['savedByMe'] == true,
      likedByMe:
          (json['viewer'] as Map<String, dynamic>?)?['liked'] == true ||
          json['likedByMe'] == true,
      isMine: json['isMine'] == true,
      status: SocialPostStatus.parse(json['status'] as String?),
    );
  }

  SocialPost copyWith({bool? savedByMe, bool? likedByMe, int? likeCount}) =>
      SocialPost(
        id: id,
        authorName: authorName,
        authorAvatarUrl: authorAvatarUrl,
        createdAt: createdAt,
        kind: kind,
        text: text,
        mediaUrl: mediaUrl,
        product: product,
        isMine: isMine,
        status: status,
        savedByMe: savedByMe ?? this.savedByMe,
        likedByMe: likedByMe ?? this.likedByMe,
        likeCount: likeCount ?? this.likeCount,
      );

  static String? _text(Object? value) {
    final text = value is String ? value.trim() : '';
    return text.isEmpty ? null : text;
  }
}

enum SocialPostKind {
  video,
  photo,
  text;

  static SocialPostKind parse(String? raw) => switch (raw) {
    'VIDEO' || 'video' => video,
    'IMAGE' || 'PHOTO' || 'photo' => photo,
    _ => text,
  };
  String get apiValue => switch (this) {
    SocialPostKind.video => 'VIDEO',
    SocialPostKind.photo => 'IMAGE',
    SocialPostKind.text => 'TEXT',
  };
}

enum SocialPostStatus {
  pending,
  rejected,
  draft,
  published,
  hidden;

  static SocialPostStatus parse(String? raw) => switch (raw) {
    'PENDING' => pending,
    'REJECTED' => rejected,
    'DRAFT' => draft,
    'HIDDEN' => hidden,
    _ => published,
  };
}

class TaggedProduct {
  const TaggedProduct({
    required this.id,
    required this.name,
    required this.priceTmt,
    this.imageUrl,
  });
  final String id;
  final String name;
  final double priceTmt;
  final String? imageUrl;
  factory TaggedProduct.fromJson(Map<String, dynamic> json) => TaggedProduct(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    priceTmt: Money.parse(json['priceTmt']),
    imageUrl: json['imageUrl'] as String?,
  );
}

/// One page of the feed, with the point the next page continues from.
///
/// The cursor belongs to the page rather than to a screen's local state because the API's paging
/// is by publication time: a caller that keeps its own idea of "where I got to" would re-serve or
/// skip posts whenever the server's own boundary moved.
class SocialFeedPage {
  const SocialFeedPage({required this.posts, required this.nextCursor});

  final List<SocialPost> posts;

  /// Null when the server says there is nothing after this page.
  final String? nextCursor;

  bool get hasMore => nextCursor != null;
}
