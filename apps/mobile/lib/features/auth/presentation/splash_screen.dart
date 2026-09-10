import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/brand_mark.dart';
import 'auth_controller.dart';

/// Shown while the stored session is validated against `/auth/me`.
///
/// Usually it routes nowhere itself — the guard moves off it the moment the status resolves. The
/// exception is [AuthStatus.unreachable], where nothing answered: the session is unverified
/// rather than over, so this screen stops being a spinner and becomes a retry. That is the whole
/// reason it is a `ConsumerWidget` — parking here with no way forward would be a dead end, and
/// sending the person to the login form would take a password for a session they still have.
class SplashScreen extends ConsumerWidget {
  const SplashScreen({super.key});

  static const path = '/';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final unreachable =
        ref.watch(authControllerProvider.select((s) => s.status)) ==
        AuthStatus.unreachable;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const BrandMark(size: 92),
                const SizedBox(height: 28),
                if (!unreachable)
                  const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.4),
                  )
                else ...[
                  Text(
                    strings.get('splash.unreachable'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    strings.get('splash.unreachable.hint'),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      height: 1.4,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  // Which host it actually tried, outside production only. A debug build with no
                  // --dart-define quietly targets the emulator's loopback, which on a real phone
                  // looks exactly like an outage; naming the address turns that into a one-glance
                  // diagnosis. Never shown in production: customers cannot act on it.
                  if (!ref.watch(appConfigProvider).isProduction) ...[
                    const SizedBox(height: 10),
                    Text(
                      ref.watch(appConfigProvider).apiBaseUrl,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        fontFeatures: const [FontFeature.tabularFigures()],
                        color: Theme.of(
                          context,
                        ).colorScheme.onSurfaceVariant.withValues(alpha: 0.7),
                      ),
                    ),
                  ],
                  const SizedBox(height: 22),
                  FilledButton(
                    onPressed: () =>
                        ref.read(authControllerProvider.notifier).restore(),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(160, 48),
                      shape: const StadiumBorder(),
                    ),
                    child: Text(strings.get('common.retry')),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
