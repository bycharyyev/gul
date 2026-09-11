import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/social/data/social_feed_repository.dart';
import 'package:gulyaly_mobile/features/social/domain/social_post.dart';
import 'package:gulyaly_mobile/features/social/presentation/my_posts_screen.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements SocialFeedRepository {}

SocialPost _post({
  required String id,
  required SocialPostStatus status,
  bool canEdit = false,
  bool canDelete = false,
  String? note,
}) => SocialPost(
  id: id,
  authorName: 'Altyn Ay',
  createdAt: DateTime.utc(2026, 9, 10),
  kind: SocialPostKind.video,
  text: 'Пост $id',
  likeCount: 3,
  savedByMe: false,
  likedByMe: false,
  isMine: true,
  status: status,
  moderationNote: note,
  canEdit: canEdit,
  canDelete: canDelete,
);

Future<void> _open(WidgetTester t, SocialFeedRepository repo) async {
  await t.pumpWidget(
    ProviderScope(
      overrides: [socialFeedRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp(
        home: const MyPostsScreen(),
        builder: (context, child) =>
            StringsScope(strings: const Strings('ru'), child: child!),
      ),
    ),
  );
  await t.pumpAndSettle();
}

void main() {
  setUpAll(
    () => registerFallbackValue(
      _post(id: 'x', status: SocialPostStatus.published),
    ),
  );

  testWidgets('shows what the feed cannot: a post in review and a refusal', (
    t,
  ) async {
    // The whole reason this screen exists. Neither of these posts appears anywhere else in the
    // app, so without it an author who published and saw nothing could not tell a moderation
    // queue from a refusal -- nor read the reason, which the server had recorded all along.
    final repo = _Repository();
    when(() => repo.loadMine(cursor: any(named: 'cursor'))).thenAnswer(
      (_) async => SocialFeedPage(
        posts: [
          _post(id: 'a', status: SocialPostStatus.pending),
          _post(
            id: 'b',
            status: SocialPostStatus.rejected,
            note: 'Фото не соответствует товару',
          ),
        ],
        nextCursor: null,
      ),
    );

    await _open(t, repo);

    expect(find.text('На проверке'), findsOneWidget);
    expect(find.text('Отклонено'), findsOneWidget);
    expect(find.text('Фото не соответствует товару'), findsOneWidget);
  });

  testWidgets('offers exactly the actions the server said it would allow', (
    t,
  ) async {
    // canEdit/canDelete come from the API, which decides them by the same rules the write routes
    // enforce. A button derived on this side is a button the server then refuses.
    final repo = _Repository();
    when(() => repo.loadMine(cursor: any(named: 'cursor'))).thenAnswer(
      (_) async => SocialFeedPage(
        posts: [
          _post(id: 'a', status: SocialPostStatus.published, canEdit: true),
          _post(id: 'b', status: SocialPostStatus.hidden),
        ],
        nextCursor: null,
      ),
    );

    await _open(t, repo);

    // One editable post, and nothing deletable: a published post can be edited but not deleted,
    // and a hidden one allows neither.
    expect(find.text('Изменить подпись'), findsOneWidget);
    expect(find.text('Удалить'), findsNothing);
  });

  testWidgets('an edit is announced as sent for review, not as published', (
    t,
  ) async {
    // The server puts an edited post back in the queue. Calling it "saved" would leave the author
    // waiting for something that is not going to appear.
    final repo = _Repository();
    when(() => repo.loadMine(cursor: any(named: 'cursor'))).thenAnswer(
      (_) async => SocialFeedPage(
        posts: [_post(id: 'a', status: SocialPostStatus.published, canEdit: true)],
        nextCursor: null,
      ),
    );
    when(
      () => repo.updateMine(any(), body: any(named: 'body')),
    ).thenAnswer(
      (_) async => _post(id: 'a', status: SocialPostStatus.pending),
    );

    await _open(t, repo);
    await t.tap(find.text('Изменить подпись'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField), 'Новая подпись');
    await t.tap(find.text('Сохранить'));
    await t.pumpAndSettle();

    verify(() => repo.updateMine('a', body: 'Новая подпись')).called(1);
    expect(find.text('Изменения отправлены на проверку'), findsOneWidget);
    // And the list is already showing what the server now says. On the phone it kept reading
    // "Опубликовано" under a message announcing the opposite, until somebody pulled to refresh.
    verify(() => repo.loadMine(cursor: any(named: 'cursor'))).called(2);
  });

  testWidgets('deleting asks first', (t) async {
    final repo = _Repository();
    when(() => repo.loadMine(cursor: any(named: 'cursor'))).thenAnswer(
      (_) async => SocialFeedPage(
        posts: [_post(id: 'a', status: SocialPostStatus.pending, canDelete: true)],
        nextCursor: null,
      ),
    );
    when(() => repo.deleteMine(any())).thenAnswer((_) async {});

    await _open(t, repo);
    await t.tap(find.text('Удалить'));
    await t.pumpAndSettle();

    // Nothing is gone yet -- the confirmation is on screen and the post is still there.
    verifyNever(() => repo.deleteMine(any()));
    expect(find.text('Удалить публикацию?'), findsOneWidget);
  });

  testWidgets('says so plainly when there is nothing to show', (t) async {
    final repo = _Repository();
    when(() => repo.loadMine(cursor: any(named: 'cursor'))).thenAnswer(
      (_) async => const SocialFeedPage(posts: [], nextCursor: null),
    );

    await _open(t, repo);

    expect(find.text('Вы ещё ничего не публиковали'), findsOneWidget);
  });
}
