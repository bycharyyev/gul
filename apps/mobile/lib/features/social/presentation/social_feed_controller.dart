import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/social_feed_repository.dart';
import '../domain/social_post.dart';

/// The feed as it accumulates: the pages already loaded, plus whether another one exists.
///
/// A full-screen vertical feed has no visible end, so "the list ended" and "the list is still
/// loading" have to be different states -- otherwise the last post looks like the last post there
/// will ever be.
class SocialFeedState {
  const SocialFeedState({
    this.posts = const [],
    this.cursor,
    this.loadingMore = false,
    this.reachedEnd = false,
  });

  final List<SocialPost> posts;
  final String? cursor;
  final bool loadingMore;
  final bool reachedEnd;

  SocialFeedState copyWith({
    List<SocialPost>? posts,
    String? cursor,
    bool? loadingMore,
    bool? reachedEnd,
  }) => SocialFeedState(
    posts: posts ?? this.posts,
    cursor: cursor ?? this.cursor,
    loadingMore: loadingMore ?? this.loadingMore,
    reachedEnd: reachedEnd ?? this.reachedEnd,
  );
}

class SocialFeedController extends StateNotifier<AsyncValue<SocialFeedState>> {
  SocialFeedController(this._repository) : super(const AsyncValue.loading()) {
    refresh();
  }

  final SocialFeedRepository _repository;

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    try {
      final page = await _repository.loadFeed();
      state = AsyncValue.data(
        SocialFeedState(
          posts: page.posts,
          cursor: page.nextCursor,
          reachedEnd: !page.hasMore,
        ),
      );
    } catch (error, stack) {
      state = AsyncValue.error(error, stack);
    }
  }

  /// Fetches the next page. Safe to call on every page turn: it is a no-op while one is already
  /// in flight or once the server has said there is nothing more, so the screen does not need to
  /// track either condition itself.
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || current.reachedEnd) return;
    final cursor = current.cursor;
    if (cursor == null) return;
    state = AsyncValue.data(current.copyWith(loadingMore: true));
    try {
      final page = await _repository.loadFeed(cursor: cursor);
      final latest = state.value ?? current;
      // Ids the page already holds are dropped rather than appended: a post edited between two
      // requests can legitimately come back on both, and a duplicate in a PageView is a post the
      // customer scrolls past twice.
      final seen = latest.posts.map((post) => post.id).toSet();
      state = AsyncValue.data(
        latest.copyWith(
          posts: [
            ...latest.posts,
            ...page.posts.where((post) => !seen.contains(post.id)),
          ],
          cursor: page.nextCursor,
          loadingMore: false,
          reachedEnd: !page.hasMore,
        ),
      );
    } catch (_) {
      // A failed page is not a failed feed: what is already on screen keeps working, and the next
      // page turn tries again.
      final latest = state.value;
      if (latest != null) {
        state = AsyncValue.data(latest.copyWith(loadingMore: false));
      }
    }
  }
}
