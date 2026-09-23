import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/crystal.dart';
import '../../../../core/widgets/remote_image.dart';
import '../../domain/catalog_service.dart';

/// The operators, as a grid of tiles.
///
/// A grid rather than a list: there are a handful of operators, each is picked by recognising its
/// name, and a grid puts them all on one screen without scrolling. The tile is the touch target
/// in full — 96dp tall against a 48dp floor — so nobody has to aim at the logo.
class ServicesGrid extends StatelessWidget {
  const ServicesGrid({super.key, required this.services, required this.onTap});

  final List<CatalogService> services;
  final void Function(CatalogService service) onTap;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      // Inside a scrolling parent: this grid never scrolls on its own, so there is one scroll
      // region on the screen and no nested-scroll fight.
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.92,
      ),
      itemCount: services.length,
      itemBuilder: (context, i) =>
          _ServiceTile(service: services[i], onTap: () => onTap(services[i])),
    );
  }
}

class _ServiceTile extends StatelessWidget {
  const _ServiceTile({required this.service, required this.onTap});

  final CatalogService service;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    // The same translucent surface as every other card. These tiles were the last flat white
    // rectangles left on the screen, and against the ambient ground that reads as an unstyled
    // leftover rather than as a deliberate choice.
    return CrystalSurface(
      onTap: onTap,
      radius: AppTheme.radiusMedium,
      padding: const EdgeInsets.all(10),
      shadowStrength: 0.6,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // A logo sits on its own tinted disc, so an operator with no image and one with a
          // dark PNG both look intentional instead of accidental.
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: scheme.primary.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            padding: const EdgeInsets.all(6),
            child: RemoteImage(
              url: service.logoUrl,
              width: 34,
              height: 34,
              borderRadius: 999,
              fit: BoxFit.contain,
              fallbackIcon: Icons.sim_card_outlined,
            ),
          ),
          const SizedBox(height: 9),
          Text(
            service.name,
            maxLines: 2,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}
