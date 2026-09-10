import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app/app.dart';
import 'app/providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Month names for `ru` and `en`. Without this, the first `DateFormat('d MMM', 'ru')` throws —
  // `intl` ships no locale data until it is loaded. Awaited because it is local work measured in
  // milliseconds, unlike the session restore below.
  await initializeDateFormatting('ru');
  await initializeDateFormatting('en');

  final container = ProviderContainer();

  // Session restore is started, not awaited. Awaiting it would hold the native splash for the
  // duration of an `/auth/me` round-trip — up to the 30s receive timeout on a bad connection —
  // with nothing on screen. Instead the app paints immediately, the router parks on the in-app
  // splash while the status is `unknown`, and moves the moment this resolves.
  unawaited(container.read(authControllerProvider.notifier).restore());

  runApp(
    UncontrolledProviderScope(container: container, child: const GulyalyApp()),
  );
}
