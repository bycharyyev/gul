import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/config/app_config.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/profile/data/profile_repository.dart';
import 'package:gulyaly_mobile/features/profile/domain/profile_overview.dart';
import 'package:gulyaly_mobile/features/profile/presentation/referral_screen.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mocktail/mocktail.dart';

class MockProfileRepository extends Mock implements ProfileRepository {}

ProfileOverview _overview({
  bool canChangeUsername = true,
  double? balance = 12.5,
}) => ProfileOverview(
  email: EmailStatus.unknown,
  referral: ReferralSummary(
    username: 'aygul',
    canChangeUsername: canChangeUsername,
    totalReferred: 4,
    rewarded: 2,
    pending: 1,
    balanceTmt: balance,
  ),
);

/// Pinned rather than read from the build environment: the link the screen prints is the point
/// of one of these tests, and under `flutter test` the environment resolves to the development
/// host, which says nothing about what a customer would send.
const _config = AppConfig(
  environment: AppEnvironment.production,
  apiBaseUrl: 'https://api.gulyaly.pro/api',
  siteBaseUrl: 'https://gulyaly.pro',
  connectTimeout: Duration(seconds: 15),
  receiveTimeout: Duration(seconds: 30),
);

Widget _harness(MockProfileRepository repository) => ProviderScope(
  overrides: [
    profileRepositoryProvider.overrideWithValue(repository),
    appConfigProvider.overrideWithValue(_config),
  ],
  child: const MaterialApp(
    home: StringsScope(strings: Strings('ru'), child: ReferralScreen()),
  ),
);

void main() {
  setUpAll(() async {
    await initializeDateFormatting('ru');
    await initializeDateFormatting('en');
  });

  late MockProfileRepository repository;

  setUp(() {
    repository = MockProfileRepository();
    when(() => repository.load()).thenAnswer((_) async => _overview());
  });

  Future<void> pumpScreen(WidgetTester t) async {
    t.view.physicalSize = const Size(400, 1600);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);

    await t.pumpWidget(_harness(repository));
    await t.pumpAndSettle();
  }

  testWidgets('shows the code and the stats', (t) async {
    await pumpScreen(t);

    expect(find.text('aygul'), findsOneWidget);
    expect(find.text('4'), findsOneWidget); // invited
    expect(find.text('2'), findsOneWidget); // rewarded
    expect(find.text('1'), findsOneWidget); // pending
    expect(find.text('12,50 TMT'), findsOneWidget);
  });

  testWidgets('never names a reward amount it cannot read', (t) async {
    // ReferralSettings.customerRewardTmt is behind an ADMIN/MANAGER route, so the app has no
    // honest figure to show. Naming one would be a promise the product might not keep (GAP 11).
    await pumpScreen(t);

    final explanation = t.widget<Text>(
      find.textContaining('Размер бонуса устанавливает магазин'),
    );
    expect(explanation.data, isNot(contains('TMT ')));
  });

  testWidgets('offers no way to change the code', (t) async {
    // The code is an account's identity in other people's invitations and, from now on, a number
    // issued in sequence. Letting a customer rewrite it breaks links already sent and burns a
    // number for nothing, so the change moved behind an admin route.
    await pumpScreen(t);

    expect(find.text('Изменить код'), findsNothing);
    expect(find.byType(TextFormField), findsNothing);
  });

  testWidgets('shows the invitation link, not just the code', (t) async {
    // A bare code is something the friend has to be told where to type. The link lands them on
    // /r/<code>, which stores it and carries it through registration.
    await pumpScreen(t);

    expect(find.text('https://gulyaly.pro/r/aygul'), findsOneWidget);
  });
}
