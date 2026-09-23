import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app/app.dart';
import 'app/providers.dart';
import 'app/router.dart';
import 'core/firebase/app_health.dart';
import 'core/firebase/remote_app_config.dart';
import 'core/notifications/push_repository.dart';
import 'core/notifications/push_service.dart';
import 'features/auth/presentation/auth_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Locked to portrait: the catalog, topup wizard, chat and every other screen are laid out for
  // it, none of them adapt to landscape, and letting the phone's auto-rotate flip the app while
  // browsing broke that UI rather than improving anything. Explicit, not decorative: with no call
  // here at all, a single screen that once asked for its own orientation (a barcode scanner, a
  // fullscreen video) would leave that restriction on the whole app for the rest of the session,
  // because Flutter has no other place that ever resets it back. This runs once, before anything
  // else can set one, so any such screen-specific override still gets undone when that screen
  // closes rather than sticking.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Month names for `ru` and `en`. Without this, the first `DateFormat('d MMM', 'ru')` throws —
  // `intl` ships no locale data until it is loaded. Awaited because it is local work measured in
  // milliseconds, unlike the session restore below.
  await initializeDateFormatting('ru');
  await initializeDateFormatting('en');

  // Crash reporting first, so a failure in anything below is recorded. Remote config is not
  // awaited: the app paints on its defaults and picks the fetched values up when they arrive.
  await AppHealth.initialize();
  unawaited(RemoteAppConfigService.instance.initialize());

  final container = ProviderContainer();

  final push = PushService(
    repository: PushRepository(container.read(apiClientProvider)),
    onRoute: (route) => container.read(routerProvider).go(route),
  );
  await push.initialize();
  container.listen<AuthState>(authControllerProvider, (previous, next) {
    if (next.status == AuthStatus.authenticated &&
        previous?.status != AuthStatus.authenticated) {
      // Firebase receives only the opaque backend id, never the profile's phone or name.
      unawaited(AppHealth.identify(next.user?.id));
      unawaited(push.syncForAuthenticatedUser());
    }
    if (next.status == AuthStatus.unauthenticated &&
        previous?.status != AuthStatus.unauthenticated) {
      unawaited(AppHealth.identify(null));
    }
  });
  // Detach the device while the session is still valid: by the time the status flips to signed
  // out the credentials are gone and the request would be rejected.
  container.read(authControllerProvider.notifier).beforeSignOut =
      push.unregister;

  // Session restore is started, not awaited. Awaiting it would hold the native splash for the
  // duration of an `/auth/me` round-trip — up to the 30s receive timeout on a bad connection —
  // with nothing on screen. Instead the app paints immediately, the router parks on the in-app
  // splash while the status is `unknown`, and moves the moment this resolves.
  unawaited(container.read(authControllerProvider.notifier).restore());

  runApp(
    UncontrolledProviderScope(container: container, child: const GulyalyApp()),
  );
}
