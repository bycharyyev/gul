import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/network/api_client.dart';
import 'package:gulyaly_mobile/features/chat/data/chat_repository.dart';
import 'package:gulyaly_mobile/features/chat/domain/chat_models.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  test(
    'official identity comes from a known server category, never the title',
    () {
      final ordinary = ChatConversation.fromJson({
        'id': 'room:r1',
        'kind': 'GROUP',
        'title': 'Official Security',
      });
      final unknown = ChatConversation.fromJson({
        'id': 'room:r2',
        'officialCategory': 'CUSTOM',
      });
      final official = ChatRoomView.fromJson({
        'room': {
          'kind': 'CHANNEL',
          'officialCategory': 'SECURITY',
          'canPost': false,
        },
        'messages': [],
      });
      expect(ordinary.officialCategory, isNull);
      expect(unknown.officialCategory, isNull);
      expect(official.officialCategory, ChatOfficialCategory.security);
      expect(official.canPost, isFalse);
      expect(
        ChatChannel.fromJson({'officialCategory': 'NEWS'}).officialCategory,
        ChatOfficialCategory.news,
      );
    },
  );

  late _Api api;
  late ChatRepository repository;

  setUp(() {
    api = _Api();
    repository = ChatRepository(api);
  });

  test('routes a group and a thread to their own paths', () async {
    // The id carries its own routing. Getting this wrong would send a seller conversation to the
    // rooms endpoint, where it does not exist, and the customer would see "not found" on a
    // conversation sitting in front of them.
    when(
      () => api.post<void>(any(), body: any(named: 'body')),
    ).thenAnswer((_) async {});

    await repository.send('room:r1', 'привет');
    await repository.send('thread:t1', 'привет');

    final paths = verify(
      () => api.post<void>(captureAny(), body: any(named: 'body')),
    ).captured;
    expect(paths, ['/chat/rooms/r1/messages', '/chat/threads/t1/messages']);
  });

  test('reads the inbox, keeping the server order', () async {
    // Ordering is the server's decision -- it alone sees every conversation's last activity.
    when(() => api.get<List<dynamic>>(any())).thenAnswer(
      (_) async => [
        {
          'id': 'thread:t1',
          'kind': 'SELLER',
          'title': 'Гульбахар',
          'lastMessage': 'букет готов',
          'lastMessageAt': '2026-09-09T12:20:00.000Z',
          'unreadCount': 3,
        },
        {
          'id': 'room:r1',
          'kind': 'GROUP',
          'title': 'Оптовики',
          'lastMessage': null,
          'lastMessageAt': '2026-09-09T12:10:00.000Z',
          'unreadCount': 0,
        },
      ],
    );

    final inbox = await repository.inbox();

    expect(inbox.map((c) => c.id), ['thread:t1', 'room:r1']);
    expect(inbox.first.kind, ChatKind.seller);
    expect(inbox.first.unreadCount, 3);
    expect(inbox.last.kind, ChatKind.group);
    expect(inbox.last.lastMessage, isNull);
  });

  test('a message with no author is not mine', () async {
    // Staff replies on the platform thread have no app account behind them, so authorId is null.
    // Treating null as a match would side every one of them as the customer's own.
    final message = ChatMessage.fromJson({
      'id': 'm1',
      'body': 'здравствуйте',
      'createdAt': '2026-09-09T12:00:00.000Z',
      'authorId': null,
      'author': null,
    });

    expect(message.isMine('u1'), isFalse);
    expect(message.isMine(null), isFalse);
  });

  test('falls back to the username when a person has no full name', () {
    final author = ChatAuthor.fromJson({
      'id': 'u2',
      'fullName': '  ',
      'username': 'jemsh',
    });
    expect(author.name, 'jemsh');
  });

  test('a channel somebody only follows comes back read-only', () async {
    // The server refuses the write either way; this flag is what stops the app offering a
    // composer that was never going to be accepted.
    when(() => api.get<Map<String, dynamic>>(any())).thenAnswer(
      (_) async => {
        'room': {
          'id': 'c1',
          'title': 'Новинки',
          'kind': 'CHANNEL',
          'canPost': false,
        },
        'messages': const [],
      },
    );

    final view = await repository.messages('room:c1');
    expect(view.canPost, isFalse);
    expect(view.title, 'Новинки');
  });

  test('assumes posting is allowed when the server says nothing', () async {
    // An older server has no channels either, so silence cannot mean read-only.
    when(() => api.get<Map<String, dynamic>>(any())).thenAnswer(
      (_) async => {
        'room': {'id': 't1', 'title': 'Гульбахар'},
        'messages': const [],
      },
    );

    expect((await repository.messages('thread:t1')).canPost, isTrue);
  });

  test(
    'subscribe and unsubscribe are different endpoints, not a flag',
    () async {
      when(
        () => api.post<void>(any(), body: any(named: 'body')),
      ).thenAnswer((_) async {});

      await repository.setSubscribed('c1', subscribed: true);
      await repository.setSubscribed('c1', subscribed: false);

      expect(
        verify(
          () => api.post<void>(captureAny(), body: any(named: 'body')),
        ).captured,
        ['/chat/channels/c1/subscribe', '/chat/channels/c1/unsubscribe'],
      );
    },
  );
  test('creates a group and hands back both the room and its code', () async {
    // Both, because the next thing anybody does is send the link -- a group with no way to
    // invite anybody is not a step towards anything.
    when(
      () => api.post<Map<String, dynamic>>(any(), body: any(named: 'body')),
    ).thenAnswer(
      (_) async => {'conversationId': 'room:g1', 'inviteCode': 'ABCDEFGHJK'},
    );

    final made = await repository.createGroup('Друзья');

    expect(made.conversationId, 'room:g1');
    expect(made.inviteCode, 'ABCDEFGHJK');
  });

  test('reads a group with its members and the invite link', () async {
    when(() => api.get<Map<String, dynamic>>('/chat/groups/g1')).thenAnswer(
      (_) async => {
        'id': 'g1',
        'title': 'Друзья',
        'isOwner': true,
        'inviteCode': 'ABCDEFGHJK',
        'members': [
          {'id': 'u1', 'name': 'Aman', 'avatarPath': null, 'isOwner': true},
          {'id': 'u2', 'name': 'Merjen', 'avatarPath': null, 'isOwner': false},
        ],
      },
    );

    final info = await repository.groupInfo('g1');

    expect(info.title, 'Друзья');
    expect(info.isOwner, isTrue);
    expect(info.members.map((m) => m.name), ['Aman', 'Merjen']);
    expect(info.members.first.isOwner, isTrue);
  });

  test('reads an invite preview without expecting a member list', () async {
    // The server deliberately does not send one: anybody holding a forwarded link can ask.
    when(
      () => api.get<Map<String, dynamic>>('/chat/invites/ABCDEFGHJK'),
    ).thenAnswer(
      (_) async => {
        'title': 'Друзья',
        'memberCount': 4,
        'alreadyMember': false,
        'conversationId': 'room:g1',
      },
    );

    final preview = await repository.invitePreview('ABCDEFGHJK');

    expect(preview.title, 'Друзья');
    expect(preview.memberCount, 4);
    expect(preview.alreadyMember, isFalse);
  });

  test(
    'a conversation view carries its kind, so only a group offers a members screen',
    () {
      final view = ChatRoomView.fromJson({
        'room': {
          'id': 'g1',
          'title': 'Друзья',
          'kind': 'GROUP',
          'canPost': true,
        },
        'messages': const [],
      });

      expect(view.kind, ChatKind.group);
    },
  );

  test(
    'an older server that sends no kind is treated as a thread, not a group',
    () {
      // Defaults must not invent a members screen for a two-sided conversation that has none.
      final view = ChatRoomView.fromJson({
        'room': {'id': 't1', 'title': 'Гульбахар'},
        'messages': const [],
      });

      expect(view.kind, isNot(ChatKind.group));
      expect(view.canPost, isTrue);
    },
  );

  group('incremental reads keep every earlier message', () {
    Map<String, dynamic> msg(String id, int minute) => {
      'id': id,
      'body': 'b$id',
      'createdAt': DateTime.utc(2026, 10, 2, 10, minute).toIso8601String(),
      'authorId': 'u1',
    };

    test(
      'first read is full; later polls ask after the last server id and append',
      () async {
        final paths = <String>[];
        final answers = [
          {
            'room': {'title': 'Group', 'kind': 'GROUP', 'canPost': true},
            'messages': [msg('m1', 1), msg('m2', 2)],
          },
          {
            'room': {'title': 'Group', 'kind': 'GROUP', 'canPost': true},
            'messages': [msg('m3', 3)],
            'incremental': true,
          },
          {
            'room': {'title': 'Group', 'kind': 'GROUP', 'canPost': true},
            'messages': <Map<String, dynamic>>[],
            'incremental': true,
          },
        ];
        when(() => api.get<Map<String, dynamic>>(any())).thenAnswer((
          inv,
        ) async {
          paths.add(inv.positionalArguments.first as String);
          return answers[paths.length - 1];
        });

        final first = await repository.messages('room:r1');
        final second = await repository.messages('room:r1');
        final third = await repository.messages('room:r1');

        expect(paths[0], '/chat/rooms/r1/messages');
        expect(paths[1], '/chat/rooms/r1/messages?after=m2');
        expect(paths[2], '/chat/rooms/r1/messages?after=m3');
        expect(first.messages.map((m) => m.id), ['m1', 'm2']);
        expect(second.messages.map((m) => m.id), ['m1', 'm2', 'm3']);
        // Nothing new: everything loaded before is still there.
        expect(third.messages.map((m) => m.id), ['m1', 'm2', 'm3']);
      },
    );

    test(
      'a message from the other side stored before ours is placed above it, once',
      () async {
        var call = 0;
        when(() => api.get<Map<String, dynamic>>(any())).thenAnswer((_) async {
          call++;
          return call == 1
              ? {
                  'room': {'kind': 'GROUP'},
                  'messages': [msg('m1', 1)],
                }
              : {
                  'room': {'kind': 'GROUP'},
                  'messages': [msg('theirs', 2), msg('m1', 1)],
                  'incremental': true,
                };
        });
        await repository.messages('room:r1');
        final view = await repository.messages('room:r1');
        expect(view.messages.map((m) => m.id), ['m1', 'theirs']);
      },
    );
  });
}
