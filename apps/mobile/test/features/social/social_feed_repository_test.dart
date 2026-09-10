import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/network/api_client.dart';
import 'package:gulyaly_mobile/features/social/data/social_feed_repository.dart';
import 'package:gulyaly_mobile/features/social/domain/social_post.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

final _post = <String, dynamic>{
  'id': 'post-1',
  'mediaType': 'VIDEO',
  'createdAt': '2026-09-09T12:00:00.000Z',
  'author': {'fullName': 'Aýgül'},
  'likeCount': 2,
  'savedByMe': false,
  'likedByMe': false,
  'isMine': false,
  'products': [
    {
      'id': 'p1',
      'name': 'Çaynik',
      'priceTmt': '120',
      'imageUrl': 'https://image.test/a.jpg',
    },
  ],
};

void main() {
  late _Api api;
  late SocialFeedRepository repository;
  setUp(() {
    api = _Api();
    repository = SocialFeedRepository(api);
  });

  test('feed sends cursor only when supplied and keeps server ranking', () async {
    when(
      () => api.get<Map<String, dynamic>>(
        '/social-feed/for-you',
        query: any(named: 'query'),
      ),
    ).thenAnswer(
      (_) async => {
        'items': [_post],
        'nextCursor': null,
      },
    );
    final page = await repository.loadFeed(cursor: 'next');
    final post = page.posts.single;
    final query = verify(
      () => api.get<Map<String, dynamic>>(
        '/social-feed/for-you',
        query: captureAny(named: 'query'),
      ),
    ).captured.single;
    expect(query, {'cursor': 'next'});
    expect(post.kind, SocialPostKind.video);
    expect(post.product?.priceTmt, 120);
    // A null cursor is the server saying the feed ended, and the caller has to be able to see
    // that -- dropping it is what capped the feed at one page.
    expect(page.nextCursor, isNull);
    expect(page.hasMore, isFalse);
  });

  test(
    'creation follows the moderation contract and never accepts a client price',
    () async {
      when(
        () => api.post<Map<String, dynamic>>(
          '/social-feed',
          body: any(named: 'body'),
        ),
      ).thenAnswer(
        (_) async => {..._post, 'isMine': true, 'status': 'PENDING'},
      );
      await repository.create(
        kind: SocialPostKind.photo,
        body: 'New',
        mediaUrl: '/api/uploads/a.jpg',
        productIds: ['p1'],
      );
      final body =
          verify(
                () => api.post<Map<String, dynamic>>(
                  '/social-feed',
                  body: captureAny(named: 'body'),
                ),
              ).captured.single
              as Map<String, dynamic>;
      expect(body.containsKey('status'), isFalse);
      expect(body, containsPair('mediaType', 'IMAGE'));
      expect(body, containsPair('productIds', ['p1']));
      expect(body.containsKey('priceTmt'), isFalse);
    },
  );

  test(
    'report carries a stable reason, never free-form sensitive text',
    () async {
      when(
        () => api.post<void>(
          '/social-feed/post-1/report',
          body: any(named: 'body'),
        ),
      ).thenAnswer((_) async {});
      await repository.report('post-1', 'spam');
      verify(
        () => api.post<void>(
          '/social-feed/post-1/report',
          body: {'reason': 'spam'},
        ),
      ).called(1);
    },
  );
}
