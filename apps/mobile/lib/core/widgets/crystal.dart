import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// The ground every screen sits on.
///
/// Three soft radial washes in the brand hues over a near-white (or near-black) base. It is what
/// gives translucent surfaces something to be translucent *against* — without it, "glass" over
/// flat grey is just grey.
///
/// Painted once, at the root, rather than per screen: one gradient for the whole app instead of
/// one per route, and nothing re-paints when a route changes.
class AmbientBackground extends StatelessWidget {
  const AmbientBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: isDark ? AppTheme.canvasDark : AppTheme.canvasLight,
      ),
      child: Stack(
        children: [
          // Static gradients, not an animation. An ambient background that moves is a background
          // that costs a frame forever and that `prefers-reduced-motion` would have to switch off.
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(-0.9, -1.0),
                  radius: 1.4,
                  colors: [
                    AppTheme.washViolet.withValues(alpha: isDark ? 0.22 : 0.20),
                    AppTheme.washViolet.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(1.1, -0.55),
                  radius: 1.1,
                  colors: [
                    AppTheme.washRose.withValues(alpha: isDark ? 0.16 : 0.18),
                    AppTheme.washRose.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(-0.7, 1.0),
                  radius: 1.2,
                  colors: [
                    AppTheme.washTeal.withValues(alpha: isDark ? 0.14 : 0.16),
                    AppTheme.washTeal.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
          ),
          child,
        ],
      ),
    );
  }
}

/// A translucent card: white over the ambient ground, hairline border, soft shadow.
///
/// **No `BackdropFilter`.** A real blur here would mean one expensive filter per card and a
/// stuttering product grid on a mid-range Android. Translucency over the ambient wash reads as
/// glass at a fraction of the cost; blur is reserved for the one surface that overlaps scrolling
/// content, the navigation bar.
class CrystalSurface extends StatelessWidget {
  const CrystalSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.radius = AppTheme.radiusMedium,
    this.onTap,
    this.opacity,
    this.shadowStrength = 1,
    this.border = true,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final VoidCallback? onTap;
  final double? opacity;
  final double shadowStrength;
  final bool border;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final fill = (isDark ? Colors.white : Colors.white).withValues(
      alpha: opacity ?? (isDark ? 0.06 : 0.82),
    );

    final decorated = Container(
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(radius),
        border: border
            ? Border.all(
                color: isDark
                    ? const Color(0x1FFFFFFF)
                    : Colors.white.withValues(alpha: 0.9),
              )
            : null,
        boxShadow: AppTheme.softShadow(
          theme.brightness,
          strength: shadowStrength,
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Padding(padding: padding, child: child),
      ),
    );

    if (onTap == null) return decorated;

    // Material above the decoration so the ripple is clipped to the same radius and the
    // translucent fill still shows through it.
    //
    // `passthrough` rather than the default loose fit: a Stack normally hands its non-positioned
    // children loose constraints, so inside a grid cell the surface shrank to its own label and
    // sat against the cell's left edge -- three operator tiles of three different widths. Passing
    // the Stack's own constraints straight through makes the surface fill a tight parent and
    // still size to its content under a loose one.
    return Stack(
      fit: StackFit.passthrough,
      children: [
        decorated,
        Positioned.fill(
          child: Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(radius),
            child: InkWell(
              borderRadius: BorderRadius.circular(radius),
              onTap: onTap,
            ),
          ),
        ),
      ],
    );
  }
}

/// The one place real frosted glass is used: a bar that floats over scrolling content.
///
/// Here the blur earns its cost — content passing underneath is what makes the surface read as
/// glass rather than as a grey rectangle. It is a single filter for the whole app, not one per
/// card.
class FrostedSurface extends StatelessWidget {
  const FrostedSurface({
    super.key,
    required this.child,
    this.radius = AppTheme.radiusPill,
    this.blur = 18,
  });

  final Widget child;
  final double radius;
  final double blur;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: isDark
                ? const Color(0xFF14141F).withValues(alpha: 0.72)
                : Colors.white.withValues(alpha: 0.74),
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(
              color: isDark
                  ? const Color(0x24FFFFFF)
                  : Colors.white.withValues(alpha: 0.85),
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// A brand-gradient fill, used for the one primary surface on a screen and nothing else.
class BrandGradient extends StatelessWidget {
  const BrandGradient({
    super.key,
    required this.child,
    this.radius = AppTheme.radiusLarge,
    this.padding = const EdgeInsets.all(20),
  });

  final Widget child;
  final double radius;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: const LinearGradient(
          colors: [AppTheme.brand, Color(0xFF7C5CFF), AppTheme.accent],
          stops: [0, 0.55, 1],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.brand.withValues(alpha: 0.28),
            blurRadius: 26,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: child,
    );
  }
}
