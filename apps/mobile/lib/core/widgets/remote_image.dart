import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Pixel width to decode a network image at when it is drawn with [BoxFit.cover] in [box].
///
/// Uploads are 800-3000 px and decoding them full size held a 64 px story circle as ~2.5 MB of
/// RAM (a hero banner ~20 MB), enough to stutter scrolling on low-end phones. Only the width is
/// bounded: bounding both makes [ResizeImage] stretch the picture. Twice the box's longer side
/// keeps a cover-fitted image sharp for any aspect ratio up to 2:1 either way; smaller images are
/// never upscaled.
int decodeWidthFor(Size box, double devicePixelRatio) =>
    (math.max(box.width, box.height) * devicePixelRatio * 2).ceil();

/// A disk-cached network image decoded at [decodeWidth] pixels wide, for places that need an
/// [ImageProvider] (e.g. [CircleAvatar]) rather than a [RemoteImage] widget.
ImageProvider cachedImageProvider(String url, {required int decodeWidth}) =>
    ResizeImage.resizeIfNeeded(decodeWidth, null, CachedNetworkImageProvider(url));

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
            : LayoutBuilder(
                // width/height may be double.infinity; the laid-out box is what gets drawn.
                builder: (context, constraints) {
                  final screen = MediaQuery.sizeOf(context);
                  final box = Size(
                    constraints.maxWidth.isFinite ? constraints.maxWidth : screen.width,
                    constraints.maxHeight.isFinite ? constraints.maxHeight : screen.height,
                  );
                  return CachedNetworkImage(
                    imageUrl: url!,
                    width: width,
                    height: height,
                    fit: fit,
                    memCacheWidth: decodeWidthFor(box, MediaQuery.devicePixelRatioOf(context)),
                    fadeInDuration: const Duration(milliseconds: 180),
                    placeholder: (_, __) => const _Placeholder(),
                    errorWidget: (_, __, ___) => _Placeholder(icon: fallbackIcon),
                  );
                },
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
