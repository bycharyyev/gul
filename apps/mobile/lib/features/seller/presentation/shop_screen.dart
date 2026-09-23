import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/remote_image.dart';
import '../../../core/widgets/skeleton.dart';
import '../../gallery/domain/gallery_product.dart';
import '../../gallery/presentation/product_screen.dart';
import '../../gallery/presentation/widgets/product_card.dart';
import '../../social/domain/social_post.dart';
import '../../social/presentation/shop_posts_screen.dart';
import '../domain/shop_profile.dart';

/// A seller's own page, reached from their post in the feed.
///
/// Instagram-shaped on purpose: a header that says whose shop this is and how much is here,
/// before either tab has loaded a single row, then two horizontal tabs -- what they've posted,
/// and what they sell -- so watching and shopping share one page instead of competing for it.
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
            await ref
                .read(shopFeedControllerProvider(handle).notifier)
                .refresh();
          },
          child: _ShopBody(profile: profile),
        ),
      ),
    );
  }
}

class _ShopBody extends StatelessWidget {
  const _ShopBody({required this.profile});
  final ShopProfile profile;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return DefaultTabController(
      length: 2,
      child: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) => [
          SliverOverlapAbsorber(
            handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context),
            sliver: SliverToBoxAdapter(child: _Header(profile: profile)),
          ),
          SliverPersistentHeader(
            pinned: true,
            delegate: _StickyTabBar(
              TabBar(
                tabs: [
                  Tab(text: strings.get('shop.tab.posts')),
                  Tab(text: strings.get('shop.tab.products')),
                ],
              ),
            ),
          ),
        ],
        body: TabBarView(
          children: [
            _PostsTab(handle: profile.handle),
            _ProductsTab(sellerId: profile.id),
          ],
        ),
      ),
    );
  }
}

class _StickyTabBar extends SliverPersistentHeaderDelegate {
  _StickyTabBar(this.tabBar);
  final TabBar tabBar;

  @override
  double get minExtent => tabBar.preferredSize.height;
  @override
  double get maxExtent => tabBar.preferredSize.height;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) => ColoredBox(
    color: Theme.of(context).scaffoldBackgroundColor,
    child: tabBar,
  );

  @override
  bool shouldRebuild(covariant _StickyTabBar oldDelegate) =>
      tabBar != oldDelegate.tabBar;
}

class _Header extends StatelessWidget {
  const _Header({required this.profile});
  final ShopProfile profile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = Strings.of(context);
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
                  width: 72,
                  height: 72,
                  borderRadius: 0,
                  fallbackIcon: Icons.storefront_outlined,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Row(
                  children: [
                    _Stat(
                      value: profile.postCount,
                      label: strings.get('shop.stats.posts'),
                    ),
                    const SizedBox(width: 20),
                    _Stat(
                      value: profile.productCount,
                      label: strings.get('shop.stats.products'),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
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
          if (profile.description?.isNotEmpty == true) ...[
            const SizedBox(height: 10),
            Text(profile.description!, style: theme.textTheme.bodyMedium),
          ],
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});
  final int value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Text(
          '$value',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.outline,
          ),
        ),
      ],
    );
  }
}

/// The shop's own timeline, an Instagram-style grid of squares -- always the shop's own
/// chronological order, so every visitor sees the same thing.
class _PostsTab extends ConsumerWidget {
  const _PostsTab({required this.handle});
  final String handle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final feed = ref.watch(shopFeedControllerProvider(handle));
    return Builder(
      builder: (context) => CustomScrollView(
        slivers: [
          SliverOverlapInjector(
            handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context),
          ),
          feed.when(
            loading: () => const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Skeleton(height: 220),
              ),
            ),
            error: (_, __) => SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(strings.get('err.unknown')),
              ),
            ),
            data: (state) {
              final posts = state.posts;
              if (posts.isEmpty) {
                return SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 24, 16, 32),
                    child: Text(
                      strings.get('shop.postsEmpty'),
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                  ),
                );
              }
              return SliverPadding(
                padding: const EdgeInsets.fromLTRB(1, 1, 1, 32),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    crossAxisSpacing: 2,
                    mainAxisSpacing: 2,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, i) => _PostThumb(
                      post: posts[i],
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) =>
                              ShopPostsScreen(handle: handle, initialIndex: i),
                        ),
                      ),
                    ),
                    childCount: posts.length,
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _PostThumb extends StatelessWidget {
  const _PostThumb({required this.post, required this.onTap});
  final SocialPost post;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (post.kind == SocialPostKind.text) {
      return InkWell(
        onTap: onTap,
        child: _TextThumb(text: post.text ?? ''),
      );
    }
    final thumbUrl = post.kind == SocialPostKind.video
        ? (post.thumbnailUrl ?? post.mediaUrl)
        : post.mediaUrl;
    return InkWell(
      onTap: onTap,
      child: Stack(
        fit: StackFit.expand,
        children: [
          RemoteImage(
            url: thumbUrl,
            width: double.infinity,
            height: double.infinity,
            borderRadius: 0,
            fallbackIcon: Icons.image_outlined,
          ),
          if (post.kind == SocialPostKind.video)
            const Positioned(
              right: 5,
              top: 5,
              child: Icon(
                Icons.play_arrow_rounded,
                color: Colors.white,
                size: 18,
                shadows: [Shadow(blurRadius: 5)],
              ),
            ),
        ],
      ),
    );
  }
}

class _TextThumb extends StatelessWidget {
  const _TextThumb({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(10),
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF2A2140), Color(0xFF120F1A)],
      ),
    ),
    alignment: Alignment.center,
    child: Text(
      text,
      maxLines: 5,
      overflow: TextOverflow.ellipsis,
      textAlign: TextAlign.center,
      style: const TextStyle(color: Colors.white, fontSize: 11, height: 1.3),
    ),
  );
}

/// The shop's shelf, filterable by category once there is more than one on it.
class _ProductsTab extends ConsumerStatefulWidget {
  const _ProductsTab({required this.sellerId});
  final String sellerId;

  @override
  ConsumerState<_ProductsTab> createState() => _ProductsTabState();
}

class _ProductsTabState extends ConsumerState<_ProductsTab> {
  /// Null means "all categories". Filtering happens client-side, over the shop's own products --
  /// a shop's shelf is small enough that a second, server-side request would only add a round
  /// trip for the same result the list already has.
  String? _categoryId;

  List<_CategoryOption> _categoriesIn(List<GalleryProduct> products) {
    final seen = <String>{};
    final options = <_CategoryOption>[];
    for (final product in products) {
      final id = product.categoryId;
      if (id == null || !seen.add(id)) continue;
      options.add(_CategoryOption(id, product.categoryName ?? ''));
    }
    return options;
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final products = ref.watch(shopProductsProvider(widget.sellerId));
    return Builder(
      builder: (context) => CustomScrollView(
        slivers: [
          SliverOverlapInjector(
            handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context),
          ),
          ...products.when(
            loading: () => [
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Skeleton(height: 180),
                ),
              ),
            ],
            // The shelves failing is not the page failing. The shop, its name and its description
            // are already on screen and stay there; only this strip says it could not load.
            error: (_, __) => [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(strings.get('err.unknown')),
                ),
              ),
            ],
            data: (list) {
              final categories = _categoriesIn(list);
              final selected = _categoryId;
              final filtered = selected == null
                  ? list
                  : list.where((p) => p.categoryId == selected).toList();
              return [
                if (categories.isNotEmpty)
                  SliverToBoxAdapter(
                    child: _CategoryFilterStrip(
                      categories: categories,
                      selectedId: _categoryId,
                      onSelected: (id) => setState(() => _categoryId = id),
                    ),
                  ),
                if (filtered.isEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                      child: Text(
                        strings.get('shop.empty'),
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.outline,
                        ),
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                    sliver: SliverGrid(
                      // Same sizing rule as the catalogue: the cell grows with the system text
                      // size instead of holding an aspect ratio that only ever fit at 1x.
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        mainAxisExtent:
                            130 + MediaQuery.textScalerOf(context).scale(104),
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, i) => ProductCard(
                          product: filtered[i],
                          onTap: () => context.push(
                            '${ProductScreen.path}/${filtered[i].id}',
                          ),
                        ),
                        childCount: filtered.length,
                      ),
                    ),
                  ),
              ];
            },
          ),
        ],
      ),
    );
  }
}

class _CategoryOption {
  const _CategoryOption(this.id, this.name);
  final String id;
  final String name;
}

class _CategoryFilterStrip extends StatelessWidget {
  const _CategoryFilterStrip({
    required this.categories,
    required this.selectedId,
    required this.onSelected,
  });

  final List<_CategoryOption> categories;
  final String? selectedId;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _Chip(
            label: strings.get('gallery.all'),
            selected: selectedId == null,
            onSelected: () => onSelected(null),
          ),
          for (final category in categories)
            _Chip(
              label: category.name,
              selected: category.id == selectedId,
              onSelected: () => onSelected(category.id),
            ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
    ),
  );
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Skeleton(height: 72, width: 72, borderRadius: 36),
        SizedBox(height: 16),
        Skeleton(height: 20, width: 180),
        SizedBox(height: 24),
        Skeleton(height: 180),
      ],
    ),
  );
}
