import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/gallery_repository.dart';
import '../domain/gallery_product.dart';
import 'product_screen.dart';
import 'widgets/product_card.dart';

class GalleryScreen extends ConsumerStatefulWidget {
  const GalleryScreen({super.key});

  static const path = '/gallery';

  @override
  ConsumerState<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends ConsumerState<GalleryScreen> {
  final _search = TextEditingController();

  GalleryFilter _filter = const GalleryFilter();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  /// Search runs on the server, so it must not run on every keystroke — that is one request per
  /// character on a mobile connection, and the results would race each other back.
  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      setState(() => _filter = _filter.copyWith(search: value.trim()));
    });
  }

  void _selectCategory(String? categoryId) {
    setState(() {
      _filter = categoryId == null
          ? _filter.copyWith(clearCategory: true)
          : _filter.copyWith(categoryId: categoryId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final categories = ref.watch(galleryCategoriesProvider);
    final products = ref.watch(galleryProductsProvider(_filter));

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('gallery.title'))),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _search,
              onChanged: _onSearchChanged,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: strings.get('gallery.search'),
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () {
                          _search.clear();
                          _onSearchChanged('');
                        },
                      ),
              ),
            ),
          ),

          // Categories degrade quietly: if the call fails the catalogue still browses, just
          // unfiltered. Losing a filter is not worth losing the shop.
          categories.maybeWhen(
            data: (list) => _CategoryStrip(
              categories: list,
              selectedId: _filter.categoryId,
              onSelected: _selectCategory,
            ),
            orElse: () => const SizedBox(height: 8),
          ),

          Expanded(
            child: RefreshIndicator(
              onRefresh: () {
                ref.invalidate(galleryCategoriesProvider);
                return ref.refresh(galleryProductsProvider(_filter).future);
              },
              child: AsyncView<List<GalleryProduct>>(
                value: products,
                onRetry: () => ref.invalidate(galleryProductsProvider(_filter)),
                skeleton: const _GallerySkeleton(),
                isEmpty: (list) => list.isEmpty,
                empty: _EmptyCatalogue(hasFilter: !_filter.isEmpty),
                data: (list) => GridView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(
                    16,
                    4,
                    16,
                    AppShell.contentBottomInset,
                  ),
                  // A fixed aspect ratio clips the card as soon as the system text size grows —
                  // a 132dp image plus a two-line name, a price and a shop name simply need more
                  // room at 2x. `mainAxisExtent` sizes each cell from the actual text scale
                  // instead of a ratio that was only ever right at 1x.
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    mainAxisExtent:
                        130 + MediaQuery.textScalerOf(context).scale(104),
                  ),
                  itemCount: list.length,
                  itemBuilder: (context, i) => ProductCard(
                    product: list[i],
                    onTap: () =>
                        context.push('${ProductScreen.path}/${list[i].id}'),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryStrip extends StatelessWidget {
  const _CategoryStrip({
    required this.categories,
    required this.selectedId,
    required this.onSelected,
  });

  final List<GalleryCategory> categories;
  final String? selectedId;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    if (categories.isEmpty) return const SizedBox(height: 8);
    final strings = Strings.of(context);

    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          // "All" is a real option, not the absence of one — without it there is no way back
          // from a category except guessing.
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

class _EmptyCatalogue extends StatelessWidget {
  const _EmptyCatalogue({required this.hasFilter});

  /// An empty shop and an empty search result need different words: one is "come back later",
  /// the other is "try something else".
  final bool hasFilter;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.5,
          child: EmptyState(
            icon: hasFilter
                ? Icons.search_off_rounded
                : Icons.local_florist_outlined,
            title: strings.get(
              hasFilter ? 'gallery.noResults' : 'gallery.empty',
            ),
            message: hasFilter ? strings.get('gallery.noResults.hint') : null,
          ),
        ),
      ],
    );
  }
}

class _GallerySkeleton extends StatelessWidget {
  const _GallerySkeleton();

  @override
  Widget build(BuildContext context) {
    // Matches the loaded grid's cell height exactly, so nothing shifts when the data lands.
    final extent = 130 + MediaQuery.textScalerOf(context).scale(104);
    return GridView.count(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        16,
        4,
        16,
        AppShell.contentBottomInset,
      ),
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1,
      children: List.generate(
        6,
        (_) => Skeleton(height: extent, borderRadius: 16),
      ),
    );
  }
}
