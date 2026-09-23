import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/features/support/domain/support_message.dart';

void main() {
  group('SupportMessage', () {
    test('maps the three sender roles the backend defines', () {
      expect(
        SupportMessage.fromJson(const {
          'id': 'm1',
          'senderRole': 'CUSTOMER',
          'body': 'a',
        }).sender,
        SupportSender.customer,
      );
      expect(
        SupportMessage.fromJson(const {
          'id': 'm2',
          'senderRole': 'STAFF',
          'body': 'a',
        }).sender,
        SupportSender.staff,
      );
      expect(
        SupportMessage.fromJson(const {
          'id': 'm3',
          'senderRole': 'SELLER',
          'body': 'a',
        }).sender,
        SupportSender.seller,
      );
    });

    test('an unknown role is never treated as the customer', () {
      // Rendering someone else's message on the "mine" side would be worse than rendering it
      // plainly — it would look like something the user wrote.
      final message = SupportMessage.fromJson(const {
        'id': 'm4',
        'senderRole': 'BOT',
        'body': 'a',
      });

      expect(message.sender, SupportSender.unknown);
      expect(message.isMine, isFalse);
    });

    test('only the customer’s own messages are mine', () {
      expect(
        SupportMessage.fromJson(const {
          'id': 'm1',
          'senderRole': 'CUSTOMER',
          'body': 'a',
        }).isMine,
        isTrue,
      );
      expect(
        SupportMessage.fromJson(const {
          'id': 'm2',
          'senderRole': 'STAFF',
          'body': 'a',
        }).isMine,
        isFalse,
      );
    });

    test('parses the timestamp and survives its absence', () {
      expect(
        SupportMessage.fromJson(const {
          'id': 'm1',
          'senderRole': 'STAFF',
          'body': 'a',
          'createdAt': '2026-09-01T10:00:00.000Z',
        }).createdAt,
        isNotNull,
      );
      expect(
        SupportMessage.fromJson(const {
          'id': 'm1',
          'senderRole': 'STAFF',
          'body': 'a',
        }).createdAt,
        isNull,
      );
    });
  });

  group('SupportThread', () {
    test('reads the envelope the endpoint returns', () {
      // GET /support/thread answers { thread: {...}, messages: [...] }
      final thread = SupportThread.fromJson(const {
        'thread': {'id': 't1', 'status': 'OPEN'},
        'messages': [
          {'id': 'm1', 'senderRole': 'CUSTOMER', 'body': 'Вопрос'},
          {'id': 'm2', 'senderRole': 'STAFF', 'body': 'Ответ'},
        ],
      });

      expect(thread.status, 'OPEN');
      expect(thread.messages.map((m) => m.body), ['Вопрос', 'Ответ']);
      expect(thread.isEmpty, isFalse);
    });

    test('a brand-new thread has no messages and is not an error', () {
      final thread = SupportThread.fromJson(const {
        'thread': {'id': 't1', 'status': 'OPEN'},
        'messages': <dynamic>[],
      });

      expect(thread.isEmpty, isTrue);
    });

    test('a status this build has not seen is kept, not rejected', () {
      final thread = SupportThread.fromJson(const {
        'thread': {'id': 't1', 'status': 'ESCALATED'},
        'messages': <dynamic>[],
      });

      expect(thread.status, 'ESCALATED');
    });
  });
}
