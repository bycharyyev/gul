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
    when(
      () => repository.loadThread(),
    ).thenAnswer((_) async => _thread(['Здравствуйте']));

    await controller.load();

    expect(controller.state.loading, isFalse);
    expect(controller.state.thread?.messages.single.body, 'Здравствуйте');
    expect(controller.state.error, isNull);
  });

  test('a failed first load is an error the user can retry', () async {
    when(
      () => repository.loadThread(),
    ).thenThrow(const AppException(kind: AppErrorKind.network));

    await controller.load();

    expect(controller.state.error, isNotNull);
    expect(controller.state.loading, isFalse);
  });

  test('a failed poll leaves a readable conversation alone', () async {
    // A dropped packet fifteen seconds in must not replace what is on screen with an error page.
    when(
      () => repository.loadThread(),
    ).thenAnswer((_) async => _thread(['Здравствуйте']));
    await controller.load();

    when(
      () => repository.loadThread(),
    ).thenThrow(const AppException(kind: AppErrorKind.network));
    controller.startPolling();
    await Future<void>.delayed(Duration.zero);

    // Drive one tick by calling the same path the timer does.
    await controller.load();

    expect(controller.state.thread?.messages.single.body, 'Здравствуйте');
  });

  test('a successful poll clears an earlier error', () async {
    when(
      () => repository.loadThread(),
    ).thenThrow(const AppException(kind: AppErrorKind.server));
    await controller.load();
    expect(controller.state.error, isNotNull);

    when(
      () => repository.loadThread(),
    ).thenAnswer((_) async => _thread(['Ответ']));
    await controller.load();

    expect(controller.state.error, isNull);
    expect(controller.state.thread?.messages, hasLength(1));
  });

  test('overlapping fetches collapse into one request', () async {
    // The 15s timer must not stack requests behind a slow one.
    final gate = Completer<SupportThread>();
    when(() => repository.loadThread()).thenAnswer((_) => gate.future);

    final first = controller.load();
    final second = controller.load();
    gate.complete(_thread(['ok']));
    await Future.wait([first, second]);

    verify(() => repository.loadThread()).called(1);
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
      when(
        () => repository.loadThread(),
      ).thenAnswer((_) async => _thread(['Вопрос']));

      expect(await controller.send('Вопрос'), isTrue);

      verify(() => repository.send('Вопрос')).called(1);
      verify(() => repository.loadThread()).called(1);
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
      when(
        () => repository.loadThread(),
      ).thenAnswer((_) async => _thread(['Вопрос']));

      await controller.send('  Вопрос  ');
      verify(() => repository.send('Вопрос')).called(1);
    });

    test('a send failure is separate from a load failure', () async {
      when(
        () => repository.loadThread(),
      ).thenAnswer((_) async => _thread(['Здравствуйте']));
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
        () => repository.loadThread(),
      ).thenAnswer((_) async => _thread(['ok']));
      controller.startPolling();
      controller.stopPolling();

      await Future<void>.delayed(Duration.zero);

      verifyNever(() => repository.loadThread());
    },
  );
}
