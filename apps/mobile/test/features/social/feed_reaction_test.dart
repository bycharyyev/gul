import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/features/social/data/social_feed_repository.dart';
import 'package:gulyaly_mobile/features/social/domain/social_post.dart';
import 'package:gulyaly_mobile/features/social/presentation/social_feed_controller.dart';
import 'package:mocktail/mocktail.dart';

class _Repo extends Mock implements SocialFeedRepository {}

SocialPost _post(String id, {bool liked = false, int likes = 0}) => SocialPost(
  id: id,
  kind: SocialPostKind.photo,
  authorName: 'A',
  createdAt: DateTime.utc(2026, 9, 11),
  likeCount: likes,
  likedByMe: liked,
  savedByMe: false,
  isMine: false,
);

void main() {
  setUpAll(() => registerFallbackValue(_post('x')));

  late _Repo repo;

  setUp(() {
    repo = _Repo();
    when(() => repo.loadFeed(cursor: any(named: 'cursor'))).thenAnswer(
      (_) async => SocialFeedPage(
        posts: [_post('p1'), _post('p2'), _post('p3')],
        nextCursor: null,
      ),
    );
  });

  Future<SocialFeedController> ready() async {
    final controller = SocialFeedController(repo);
    await Future<void>.delayed(Duration.zero);
    return controller;
  }

  test('a like leaves the list length and order exactly as they were', () async {
    // This is the jump: the screen used to refetch the whole feed after a reaction, so the
    // PageView was rebuilt and the reader was thrown back to the first post.
    final controller = await ready();
    when(() => repo.toggleLike(any())).thenAnswer(
      (_) async => _post('p2', liked: true, likes: 1),
    );

    final before = controller.state.value!.posts.map((p) => p.id).toList();
    await controller.toggleLike(controller.state.value!.posts[1]);
    final after = controller.state.value!.posts;

    expect(after.map((p) => p.id).toList(), before);
    expect(after[1].likedByMe, isTrue);
    expect(after[1].likeCount, 1);
    // One load at construction. A reaction must not cause another.
    verify(() => repo.loadFeed(cursor: any(named: 'cursor'))).called(1);
  });

  test('the heart fills before the server answers', () async {
    final controller = await ready();
    final gate = Completer<SocialPost>();
    when(() => repo.toggleLike(any())).thenAnswer((_) => gate.future);

    final pending = controller.toggleLike(controller.state.value!.posts[0]);
    expect(controller.state.value!.posts[0].likedByMe, isTrue);
    expect(controller.state.value!.posts[0].likeCount, 1);

    gate.complete(_post('p1', liked: true, likes: 1));
    await pending;
  });

  test('a refused like is put back, not left as an invented truth', () async {
    final controller = await ready();
    when(() => repo.toggleLike(any())).thenThrow(Exception('offline'));

    await controller.toggleLike(controller.state.value!.posts[0]);

    expect(controller.state.value!.posts[0].likedByMe, isFalse);
    expect(controller.state.value!.posts[0].likeCount, 0);
  });
}
