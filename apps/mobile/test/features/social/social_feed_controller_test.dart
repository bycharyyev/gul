import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/features/social/data/social_feed_repository.dart';
import 'package:gulyaly_mobile/features/social/domain/social_post.dart';
import 'package:gulyaly_mobile/features/social/presentation/social_feed_controller.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements SocialFeedRepository {}

SocialPost _post(String id) => SocialPost.fromJson({
  'id': id,
  'mediaType': 'TEXT',
  'body': id,
  'author': {'id': 'a', 'fullName': 'A', 'username': 'a'},
  'products': const [],
  'likeCount': 0,
  'saveCount': 0,
  'commentCount': 0,
  'publishedAt': '2026-09-09T10:00:00.000Z',
});

void main() {
  late _Repository repo;

  setUp(() => repo = _Repository());

  Future<SocialFeedController> loaded(SocialFeedPage first) async {
    when(() => repo.loadFeed()).thenAnswer((_) async => first);
    final controller = SocialFeedController(repo);
    await Future<void>.delayed(Duration.zero);
    return controller;
  }

  test('appends the next page instead of replacing the first', () async {
    final controller = await loaded(
      SocialFeedPage(posts: [_post('p1')], nextCursor: 'c1'),
    );
    when(() => repo.loadFeed(cursor: 'c1')).thenAnswer(
      (_) async => SocialFeedPage(posts: [_post('p2')], nextCursor: null),
    );

    await controller.loadMore();

    expect(controller.state.value!.posts.map((p) => p.id), ['p1', 'p2']);
    expect(controller.state.value!.reachedEnd, isTrue);
  });

  test('drops a post the feed already holds', () async {
    // A post edited between two requests can legitimately come back on both pages. Appending it
    // blindly means the customer scrolls past the same post twice.
    final controller = await loaded(
      SocialFeedPage(posts: [_post('p1')], nextCursor: 'c1'),
    );
    when(() => repo.loadFeed(cursor: 'c1')).thenAnswer(
      (_) async =>
          SocialFeedPage(posts: [_post('p1'), _post('p2')], nextCursor: null),
    );

    await controller.loadMore();

    expect(controller.state.value!.posts.map((p) => p.id), ['p1', 'p2']);
  });

  test('asks for nothing once the server said the feed ended', () async {
    final controller = await loaded(
      SocialFeedPage(posts: [_post('p1')], nextCursor: null),
    );

    await controller.loadMore();

    // The screen calls loadMore on every page turn, so refusing here rather than in the widget is
    // what stops a finished feed from re-requesting on every swipe. Only the initial page was
    // ever fetched.
    verify(() => repo.loadFeed()).called(1);
    verifyNoMoreInteractions(repo);
    expect(controller.state.value!.reachedEnd, isTrue);
  });

  test('keeps what is on screen when a page fails', () async {
    final controller = await loaded(
      SocialFeedPage(posts: [_post('p1')], nextCursor: 'c1'),
    );
    when(() => repo.loadFeed(cursor: 'c1')).thenThrow(Exception('offline'));

    await controller.loadMore();

    // A failed page is not a failed feed: the error must not blank the posts already loaded.
    expect(controller.state.hasError, isFalse);
    expect(controller.state.value!.posts.map((p) => p.id), ['p1']);
    expect(controller.state.value!.loadingMore, isFalse);
    expect(controller.state.value!.reachedEnd, isFalse);
  });
}
