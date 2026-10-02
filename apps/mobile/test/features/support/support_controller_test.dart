import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/errors/app_exception.dart';
import 'package:gulyaly_mobile/features/support/data/support_repository.dart';
import 'package:gulyaly_mobile/features/support/domain/support_message.dart';
import 'package:gulyaly_mobile/features/support/presentation/support_controller.dart';
import 'package:mocktail/mocktail.dart';

class MockSupportRepository extends Mock implements SupportRepository {}

SupportThread _thread(List<String> bodies) => SupportThread(
  status: 'OPEN',
  messages: [
    for (var i = 0; i < bodies.length; i++)
      SupportMessage(
        id: 'm$i',
        sender: SupportSender.staff,
        body: bodies[i],
        createdAt: DateTime(2026, 9, 1, 10, i),
      ),
  ],
);

void main() {
  late MockSupportRepository repository;
  late SupportController controller;

  setUp(() {
    repository = MockSupportRepository();
    controller = SupportController(repository);
  });

  tearDown(() => controller.dispose());

  test('the first load fills the thread and clears the loading flag', () async {
    when(() => repository.loadThread(after: any(named: 'after'))).thenAnswer(
      (_) async => (thread: _thread(['Здравствуйте']), incremental: false),
    );

    await controller.load();

    expect(controller.state.loading, isFalse);
    expect(controller.state.thread?.messages.single.body, 'Здравствуйте');
    expect(controller.state.error, isNull);
  });

  test('a failed first load is an error the user can retry', () async {
    when(
      () => repository.loadThread(after: any(named: 'after')),
    ).thenThrow(const AppException(kind: AppErrorKind.network));

    await controller.load();

    expect(controller.state.error, isNotNull);
    expect(controller.state.loading, isFalse);
  });

  test('a failed poll leaves a readable conversation alone', () async {
    // A dropped packet fifteen seconds in must not replace what is on screen with an error page.
    when(() => repository.loadThread(after: any(named: 'after'))).thenAnswer(
      (_) async => (thread: _thread(['Здравствуйте']), incremental: false),
    );
    await controller.load();

    when(
      () => repository.loadThread(after: any(named: 'after')),
    ).thenThrow(const AppException(kind: AppErrorKind.network));
    controller.startPolling();
    await Future<void>.delayed(Duration.zero);

    // Drive one tick by calling the same path the timer does.
    await controller.load();

    expect(controller.state.thread?.messages.single.body, 'Здравствуйте');
  });

  test('a successful poll clears an earlier error', () async {
    when(
      () => repository.loadThread(after: any(named: 'after')),
    ).thenThrow(const AppException(kind: AppErrorKind.server));
    await controller.load();
    expect(controller.state.error, isNotNull);

    when(
      () => repository.loadThread(after: any(named: 'after')),
    ).thenAnswer((_) async => (thread: _thread(['Ответ']), incremental: false));
    await controller.load();

    expect(controller.state.error, isNull);
    expect(controller.state.thread?.messages, hasLength(1));
  });

  test('overlapping fetches collapse into one request', () async {
    // The 15s timer must not stack requests behind a slow one.
    final gate = Completer<({SupportThread thread, bool incremental})>();
    when(
      () => repository.loadThread(after: any(named: 'after')),
    ).thenAnswer((_) => gate.future);

    final first = controller.load();
    final second = controller.load();
    gate.complete((thread: _thread(['ok']), incremental: false));
    await Future.wait([first, second]);

    verify(() => repository.loadThread(after: any(named: 'after'))).called(1);
  });

  group('sending', () {
    test('refetches instead of appending a locally built message', () async {
      // The server owns ids and timestamps; a locally constructed message would disagree with
      // the very next poll.
      when(() => repository.send(any())).thenAnswer(
        (_) async => SupportMessage(
          id: 'm1',
          sender: SupportSender.customer,
          body: 'Вопрос',
          createdAt: DateTime(2026, 9, 1),
        ),
      );
      when(() => repository.loadThread(after: any(named: 'after'))).thenAnswer(
        (_) async => (thread: _thread(['Вопрос']), incremental: false),
      );

      expect(await controller.send('Вопрос'), isTrue);

      verify(() => repository.send('Вопрос')).called(1);
      verify(() => repository.loadThread(after: any(named: 'after'))).called(1);
      expect(controller.state.sending, isFalse);
    });

    test('trims, and refuses to send nothing', () async {
      expect(await controller.send('   '), isFalse);
      verifyNever(() => repository.send(any()));

      when(() => repository.send(any())).thenAnswer(
        (_) async => SupportMessage(
          id: 'm1',
          sender: SupportSender.customer,
          body: 'Вопрос',
          createdAt: DateTime(2026, 9, 1),
        ),
      );
      when(() => repository.loadThread(after: any(named: 'after'))).thenAnswer(
        (_) async => (thread: _thread(['Вопрос']), incremental: false),
      );

      await controller.send('  Вопрос  ');
      verify(() => repository.send('Вопрос')).called(1);
    });

    test('a send failure is separate from a load failure', () async {
      when(() => repository.loadThread(after: any(named: 'after'))).thenAnswer(
        (_) async => (thread: _thread(['Здравствуйте']), incremental: false),
      );
      await controller.load();

      when(
        () => repository.send(any()),
      ).thenThrow(const AppException(kind: AppErrorKind.rateLimited));

      expect(await controller.send('Вопрос'), isFalse);
      expect(controller.state.sendError, isNotNull);
      // The conversation is still on screen and still readable.
      expect(controller.state.error, isNull);
      expect(controller.state.thread?.messages, hasLength(1));
    });
  });

  test(
    'stopPolling ends the timer, so a disposed screen fetches nothing',
    () async {
      when(
        () => repository.loadThread(after: any(named: 'after')),
      ).thenAnswer((_) async => (thread: _thread(['ok']), incremental: false));
      controller.startPolling();
      controller.stopPolling();

      await Future<void>.delayed(Duration.zero);

      verifyNever(() => repository.loadThread(after: any(named: 'after')));
    },
  );

  test(
    'a poll adds only new messages and keeps every earlier one on screen',
    () async {
      final afters = <String?>[];
      var call = 0;
      when(() => repository.loadThread(after: any(named: 'after'))).thenAnswer((
        inv,
      ) async {
        afters.add(inv.namedArguments[#after] as String?);
        call++;
        if (call == 1) {
          return (
            thread: _thread(['Здравствуйте', 'Чем помочь?']),
            incremental: false,
          );
        }
        if (call == 2) {
          return (
            thread: SupportThread(
              status: 'OPEN',
              messages: [
                SupportMessage(
                  id: 'm9',
                  sender: SupportSender.staff,
                  body: 'Новое',
                  createdAt: DateTime(2026, 9, 1, 11),
                ),
              ],
            ),
            incremental: true,
          );
        }
        return (
          thread: const SupportThread(status: 'OPEN', messages: []),
          incremental: true,
        );
      });

      await controller.load();
      await controller.poll();
      await controller.poll();

      expect(afters, [
        null,
        'm1',
        'm9',
      ]); // full first, then after the last id the server sent
      expect(controller.state.thread?.messages.map((m) => m.body), [
        'Здравствуйте',
        'Чем помочь?',
        'Новое',
      ]);
    },
  );
}
