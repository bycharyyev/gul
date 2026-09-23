import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/crystal.dart';
import '../../../core/widgets/skeleton.dart';
import '../../../core/widgets/status_chip.dart';
import '../domain/cargo_models.dart';
import 'create_shipment_screen.dart';
import '../../marketplace/presentation/marketplace_home_screen.dart';
import '../../marketplace/presentation/widgets/marketplace_quick_add.dart';
import 'widgets/cargo_banner_card.dart';
import 'shipment_detail_screen.dart';

final _myShipmentsProvider = FutureProvider.autoDispose<List<Shipment>>(
  (ref) => ref.watch(cargoRepositoryProvider).loadMine(),
);

class CargoHomeScreen extends ConsumerWidget {
  const CargoHomeScreen({super.key});

  static const path = 'cargo';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final shipments = ref.watch(_myShipmentsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('cargo.title'))),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(_myShipmentsProvider.future),
        child: AsyncView<List<Shipment>>(
          value: shipments,
          onRetry: () => ref.invalidate(_myShipmentsProvider),
          skeleton: const _Skeleton(),
          data: (list) => _Content(shipments: list),
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.shipments});

  final List<Shipment> shipments;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        16,
        16,
        16,
        AppShell.contentBottomInset,
      ),
      children: [
        const CargoBannerCard(),
        // Cargo does two jobs, and which one a person needs depends on whether they already own
        // the goods. A single "Отправить" button answered only the first and left buying to a
        // banner on the app's home screen, where it read as an unrelated product. Two peers,
        // each saying in one line who it is for, so the choice is made before anything is typed.
        //
        // No separate "track" button: every shipment in the list below opens its own timeline
        // when tapped, so a lookup-by-number screen was a second door to the same room. The
        // TrackScreen route itself stays -- a tracking number shared with a recipient who has no
        // account still has to resolve somewhere.
        Text(
          strings.get('cargo.chooseService'),
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 10),
        _ServiceCard(
          icon: Icons.local_shipping_outlined,
          title: strings.get('cargo.sendTitle'),
          subtitle: strings.get('cargo.sendSubtitle'),
          onTap: () => context.push(
            '/home/${CargoHomeScreen.path}/${CreateShipmentScreen.path}',
          ),
        ),
        const SizedBox(height: 10),
        // Buying is not behind a tap: the link field is right here, because pasting a product
        // link IS the first step and making people navigate to reach it was the whole complaint.
        // The list of purchases still has its own screen, reached from the card once there is
        // something in the basket.
        const MarketplaceQuickAdd(),
        const SizedBox(height: 12),
        // The way back to a purchase already placed. Its list screen existed and was routable,
        // but nothing in the app ever navigated to it: after leaving the detail screen the order
        // was in the database, visible to a manager, and unreachable by the person who placed it.
        const _MyPurchasesLink(),
        const SizedBox(height: 24),
        Text(
          strings.get('cargo.myShipments'),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 12),
        if (shipments.isEmpty)
          CrystalSurface(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                strings.get('cargo.noShipments'),
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          )
        else
          ...shipments.map(
            (s) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: () => context.push(
                  '/home/${CargoHomeScreen.path}/${ShipmentDetailScreen.pathSegment}/${s.id}',
                ),
                child: CrystalSurface(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                s.publicTrackingNumber,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontFeatures: [FontFeature.tabularFigures()],
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                '${s.originCity.name} → ${s.destinationCity.name}',
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
                        StatusChip(status: s.status),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        16,
        16,
        16,
        AppShell.contentBottomInset,
      ),
      children: const [
        // Two service cards, matching what actually loads -- a single button-shaped bar here
        // made the list jump the moment real content arrived.
        Skeleton(height: 18, width: 120, borderRadius: 6),
        SizedBox(height: 10),
        Skeleton(height: 76, borderRadius: 18),
        SizedBox(height: 10),
        Skeleton(height: 76, borderRadius: 18),
        SizedBox(height: 24),
        Skeleton(height: 20, width: 140, borderRadius: 6),
        SizedBox(height: 12),
        Skeleton(height: 72, borderRadius: 18),
        SizedBox(height: 10),
        Skeleton(height: 72, borderRadius: 18),
      ],
    );
  }
}

/// One of Cargo's two services. Deliberately a card and not a button: a button says "do this",
/// which is wrong when there are two equally valid things to do and the right one depends on
/// something only the customer knows.
class _ServiceCard extends StatelessWidget {
  const _ServiceCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: CrystalSurface(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: scheme.primary.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(icon, color: scheme.primary, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 12.5,
                        height: 1.35,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}

/// A row into the customer's own marketplace purchases, shown only once there are some.
class _MyPurchasesLink extends ConsumerWidget {
  const _MyPurchasesLink();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final purchases =
        ref.watch(marketplaceOrdersProvider).valueOrNull ?? const [];
    if (purchases.isEmpty) return const SizedBox.shrink();

    return CrystalSurface(
      child: ListTile(
        onTap: () => context.push(MarketplaceHomeScreen.routeBase),
        leading: Icon(Icons.receipt_long_outlined, color: scheme.primary),
        title: Text(
          strings.get('marketplace.myOrders'),
          style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700),
        ),
        subtitle: Text('${purchases.length}'),
        trailing: const Icon(Icons.chevron_right_rounded),
      ),
    );
  }
}
