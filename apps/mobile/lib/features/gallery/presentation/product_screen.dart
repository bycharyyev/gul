import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/format/money.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/remote_image.dart';
import '../../../core/widgets/skeleton.dart';
import '../../chat/presentation/chat_inbox_screen.dart';
import '../../chat/presentation/chat_room_screen.dart';
import '../domain/gallery_product.dart';
import 'gallery_checkout_screen.dart';

class ProductScreen extends ConsumerWidget {
  const ProductScreen({super.key, required this.productId});

  static const path = '/gallery/product';

  final String productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final product = ref.watch(galleryProductProvider(productId));

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('gallery.product'))),
      body: AsyncView<GalleryProduct?>(
        value: product,
        onRetry: () => ref.invalidate(galleryProductProvider(productId)),
        skeleton: const Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            children: [
              Skeleton(height: 260, borderRadius: 18),
              SizedBox(height: 18),
              Skeleton(height: 120, borderRadius: 16),
            ],
          ),
        ),
        // A product that was disabled or deleted between the list and the tap resolves to null.
        isEmpty: (value) => value == null,
        empty: EmptyState(
          icon: Icons.search_off_rounded,
          title: strings.get('gallery.gone'),
        ),
        data: (value) => _Detail(product: value!),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.product});

  final GalleryProduct product;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              RemoteImage(
                url: product.imageUrl,
                width: double.infinity,
                height: 260,
                borderRadius: 18,
                fallbackIcon: Icons.local_florist_outlined,
              ),
              const SizedBox(height: 18),
              Text(
                product.name,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  height: 1.25,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                Money.tmt(product.priceTmt, strings.locale),
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (product.categoryName != null)
                    _Tag(text: product.categoryName!),
                  // Who the customer is actually buying from, when it is not the shop itself.
                  if (product.sellerName != null)
                    _Tag(
                      text: product.sellerName!,
                      icon: Icons.storefront_outlined,
                    ),
                ],
              ),
              if (product.description != null) ...[
                const SizedBox(height: 20),
                Text(
                  product.description!,
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    height: 1.5,
                    fontSize: 14.5,
                  ),
                ),
              ],
            ],
          ),
        ),

        // The action is pinned rather than scrolled to: a long description must not bury the one
        // thing this screen exists for.
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            decoration: BoxDecoration(
              color: scheme.surface,
              border: Border(top: BorderSide(color: scheme.outlineVariant)),
            ),
            child: Row(
              children: [
                // Only where there is a shop to write to: most of the catalogue is house stock
                // with no seller behind it, and a button that opens nothing is worse than none.
                if (product.sellerId != null) ...[
                  _MessageSellerButton(
                    sellerId: product.sellerId!,
                    sellerName: product.sellerName,
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: FilledButton(
                    onPressed: () => context.push(
                      '${GalleryCheckoutScreen.path}/${product.id}',
                    ),
                    child: Text(strings.get('gallery.order')),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.text, this.icon});

  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: scheme.onSurfaceVariant),
            const SizedBox(width: 5),
          ],
          Text(
            text,
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Opens the conversation with this shop, creating it on first use.
///
/// Deliberately an icon beside the order button rather than a second full-width action: buying is
/// what this screen is for, and two equal buttons would make the customer choose between them.
class _MessageSellerButton extends ConsumerStatefulWidget {
  const _MessageSellerButton({required this.sellerId, this.sellerName});

  final String sellerId;
  final String? sellerName;

  @override
  ConsumerState<_MessageSellerButton> createState() =>
      _MessageSellerButtonState();
}

class _MessageSellerButtonState extends ConsumerState<_MessageSellerButton> {
  bool _busy = false;

  Future<void> _open() async {
    final strings = Strings.of(context);
    setState(() => _busy = true);
    try {
      final conversationId = await ref
          .read(chatRepositoryProvider)
          .conversationWithSeller(widget.sellerId);
      if (!mounted) return;
      ref.invalidate(chatInboxProvider);
      // Not awaited: this resolves when the conversation is popped, and waiting for that would
      // hold the button in its loading state for as long as somebody is reading.
      unawaited(
        context.push(
          '${ChatInboxScreen.path}/${ChatRoomScreen.pathSegment}/${Uri.encodeComponent(conversationId)}',
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e is AppException ? strings.error(e) : strings.get('err.unknown'),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return OutlinedButton(
      onPressed: _busy ? null : _open,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      child: _busy
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.chat_bubble_outline_rounded, size: 18),
                const SizedBox(width: 6),
                Text(strings.get('gallery.messageSeller')),
              ],
            ),
    );
  }
}
