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

  /// Likes or unlikes a post without disturbing the feed around it.
  ///
  /// The screen used to invalidate the whole provider after a reaction, which refetched the feed,
  /// rebuilt the PageView and threw the reader back to the first post -- a tap on a heart moved
  /// the page out from under the finger. Nothing about a like changes which posts exist or in
  /// what order, so nothing outside that one post should move.
  Future<void> toggleLike(SocialPost post) => _mutate(
    post,
    post.copyWith(
      likedByMe: !post.likedByMe,
      likeCount: post.likeCount + (post.likedByMe ? -1 : 1),
    ),
    () => _repository.toggleLike(post),
  );

  Future<void> toggleSave(SocialPost post) => _mutate(
    post,
    post.copyWith(savedByMe: !post.savedByMe),
    () => _repository.toggleSave(post),
  );

  /// Shows the new state immediately, then keeps whatever the server confirms — and puts the old
  /// state back if it refuses. A reaction that waits for a round trip feels broken on a slow
  /// connection, and one that never checks leaves an invented truth on screen.
  Future<void> _mutate(
    SocialPost original,
    SocialPost optimistic,
    Future<SocialPost> Function() call,
  ) async {
    _replace(optimistic);
    try {
      _replace(await call());
    } catch (_) {
      _replace(original);
    }
  }

  /// Swaps one post for its new version, leaving the list's length and order untouched — which is
  /// what keeps the PageView on the page the reader is looking at.
  void _replace(SocialPost post) {
    final current = state.value;
    if (current == null) return;
    state = AsyncValue.data(
      current.copyWith(
        posts: [
          for (final existing in current.posts)
            if (existing.id == post.id) post else existing,
        ],
      ),
    );
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
