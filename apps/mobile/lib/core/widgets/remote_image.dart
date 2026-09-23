import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// A network image that cannot break the layout.
///
/// Three things every raw `Image.network` gets wrong here:
/// * it reserves no space, so the page reflows when the bytes land;
/// * it shows a broken-image glyph on failure, and this catalogue has products with reachable
///   and unreachable URLs alike (some are hot-linked from other sites);
/// * it re-downloads on every rebuild and keeps nothing between launches.
///
/// The size is always fixed by the caller, so the box occupies its final dimensions immediately.
class RemoteImage extends StatelessWidget {
  const RemoteImage({
    super.key,
    required this.url,
    required this.width,
    required this.height,
    this.borderRadius = 12,
    this.fallbackIcon = Icons.image_outlined,
    this.fit = BoxFit.cover,
  });

  final String? url;
  final double width;
  final double height;
  final double borderRadius;
  final IconData fallbackIcon;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(borderRadius);

    return ClipRRect(
      borderRadius: radius,
      child: SizedBox(
        width: width,
        height: height,
        child: (url == null || url!.trim().isEmpty)
            ? _Placeholder(icon: fallbackIcon)
            : CachedNetworkImage(
                imageUrl: url!,
                width: width,
                height: height,
                fit: fit,
                fadeInDuration: const Duration(milliseconds: 180),
                placeholder: (_, __) => const _Placeholder(),
                errorWidget: (_, __, ___) => _Placeholder(icon: fallbackIcon),
              ),
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({this.icon});

  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ColoredBox(
      color: scheme.surfaceContainerHighest,
      child: icon == null
          ? const SizedBox.expand()
          : Center(child: Icon(icon, color: scheme.onSurfaceVariant, size: 22)),
    );
  }
}
