import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/remote_image.dart';
import '../../../core/widgets/skeleton.dart';
import '../../gallery/presentation/product_screen.dart';
import '../../gallery/presentation/widgets/product_card.dart';
import '../domain/shop_profile.dart';

/// A seller's own page, reached from their post in the feed.
///
/// The missing half of a commerce feed: someone could watch a shop's video, like it, and have
/// nowhere to go. The profile and the products arrive from two endpoints, and the header does not
/// wait for the shelves — a shop with fifty products should show whose shop it is immediately.
class ShopScreen extends ConsumerWidget {
  const ShopScreen({super.key, required this.handle});
  static const pathSegment = 'shop';
  static String pathFor(String handle) => '/$pathSegment/$handle';

  final String handle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final shop = ref.watch(shopProvider(handle));
    return Scaffold(
      appBar: AppBar(
        title: Text(
          shop.value?.shopName ?? strings.get('shop.title'),
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: AsyncView<ShopProfile>(
        value: shop,
        skeleton: const _Loading(),
        onRetry: () => ref.invalidate(shopProvider(handle)),
        data: (profile) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(shopProvider(handle));
            ref.invalidate(shopProductsProvider(profile.id));
          },
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: _Header(profile: profile)),
              _Products(sellerId: profile.id),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.profile});
  final ShopProfile profile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ClipOval(
                child: RemoteImage(
                  url: profile.logoUrl,
                  width: 64,
                  height: 64,
                  borderRadius: 0,
                  fallbackIcon: Icons.storefront_outlined,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      profile.shopName,
                      style: theme.textTheme.titleLarge,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      '@${profile.handle}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.outline,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (profile.description?.isNotEmpty == true) ...[
            const SizedBox(height: 12),
            Text(profile.description!, style: theme.textTheme.bodyMedium),
          ],
          const SizedBox(height: 16),
          Text(
            Strings.of(context).get('shop.products'),
            style: theme.textTheme.titleMedium,
          ),
        ],
      ),
    );
  }
}

class _Products extends ConsumerWidget {
  const _Products({required this.sellerId});
  final String sellerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(shopProductsProvider(sellerId));
    return products.when(
      loading: () => const SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Skeleton(height: 180),
        ),
      ),
      // The shelves failing is not the page failing. The shop, its name and its description are
      // already on screen and stay there; only this strip says it could not load.
      error: (_, __) => SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(Strings.of(context).get('err.unknown')),
        ),
      ),
      data: (list) {
        if (list.isEmpty) {
          return SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              child: Text(
                Strings.of(context).get('shop.empty'),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.outline,
                ),
              ),
            ),
          );
        }
        return SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          sliver: SliverGrid(
            // Same sizing rule as the catalogue: the cell grows with the system text size instead
            // of holding an aspect ratio that only ever fit at 1x.
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              mainAxisExtent: 130 + MediaQuery.textScalerOf(context).scale(104),
            ),
            delegate: SliverChildBuilderDelegate(
              (context, i) => ProductCard(
                product: list[i],
                onTap: () =>
                    context.push('${ProductScreen.path}/${list[i].id}'),
              ),
              childCount: list.length,
            ),
          ),
        );
      },
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Skeleton(height: 64, width: 64, borderRadius: 32),
        SizedBox(height: 16),
        Skeleton(height: 20, width: 180),
        SizedBox(height: 24),
        Skeleton(height: 180),
      ],
    ),
  );
}
