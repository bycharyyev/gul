import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/remote_image.dart';
import '../../../core/widgets/skeleton.dart';
import '../../../core/widgets/status_chip.dart';
import '../../marketplace/domain/marketplace_models.dart';
import '../../marketplace/presentation/marketplace_home_screen.dart';
import '../../marketplace/presentation/marketplace_order_detail_screen.dart';
import '../domain/order.dart';
import 'order_detail_screen.dart';

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  /// Nested under Home rather than a bottom tab: the fifth slot went to conversations, and
  /// orders are reached from a row on the home screen.
  static const pathSegment = 'orders';
  static const path = '/home/orders';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final orders = ref.watch(ordersProvider);
    // Marketplace purchases are orders too, and this is where people look for their orders. They
    // used to be reachable only in the moment right after being placed -- leave that screen and
    // the order existed in the database, was visible to a manager, and could not be found again
    // by the person who placed it.
    final purchases =
        ref.watch(marketplaceOrdersProvider).valueOrNull ?? const [];

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('orders.title'))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(marketplaceOrdersProvider);
          ref.invalidate(ordersProvider);
          await ref.read(ordersProvider.future);
        },
        child: AsyncView<List<OrderSummary>>(
          value: orders,
          onRetry: () => ref.invalidate(ordersProvider),
          skeleton: const _OrdersSkeleton(),
          // Empty means empty of everything: a customer whose only order is a purchase must not
          // be told they have none.
          isEmpty: (list) => list.isEmpty && purchases.isEmpty,
          empty: _EmptyOrders(),
          data: (list) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              16,
              8,
              16,
              AppShell.contentBottomInset,
            ),
            children: [
              for (final purchase in purchases) ...[
                _PurchaseTile(order: purchase),
                const SizedBox(height: 10),
              ],
              for (final order in list) ...[
                OrderTile(order: order),
                const SizedBox(height: 10),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// One row of the history.
///
/// Reads top-down as: what it was, who it was for, when — with the status pill on the right where
/// the eye lands after the amount. The amount uses tabular figures so the column stays aligned
/// down the list instead of wobbling with each digit width.
class OrderTile extends StatelessWidget {
  const OrderTile({super.key, required this.order});

  final OrderSummary order;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final created = order.createdAt;

    return Material(
      color: scheme.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('${OrderDetailScreen.path}/${order.id}'),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // The thumbnail is what tells a top-up from a gift at a glance — and it is purely
                // visual, so the kind is also stated as a semantic label. Without it a screen
                // reader announces the two rows identically.
                Semantics(
                  label: strings.get(
                    order.kind == OrderKind.gallery
                        ? 'orders.kind.gallery'
                        : 'orders.kind.topup',
                  ),
                  child: order.kind == OrderKind.gallery
                      ? RemoteImage(
                          url: order.imageUrl,
                          width: 46,
                          height: 46,
                          fallbackIcon: Icons.card_giftcard_outlined,
                        )
                      : Container(
                          width: 46,
                          height: 46,
                          decoration: BoxDecoration(
                            color: scheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            Icons.phone_iphone_rounded,
                            size: 22,
                            color: scheme.primary,
                          ),
                        ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        order.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                        ),
                      ),
                      if (order.subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          order.subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: scheme.onSurfaceVariant,
                            fontSize: 13,
                          ),
                        ),
                      ],
                      const SizedBox(height: 8),
                      // Wrap, not Row: a long status word next to a long date overflows on a
                      // narrow phone, and Turkmen status words are the longest of the three.
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          StatusChip(status: order.status, dense: true),
                          if (created != null)
                            Text(
                              Dates.dateTime(created, strings.locale),
                              style: TextStyle(
                                color: scheme.onSurfaceVariant,
                                fontSize: 12,
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                // Flexible, not a bare Text: at the largest system text size a four-figure
                // amount plus a long operator name overflows this row by ~130px. Wrapping to a
                // second line is right here -- truncating an amount with an ellipsis would hide
                // digits of a number the customer is checking.
                Flexible(
                  child: Text(
                    Money.tmt(order.amountTmt, strings.locale),
                    textAlign: TextAlign.end,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyOrders extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    // A scroll view so pull-to-refresh still works on the empty state — otherwise the one screen
    // where someone most wants to re-check is the one that cannot be refreshed.
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.6,
          child: EmptyState(
            icon: Icons.receipt_long_outlined,
            title: strings.get('orders.empty.title'),
            message: strings.get('orders.empty.message'),
          ),
        ),
      ],
    );
  }
}

class _OrdersSkeleton extends StatelessWidget {
  const _OrdersSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        16,
        8,
        16,
        AppShell.contentBottomInset,
      ),
      itemCount: 6,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, __) => const Skeleton(height: 94, borderRadius: 16),
    );
  }
}

/// One marketplace purchase in the order history.
///
/// Deliberately its own tile rather than squeezed into [OrderTile]: a purchase has no single
/// price until a manager has quoted it, and forcing it through a row built around an amount would
/// mean printing a zero where the total goes.
class _PurchaseTile extends StatelessWidget {
  const _PurchaseTile({required this.order});

  final MarketplaceOrder order;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final first = order.items.isEmpty ? null : order.items.first;
    final title =
        first?.preview.title ??
        [
          strings.get('marketplace.homeTitle'),
          if (first?.preview.externalId != null) first!.preview.externalId!,
        ].join(' · ');

    return Card(
      clipBehavior: Clip.antiAlias,
      child: ListTile(
        onTap: () => context.push(
          '${MarketplaceHomeScreen.routeBase}/${MarketplaceOrderDetailScreen.pathSegment}/${order.id}',
        ),
        leading: CircleAvatar(
          backgroundColor: scheme.primaryContainer,
          child: Icon(Icons.shopping_bag_outlined, color: scheme.primary),
        ),
        title: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis),
        subtitle: Text(
          [
            strings.get(
              'status.${order.status.toLowerCase()}',
              fallback: order.status,
            ),
            Dates.dateTime(order.createdAt.toLocal(), strings.locale),
          ].join(' · '),
        ),
        trailing: const Icon(Icons.chevron_right_rounded),
      ),
    );
  }
}
