import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/l10n/strings.dart';
import '../core/theme/app_theme.dart';
import '../core/widgets/crystal.dart';
import '../core/widgets/remote_image.dart';
import 'providers.dart';

/// The signed-in frame: a floating, rounded navigation bar over the content.
///
/// The previous bar was Material's stock `NavigationBar` — a full-width slab pinned to the bottom
/// edge with a hard top line. Correct, and severe. This one floats: a pill inset from the edges,
/// frosted, with a soft shadow, and a pill-shaped indicator that slides between destinations
/// instead of appearing under them.
///
/// Five destinations, Material's cap for a bottom bar. Every one keeps its label: icon-only
/// navigation reliably fails discoverability testing, and the selected state is carried by shape,
/// weight *and* colour so it survives a grayscale screenshot.
///
/// The profile destination shows the customer's **own avatar** when they have one. A face is
/// recognised faster than any glyph, and it answers "am I signed in as me" without a tap.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final avatarUrl = ref.watch(authControllerProvider).user?.avatarUrl;

    final destinations = [
      _Destination(
        Icons.home_outlined,
        Icons.home_rounded,
        strings.get('nav.home'),
      ),
      _Destination(
        Icons.play_circle_outline_rounded,
        Icons.play_circle_fill_rounded,
        strings.get('nav.feed'),
      ),
      _Destination(
        Icons.local_florist_outlined,
        Icons.local_florist_rounded,
        strings.get('nav.gallery'),
      ),
      _Destination(
        Icons.forum_outlined,
        Icons.forum_rounded,
        strings.get('nav.chats'),
        // Unread rides the destination rather than the screen: the number has to be right on
        // every tab, not only while the list is open.
        badge: ref.watch(chatUnreadProvider).valueOrNull ?? 0,
      ),
      _Destination(
        Icons.person_outline_rounded,
        Icons.person_rounded,
        strings.get('nav.profile'),
        avatarUrl: avatarUrl,
      ),
    ];

    return Scaffold(
      // The bar floats over content rather than displacing it, so the list scrolls behind the
      // glass. Screens add their own bottom padding for it -- see `AppShell.contentBottomInset`.
      extendBody: true,
      body: navigationShell,
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
          child: FrostedSurface(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
              child: Row(
                children: [
                  for (var i = 0; i < destinations.length; i++)
                    Expanded(
                      child: _NavItem(
                        destination: destinations[i],
                        selected: navigationShell.currentIndex == i,
                        // Re-tapping the current tab pops that branch to its root, which is what
                        // people expect from tapping where they already are.
                        onTap: () => navigationShell.goBranch(
                          i,
                          initialLocation: i == navigationShell.currentIndex,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// How much room a scrolling screen must leave at the bottom so its last row is not hidden
  /// behind the floating bar. One constant, so no screen guesses.
  static const double contentBottomInset = 96;
}

class _Destination {
  const _Destination(
    this.icon,
    this.selectedIcon,
    this.label, {
    this.badge = 0,
    this.avatarUrl,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;

  /// Unread items behind this destination. Zero draws nothing.
  final int badge;
  final String? avatarUrl;
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.destination,
    required this.selected,
    required this.onTap,
  });

  final _Destination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = selected ? scheme.primary : scheme.onSurfaceVariant;

    return Semantics(
      selected: selected,
      button: true,
      label: destination.label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
        child: AnimatedContainer(
          // Short and eased: this is feedback on a tap, not a transition between places.
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            // The selected pill, which is what replaces the old bar's hard indicator line.
            color: selected
                ? scheme.primary.withValues(alpha: 0.12)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(AppTheme.radiusPill),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // The avatar replaces the glyph only when there is a photo. Otherwise the person
              // icon stays -- an empty circle would read as a broken image.
              if (destination.avatarUrl != null)
                Container(
                  padding: const EdgeInsets.all(1.5),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: selected ? scheme.primary : Colors.transparent,
                      width: 1.5,
                    ),
                  ),
                  child: RemoteImage(
                    url: destination.avatarUrl,
                    width: 21,
                    height: 21,
                    borderRadius: 999,
                    fallbackIcon: Icons.person_rounded,
                  ),
                )
              else
                // The badge overlays the glyph rather than sitting beside it: the bar gives each
                // destination a fixed share of the width, and widening one would shift the rest.
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Icon(
                      selected ? destination.selectedIcon : destination.icon,
                      size: 23,
                      color: color,
                    ),
                    if (destination.badge > 0)
                      Positioned(
                        right: -6,
                        top: -3,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 4,
                            vertical: 1,
                          ),
                          constraints: const BoxConstraints(minWidth: 15),
                          decoration: BoxDecoration(
                            color: scheme.error,
                            borderRadius: BorderRadius.circular(9),
                          ),
                          child: Text(
                            destination.badge > 99
                                ? '99+'
                                : '${destination.badge}',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 9.5,
                              height: 1.2,
                              fontWeight: FontWeight.w700,
                              color: scheme.onError,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              const SizedBox(height: 3),
              Text(
                destination.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: color,
                  fontSize: 10.5,
                  height: 1.1,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
