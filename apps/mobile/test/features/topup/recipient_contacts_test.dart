import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/app/providers.dart';
import 'package:gulyaly_mobile/core/contacts/contact_picker.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';
import 'package:gulyaly_mobile/features/home/domain/catalog_service.dart';
import 'package:gulyaly_mobile/features/topup/data/topup_repository.dart';
import 'package:gulyaly_mobile/features/topup/domain/topup_options.dart';
import 'package:gulyaly_mobile/features/topup/presentation/topup_screen.dart';
import 'package:mocktail/mocktail.dart';

class MockTopupRepository extends Mock implements TopupRepository {}

const _phoneService = CatalogService(
  id: 's1',
  code: 'TMCELL',
  name: 'TMCELL',
  inputType: 'PHONE',
  minAmountTmt: 5,
  maxAmountTmt: 500,
  sortOrder: 1,
);

/// A game top-up: the recipient is a player id, which is in nobody's address book.
const _accountService = CatalogService(
  id: 's2',
  code: 'PUBG_UC',
  name: 'PUBG Mobile · UC',
  inputType: 'ACCOUNT_ID',
  minAmountTmt: 10,
  maxAmountTmt: 500,
  sortOrder: 2,
);

const _options = TopupOptions(
  rates: [Rate(currency: 'USD', rate: 0.062)],
  paymentMethods: [
    PaymentMethodOption(
      id: 'pm1',
      code: 'MANUAL',
      name: 'Перевод по реквизитам',
      provider: 'manual',
      feePercent: 0,
      sortOrder: 1,
    ),
  ],
);

void main() {
  late MockTopupRepository repository;

  setUp(() {
    repository = MockTopupRepository();
    when(() => repository.loadOptions(any())).thenAnswer((_) async => _options);
  });

  /// The button is Android-only, so the platform has to be stated rather than inherited from the
  /// host. It is reset inside the test body, not in tearDown: the framework asserts every
  /// foundation override is already unset by the time the body returns.
  Future<void> onAndroid(Future<void> Function() body) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    try {
      await body();
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  }

  Future<void> pump(
    WidgetTester t, {
    required CatalogService service,
    ContactPicker picker = const ContactPicker(),
  }) async {
    when(() => repository.loadServices()).thenAnswer((_) async => [service]);
    t.view.physicalSize = const Size(400, 1600);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);

    await t.pumpWidget(
      ProviderScope(
        overrides: [topupRepositoryProvider.overrideWithValue(repository)],
        child: MaterialApp(
          home: StringsScope(
            strings: const Strings('ru'),
            child: TopupScreen(contactPicker: picker),
          ),
        ),
      ),
    );
    await t.pumpAndSettle();
  }

  testWidgets('a phone field offers the address book', (t) async {
    await onAndroid(() async {
      await pump(t, service: _phoneService);
      expect(find.byIcon(Icons.contacts_outlined), findsOneWidget);
    });
  });

  testWidgets('a game account id does not', (t) async {
    await onAndroid(() async {
      // Offering contacts here would invite pasting a phone number into a field that rejects it.
      await pump(t, service: _accountService);
      expect(find.byIcon(Icons.contacts_outlined), findsNothing);
    });
  });

  testWidgets('the chosen contact lands in the field, cleaned', (t) async {
    await onAndroid(() async {
      const channel = MethodChannel('test/contacts/pick');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            channel,
            (call) async => {'phone': '+993 65 12-34-56', 'name': 'Aman'},
          );
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null),
      );

      await pump(
        t,
        service: _phoneService,
        picker: const ContactPicker(channel: channel),
      );
      await t.tap(find.byIcon(Icons.contacts_outlined));
      await t.pumpAndSettle();

      expect(find.text('+9936512 3456'.replaceAll(' ', '')), findsOneWidget);
    });
  });

  testWidgets('backing out of the picker leaves a typed number alone', (
    t,
  ) async {
    await onAndroid(() async {
      const channel = MethodChannel('test/contacts/cancel');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async => null);
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null),
      );

      await pump(
        t,
        service: _phoneService,
        picker: const ContactPicker(channel: channel),
      );
      await t.enterText(find.byType(TextFormField).first, '+99365000111');
      await t.pumpAndSettle();

      await t.tap(find.byIcon(Icons.contacts_outlined));
      await t.pumpAndSettle();

      expect(find.text('+99365000111'), findsOneWidget);
    });
  });
}
