import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/providers.dart';
import '../../domain/cargo_models.dart';

/// Ad slot at the top of the Cargo screens, filled from the admin console.
///
/// Renders nothing at all when there is no active banner, and says nothing when the call fails --
/// an empty placeholder box on a screen people use to spend money reads as a broken app, and an
/// ad that did not load is not worth an error message.
class CargoBannerCard extends ConsumerStatefulWidget {
  const CargoBannerCard({super.key});

  @override
  ConsumerState<CargoBannerCard> createState() => _CargoBannerCardState();
}

class _CargoBannerCardState extends ConsumerState<CargoBannerCard> {
  CargoBanner? _banner;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final banners = await ref.read(cargoRepositoryProvider).loadBanners();
      if (!mounted) return;
      setState(() => _banner = banners.isEmpty ? null : banners.first);
    } catch (_) {
      // Silent on purpose -- see the class comment.
    }
  }

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    // Admin-supplied destination, so treat it as external and hand it to the system browser
    // rather than opening it inside the app.
    if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final banner = _banner;
    if (banner == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: banner.linkUrl == null ? null : () => _open(banner.linkUrl!),
            child: Stack(
              children: [
                // Fixed height so an odd aspect ratio cannot push the form below the fold.
                SizedBox(
                  height: 132,
                  width: double.infinity,
                  child: Image.network(
                    banner.imageUrl,
                    fit: BoxFit.cover,
                    // A broken image URL collapses the slot rather than showing a grey box.
                    errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                  ),
                ),
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight,
                        colors: [
                          Colors.black.withValues(alpha: 0.62),
                          Colors.transparent,
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned.fill(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          banner.title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (banner.subtitle != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            banner.subtitle!,
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ],
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
