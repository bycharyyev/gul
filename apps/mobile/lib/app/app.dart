import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/l10n/strings.dart';
import '../core/sharing/shared_text.dart';
import '../core/widgets/crystal.dart';
import '../core/theme/app_theme.dart';
import '../features/auth/presentation/auth_controller.dart';
import '../features/cargo/presentation/cargo_home_screen.dart';
import '../features/chat/presentation/chat_inbox_screen.dart';
import '../features/chat/presentation/join_group_screen.dart';
import '../features/home/presentation/home_screen.dart';
import 'providers.dart';
import 'router.dart';

class GulyalyApp extends ConsumerWidget {
  const GulyalyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = ref.watch(stringsProvider);

    // A link shared into the app opens the screen that can act on it. Two triggers, because a
    // share and a sign-in can happen in either order: someone who shares a product while signed
    // out lands on the login screen, and the link is still waiting when they get through it.
    void openSharedLink() {
      final link = ref.read(sharedLinkProvider);
      if (link == null) return;
      if (ref.read(authControllerProvider).status != AuthStatus.authenticated) {
        return;
      }
      // Our own invite link means the opposite of a marketplace one: it leads to a group, not to
      // a buying form. Consumed here rather than left for the cargo screen, which would open the
      // wrong thing over it.
      final invite = groupInviteCodeIn(
        link,
        ref.read(appConfigProvider).siteBaseUrl,
      );
      if (invite != null) {
        ref.read(sharedLinkProvider.notifier).clear();
        ref
            .read(routerProvider)
            .go(
              '${ChatInboxScreen.path}/${JoinGroupScreen.pathSegment}/$invite',
            );
        return;
      }
      ref.read(routerProvider).go('${HomeScreen.path}/${CargoHomeScreen.path}');
    }

    ref.listen<String?>(sharedLinkProvider, (_, __) => openSharedLink());
    ref.listen<AuthState>(authControllerProvider, (_, __) => openSharedLink());

    return MaterialApp.router(
      title: 'Gulyaly',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      routerConfig: ref.watch(routerProvider),
      // Material's own widgets follow `materialLocale` (tkm → ru); app copy follows `strings`.
      locale: strings.materialLocale,
      supportedLocales: const [Locale('ru'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // The ambient ground is painted once, here, rather than per screen: one gradient for the
      // whole app, and nothing re-paints when a route changes.
      builder: (context, child) => StringsScope(
        strings: strings,
        child: AmbientBackground(child: child ?? const SizedBox.shrink()),
      ),
    );
  }
}
