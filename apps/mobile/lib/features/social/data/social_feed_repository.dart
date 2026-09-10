import 'dart:io';

import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/social_post.dart';

/// HTTP boundary for the discover feed. The API owns ranking and moderation; the app never
/// reorders a downloaded feed or invents a locally "popular" result.
class SocialFeedRepository {
  const SocialFeedRepository(this._api);
  final ApiClient _api;

  /// One page, plus where the next one starts.
  ///
  /// The cursor is returned rather than dropped: the API pages this feed and a caller that
  /// discards the cursor can only ever show the first twelve posts, which is what the screen
  /// used to do. `nextCursor` is null when the server has nothing further.
  Future<SocialFeedPage> loadFeed({String? cursor}) async {
    final raw = await _api.get<Map<String, dynamic>>(
      '/social-feed/for-you',
      query: {if (cursor != null) 'cursor': cursor},
    );
    final items = raw['items'] as List<dynamic>? ?? const [];
    return SocialFeedPage(
      posts: items
          .whereType<Map<String, dynamic>>()
          .map(SocialPost.fromJson)
          .toList(),
      nextCursor: raw['nextCursor'] as String?,
    );
  }

  Future<SocialPost> create({
    required SocialPostKind kind,
    String? body,
    String? mediaUrl,
    String? thumbnailUrl,
    List<String> productIds = const [],
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/social-feed',
      body: {
        'mediaType': kind.apiValue,
        if (body?.trim().isNotEmpty == true) 'body': body!.trim(),
        if (mediaUrl?.trim().isNotEmpty == true) 'mediaUrl': mediaUrl!.trim(),
        if (thumbnailUrl?.trim().isNotEmpty == true)
          'thumbnailUrl': thumbnailUrl!.trim(),
        'productIds': productIds,
      },
    );
    return SocialPost.fromJson(json);
  }

  /// Uploads one file.
  ///
  /// [onProgress] reports 0..1 as the bytes go out. A video on a mobile connection takes long
  /// enough that a bare spinner is indistinguishable from a frozen screen, and somebody watching
  /// one has no way to know whether waiting will help or the upload died.
  Future<({String url, SocialPostKind kind})> uploadMedia(
    File file, {
    void Function(double progress)? onProgress,
  }) async {
    final raw = await _api.postMultipart<Map<String, dynamic>>(
      '/uploads/media',
      FormData.fromMap({
        'file': await MultipartFile.fromFile(
          file.path,
          filename: file.path.split(Platform.pathSeparator).last,
        ),
      }),
      onSendProgress: onProgress == null
          ? null
          // total is -1 when the length is unknown; a file always has one, but reporting a
          // negative fraction to a progress bar would render as a full one.
          : (sent, total) => onProgress(total > 0 ? sent / total : 0),
    );
    final type = raw['mediaType'] == 'VIDEO'
        ? SocialPostKind.video
        : SocialPostKind.photo;
    return (url: raw['url'] as String, kind: type);
  }

  Future<SocialPost> toggleLike(SocialPost post) async {
    final active = !post.likedByMe;
    await _api.post<Map<String, dynamic>>(
      '/social-feed/${post.id}/like',
      body: {'active': active},
    );
    return post.copyWith(
      likedByMe: active,
      likeCount: post.likeCount + (active ? 1 : -1),
    );
  }

  Future<SocialPost> toggleSave(SocialPost post) async {
    final active = !post.savedByMe;
    await _api.post<Map<String, dynamic>>(
      '/social-feed/${post.id}/save',
      body: {'active': active},
    );
    return post.copyWith(savedByMe: active);
  }

  Future<void> report(String postId, String reason) =>
      _api.post<void>('/social-feed/$postId/report', body: {'reason': reason});
}
