import 'package:flutter/material.dart';

import '../../../../core/format/money.dart';
import '../../../../core/l10n/strings.dart';
import '../../../../core/widgets/remote_image.dart';
import '../../domain/gallery_product.dart';

/// One product in the grid.
///
/// The image is the reason someone stops here, so it gets the space; the price sits directly
/// under the name where the eye lands next. Fixed image height means the grid holds its shape
/// before any bytes arrive.
class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product, required this.onTap});

  final GalleryProduct product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Material(
      color: scheme.surface,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // The image takes whatever the text does not, rather than a fixed 132dp. At a large
              // system text size the name, price and shop name need more room, and it is the
              // photo that should give it up — not the words.
              Expanded(
                child: RemoteImage(
                  url: product.imageUrl,
                  width: double.infinity,
                  height: double.infinity,
                  borderRadius: 0,
                  fallbackIcon: Icons.local_florist_outlined,
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13.5,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      Money.tmt(product.priceTmt, strings.locale),
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14.5,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    if (product.sellerName != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        product.sellerName!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: scheme.onSurfaceVariant,
                          fontSize: 11.5,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
