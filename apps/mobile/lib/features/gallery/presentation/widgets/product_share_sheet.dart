import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../core/l10n/strings.dart';
import '../../domain/gallery_product.dart';

/// A QR code, a copy button, a share button -- and nothing else. Opened by the share icon on a
/// product's own page, so someone standing next to a customer can scan straight into the item,
/// and someone far away gets a link with one tap.
Future<void> showProductShareSheet(
  BuildContext context, {
  required GalleryProduct product,
  required String link,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => _ProductShareSheet(product: product, link: link),
  );
}

class _ProductShareSheet extends StatelessWidget {
  const _ProductShareSheet({required this.product, required this.link});
  final GalleryProduct product;
  final String link;

  Future<void> _copy(BuildContext context) async {
    final strings = Strings.of(context);
    await Clipboard.setData(ClipboardData(text: link));
    if (!context.mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(strings.get('gallery.linkCopied'))));
  }

  Future<void> _share() => Share.share(link);

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              product.name,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 20),
            DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: QrImageView(data: link, size: 200),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _copy(context),
                    icon: const Icon(Icons.copy_rounded, size: 18),
                    label: Text(strings.get('gallery.copyLink')),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _share,
                    icon: const Icon(Icons.ios_share_rounded, size: 18),
                    label: Text(strings.get('gallery.share')),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
