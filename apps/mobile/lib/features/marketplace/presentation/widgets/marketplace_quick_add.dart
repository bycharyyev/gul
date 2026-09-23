import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/providers.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/l10n/strings.dart';
import '../../../../core/widgets/crystal.dart';
import '../../domain/marketplace_cart.dart';
import '../../domain/marketplace_models.dart';
import '../create_marketplace_order_screen.dart';
import '../marketplace_home_screen.dart';
import '../marketplace_preview_screen.dart';
import '../product_extractor.dart';

/// Paste a link, see what it is, put it in the basket -- without leaving the Cargo screen.
///
/// The point is the step count. Before this, wanting a product from Ozon meant: open Cargo, open
/// the buying section, open a create form, then paste. Three navigations before the first useful
/// action. The field is now the first thing under the two service cards, and the card that
/// answers it appears in place.
///
/// What it shows is bounded by what is actually knowable without the vendor's data: the
/// marketplace and the article number, both read from the URL. It does not show a price, because
/// nobody has one yet, and a made-up figure on the screen where a spending limit is about to be
/// agreed would be the worst possible lie.
class MarketplaceQuickAdd extends ConsumerStatefulWidget {
  const MarketplaceQuickAdd({super.key});

  @override
  ConsumerState<MarketplaceQuickAdd> createState() =>
      _MarketplaceQuickAddState();
}

class _MarketplaceQuickAddState extends ConsumerState<MarketplaceQuickAdd> {
  final _url = TextEditingController();
  MarketplaceLinkPreview? _preview;
  int _quantity = 1;
  bool _busy = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    // A share that arrived before this screen existed is already sitting in state by the time the
    // widget mounts, so the listener in build would never fire for it. Checking once after the
    // first frame covers the ordinary case: tap "Поделиться" in Ozon, pick Gulyaly, and the link
    // is already resolving when the screen appears.
    WidgetsBinding.instance.addPostFrameCallback((_) => _consumeSharedLink());
  }

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  /// Shows the product page and keeps what it says about itself.
  ///
  /// Cancelling is a real answer, not a failure: the card stays as it was, with the marketplace
  /// and the article number the server derived, and the order can still be placed on those alone.
  Future<void> _readInBrowser(MarketplaceLinkPreview preview) async {
    // The root navigator, not the shell's: the preview is a full-screen page, and pushing it
    // inside the tab shell left the app's own bottom navigation bar sitting under the product
    // page, squeezing it into two thirds of the screen.
    final facts = await Navigator.of(context, rootNavigator: true)
        .push<ProductFacts>(
          MaterialPageRoute(
            builder: (_) => MarketplacePreviewScreen(
              url: preview.canonicalUrl,
              sourceName: preview.sourceName,
            ),
          ),
        );
    if (!mounted || facts == null || facts.isEmpty) return;
    setState(() {
      _preview = preview.withFacts(
        title: facts.title,
        price: facts.price,
        currency: facts.currency,
        source: facts.source,
      );
    });
  }

  void _consumeSharedLink() {
    if (!mounted) return;
    final link = ref.read(sharedLinkProvider);
    if (link == null) return;
    // Cleared before resolving, not after: a failed resolve must not leave the link armed to
    // re-fire on the next rebuild.
    ref.read(sharedLinkProvider.notifier).clear();
    _url.text = link;
    _resolve(link);
  }

  Future<void> _resolve([String? url]) async {
    final value = (url ?? _url.text).trim();
    if (value.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
      _preview = null;
    });
    try {
      final preview = await ref
          .read(marketplaceRepositoryProvider)
          .resolve(value);
      if (!mounted) return;
      setState(() {
        _preview = preview;
        _quantity = 1;
        _url.text = preview.canonicalUrl;
      });
      // Wildberries answers the server with a title and a price, so the card is already complete
      // and a browser step would cost a tap for nothing. Ozon and Yandex answer the server with
      // nothing at all -- for those, the page itself is the only source, and it opens on the
      // customer's own connection where it actually loads.
      if (preview.isProductPage && preview.title == null) {
        await _readInBrowser(preview);
      }
    } catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pasteAndResolve() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final text = data?.text?.trim();
    if (text == null || text.isEmpty) return;
    _url.text = text;
    await _resolve(text);
  }

  void _addToCart() {
    final preview = _preview;
    if (preview == null) return;
    ref
        .read(marketplaceCartProvider.notifier)
        .add(preview, quantity: _quantity);
    setState(() {
      _preview = null;
      _quantity = 1;
      _url.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final cart = ref.watch(marketplaceCartProvider);

    // A second share, arriving while this screen is already open.
    ref.listen<String?>(sharedLinkProvider, (_, link) {
      if (link != null) _consumeSharedLink();
    });

    return CrystalSurface(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.shopping_bag_outlined,
                  size: 20,
                  color: scheme.primary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    strings.get('marketplace.homeTitle'),
                    style: const TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              strings.get('marketplace.quickAddHint'),
              style: TextStyle(
                fontSize: 12.5,
                height: 1.35,
                color: scheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _url,
              keyboardType: TextInputType.url,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _resolve(),
              decoration: InputDecoration(
                hintText: 'https://...',
                prefixIcon: const Icon(Icons.link_rounded),
                // Pasting is what people actually do with a shared product link, so it is one
                // tap rather than a long-press context menu.
                suffixIcon: IconButton(
                  tooltip: strings.get('marketplace.paste'),
                  onPressed: _busy ? null : _pasteAndResolve,
                  icon: const Icon(Icons.content_paste_rounded),
                ),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _busy ? null : () => _resolve(),
                child: _busy
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(strings.get('marketplace.check')),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                // The backend's own reason, not a generic sentence. A short link Ozon refused to
                // expand comes back as SHORT_LINK_NOT_RESOLVED, which strings.error turns into
                // "paste the full address instead" -- advice the customer can act on. Rendering
                // err.unknown here threw that away and made every failure look identical.
                _error is String
                    ? _error as String
                    : _error is AppException
                    ? strings.error(_error as AppException)
                    : strings.get('err.unknown'),
                style: TextStyle(fontSize: 12.5, color: scheme.error),
              ),
            ],
            if (_preview != null) ...[
              const SizedBox(height: 14),
              _ResultCard(
                preview: _preview!,
                quantity: _quantity,
                onQuantity: (value) => setState(() => _quantity = value),
                onAdd: _addToCart,
              ),
            ],
            if (cart.isNotEmpty) ...[
              const SizedBox(height: 14),
              const Divider(height: 1),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton.tonalIcon(
                  onPressed: () => context.push(
                    '${MarketplaceHomeScreen.routeBase}/${CreateMarketplaceOrderScreen.path}',
                  ),
                  icon: const Icon(Icons.shopping_cart_outlined),
                  label: Text(
                    '${strings.get('marketplace.goToCart')} · ${cart.length}',
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({
    required this.preview,
    required this.quantity,
    required this.onQuantity,
    required this.onAdd,
  });

  final MarketplaceLinkPreview preview;
  final int quantity;
  final ValueChanged<int> onQuantity;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    // A link that is not a product page gets a plain refusal. Saying "recognised" about a search
    // or category page would only be discovered as wrong when review came back empty.
    if (!preview.isProductPage) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: scheme.errorContainer.withValues(alpha: 0.45),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Icon(Icons.info_outline_rounded, size: 20, color: scheme.error),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                strings.get('marketplace.notAProduct'),
                style: const TextStyle(fontSize: 12.5, height: 1.35),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.20)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: scheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(
                  Icons.inventory_2_outlined,
                  size: 20,
                  color: scheme.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      preview.sourceName,
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (preview.externalId != null)
                      Text(
                        '${strings.get('marketplace.article')} ${preview.externalId}',
                        style: TextStyle(
                          fontSize: 12,
                          color: scheme.onSurfaceVariant,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          // The real product name. Wildberries the server can read directly; Ozon and Yandex it
          // cannot, so theirs is read off the page the customer just confirmed. Either way the
          // card stops at the article rather than showing a guess when nobody could read one.
          if (preview.title != null) ...[
            const SizedBox(height: 10),
            Text(
              preview.title!,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 14,
                height: 1.3,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          if (preview.priceCurrent != null) ...[
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  '${preview.priceCurrent!.toStringAsFixed(0)} ${preview.priceCurrency ?? ''}',
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (preview.priceOriginal != null) ...[
                  const SizedBox(width: 8),
                  Text(
                    preview.priceOriginal!.toStringAsFixed(0),
                    style: TextStyle(
                      fontSize: 13,
                      color: scheme.onSurfaceVariant,
                      decoration: TextDecoration.lineThrough,
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 4),
            // The shop's price, not ours: our own total adds the service fee and shipping, and
            // saying so here stops it being read as the amount that will be charged.
            Text(
              // A price the server read is checked; one read off a page on this phone is not, and
              // the card says which it is rather than presenting them as the same thing.
              preview.factsSource == null
                  ? strings.get('marketplace.shopPriceNote')
                  : strings.get('marketplace.preview.unverified'),
              style: TextStyle(
                fontSize: 11.5,
                height: 1.3,
                color: scheme.onSurfaceVariant,
              ),
            ),
          ] else ...[
            const SizedBox(height: 10),
            Text(
              strings.get('marketplace.priceAfterReview'),
              style: TextStyle(
                fontSize: 12,
                height: 1.35,
                color: scheme.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              _Stepper(value: quantity, onChanged: onQuantity),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: onAdd,
                  icon: const Icon(Icons.add_shopping_cart_rounded, size: 18),
                  label: Text(strings.get('marketplace.addToCart')),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: value > 1 ? () => onChanged(value - 1) : null,
            icon: const Icon(Icons.remove_rounded, size: 18),
          ),
          Text(
            '$value',
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: value < 99 ? () => onChanged(value + 1) : null,
            icon: const Icon(Icons.add_rounded, size: 18),
          ),
        ],
      ),
    );
  }
}
