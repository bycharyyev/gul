import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/crystal.dart';
import 'create_marketplace_order_screen.dart';
import 'marketplace_order_detail_screen.dart';

class MarketplaceHomeScreen extends ConsumerWidget {
  const MarketplaceHomeScreen({super.key});
  static const path = 'marketplace';

  /// Buying is a Cargo service, so its routes live under Cargo. Built from one constant because
  /// three screens push into this subtree and they were hardcoded to the old top-level path --
  /// which silently became a dead route the moment it moved.
  static const routeBase = '/home/cargo/$path';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(strings.get('marketplace.title'))),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(marketplaceOrdersProvider.future),
        child: AsyncView(
          value: ref.watch(marketplaceOrdersProvider),
          onRetry: () => ref.invalidate(marketplaceOrdersProvider),
          skeleton: const Center(child: CircularProgressIndicator()),
          data: (orders) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
            children: [
              Text(strings.get('marketplace.intro')),
              const SizedBox(height: 16),
              // In the list, not a FloatingActionButton: the app shell draws a bottom navigation
              // bar over that corner, so the only way to act on "add your first link" was hidden
              // behind it.
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () => context.push(
                    '$routeBase/${CreateMarketplaceOrderScreen.path}',
                  ),
                  icon: const Icon(Icons.add_link_rounded),
                  label: Text(strings.get('marketplace.new')),
                ),
              ),
              const SizedBox(height: 18),
              if (orders.isEmpty)
                CrystalSurface(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(strings.get('marketplace.empty')),
                  ),
                )
              else
                ...orders.map(
                  (order) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: CrystalSurface(
                      onTap: () => context.push(
                        '$routeBase/${MarketplaceOrderDetailScreen.pathSegment}/${order.id}',
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                        ),
                        title: Text(
                          '${strings.get('marketplace.order')} #${order.id}',
                        ),
                        subtitle: Text(
                          '${order.items.length} · ${order.expectedAmount.toStringAsFixed(2)} ${order.currency}',
                        ),
                        trailing: Text(
                          strings.get(
                            'status.${order.status.toLowerCase()}',
                            fallback: order.status,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
