import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/l10n/strings.dart';
import '../../orders/presentation/orders_screen.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/crystal.dart';
import '../../../core/widgets/skeleton.dart';
import '../../gallery/presentation/product_screen.dart';
import '../../topup/presentation/topup_screen.dart';
import '../data/home_repository.dart';
import '../domain/promo.dart';
import 'widgets/promo_carousel.dart';
import 'widgets/services_grid.dart';
import 'widgets/stories_row.dart';

/// Home, rebuilt.
///
/// What changed and why:
///
/// * **the referral balance card is gone.** It was the loudest thing on the screen and it is not
///   what anyone opens the app to do. Referrals now live in one place — the profile — instead of
///   being half here and half there;
/// * **the banner is the hero**, advancing on its own, because that is the surface the shop
///   actually merchandises with;
/// * **stories are their own shape**, a row of tall cards rather than a second carousel that
///   looked identical to the first;
/// * **operators come last**, as a quiet grid. They are a destination people already know they
///   want, not something that needs selling.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  static const path = '/home';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final home = ref.watch(homeProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () => ref.refresh(homeProvider.future),
          child: AsyncView<HomeSnapshot>(
            value: home,
            onRetry: () => ref.invalidate(homeProvider),
            skeleton: const _HomeSkeleton(),
            data: (snapshot) => _HomeContent(snapshot: snapshot),
          ),
        ),
      ),
    );
  }
}

class _HomeContent extends ConsumerWidget {
  const _HomeContent({required this.snapshot});

  final HomeSnapshot snapshot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final user = ref.watch(authControllerProvider).user;
    final name = _firstName(user?.fullName) ?? user?.username;

    return ListView(
      // `always`, so pull-to-refresh works even when the content is shorter than the viewport.
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: AppShell.contentBottomInset),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                strings.get('home.greeting'),
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                name ?? strings.get('app.title'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.8,
                  height: 1.1,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Hidden entirely when there is nothing to show, rather than leaving an empty band where
        // a banner used to be.
        if (snapshot.slides.isNotEmpty)
          PromoCarousel(
            promos: snapshot.slides,
            onTap: (promo) => _openPromo(context, ref, promo),
          ),

        if (snapshot.stories.isNotEmpty) ...[
          // Tighter than the gap between the other sections: the carousel already carries its
          // own controls row underneath, so a full section gap here left the heading floating
          // far below the banner it follows.
          const SizedBox(height: 14),
          _SectionHeader(title: strings.get('home.stories')),
          const SizedBox(height: 14),
          StoriesRow(
            stories: snapshot.stories,
            onTap: (story) => StoryViewer.show(
              context,
              story: story,
              onOpen: _destinationFor(story) == null
                  ? null
                  : () => _openPromo(context, ref, story),
            ),
          ),
        ],

        const SizedBox(height: 30),
        _SectionHeader(title: strings.get('home.services')),
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: snapshot.services.isEmpty
              // Not an error and not a blank space: the catalogue is simply empty right now.
              ? CrystalSurface(
                  child: Text(
                    strings.get('home.services.empty'),
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                )
              : ServicesGrid(
                  services: snapshot.services,
                  onTap: (service) =>
                      context.go('${TopupScreen.path}?serviceId=${service.id}'),
                ),
        ),

        const SizedBox(height: 24),
        // Orders moved here when the fifth bottom tab went to conversations. On the home screen
        // rather than buried in the profile: it is the row people come back to the app for.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: InkWell(
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
            onTap: () => context.push(OrdersScreen.path),
            child: CrystalSurface(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Icon(
                      Icons.receipt_long_outlined,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        strings.get('home.myOrders'),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    Icon(
                      Icons.chevron_right_rounded,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),

        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: InkWell(
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
            onTap: () => context.push('${HomeScreen.path}/cargo'),
            child: CrystalSurface(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Icon(
                      Icons.local_shipping_outlined,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            strings.get('cargo.homeCardTitle'),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          Text(
                            strings.get('cargo.homeCardSubtitle'),
                            style: TextStyle(
                              fontSize: 12.5,
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Icon(
                      Icons.chevron_right_rounded,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  static String? _firstName(String? fullName) {
    final first = (fullName ?? '').trim().split(RegExp(r'\s+')).first;
    return first.isEmpty ? null : first;
  }

  /// Where a promo leads, or null when it leads nowhere. One function, so the card, the story
  /// viewer and the tap handler all agree on whether an action exists.
  static String? _destinationFor(Promo promo) => switch (promo.linkType) {
    PromoLinkType.service when promo.serviceId != null =>
      '${TopupScreen.path}?serviceId=${promo.serviceId}',
    PromoLinkType.galleryProduct when promo.galleryProductId != null =>
      '${ProductScreen.path}/${promo.galleryProductId}',
    _ => null,
  };

  void _openPromo(BuildContext context, WidgetRef ref, Promo promo) {
    final destination = _destinationFor(promo);
    if (destination != null) {
      context.go(destination);
      return;
    }

    // An external URL has no in-app destination. Rather than a dead tap, it opens where it
    // belongs — outside the app — and says so if that fails.
    if (promo.linkType == PromoLinkType.external && promo.externalUrl != null) {
      ref.read(externalLinksProvider).open(context, promo.externalUrl!);
    }
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 20),
    child: Text(
      title,
      style: const TextStyle(
        fontSize: 19,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4,
      ),
    ),
  );
}

/// Mirrors the loaded layout's shape, so nothing moves when the data arrives.
class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: AppShell.contentBottomInset),
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Skeleton(height: 14, width: 110, borderRadius: 6),
              SizedBox(height: 10),
              Skeleton(height: 28, width: 190, borderRadius: 8),
            ],
          ),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 21),
          child: Skeleton(height: 190, borderRadius: AppTheme.radiusLarge),
        ),
        const SizedBox(height: 30),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: Skeleton(height: 20, width: 130, borderRadius: 6),
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: StoriesRow.height,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: 4,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, __) => const Skeleton(
              height: StoriesRow.height,
              width: 124,
              borderRadius: AppTheme.radiusLarge,
            ),
          ),
        ),
        const SizedBox(height: 30),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: Skeleton(height: 20, width: 120, borderRadius: 6),
        ),
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 3,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 0.92,
            children: List.generate(
              6,
              (_) => const Skeleton(
                height: 104,
                borderRadius: AppTheme.radiusMedium,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
