import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// The Gulyaly mark, as one widget so every surface shows the same logo.
///
/// It sits on its own white disc rather than straight on the page. The mark is drawn in black and
/// `#ff2e04` for a white ground — dropped onto the app's ambient wash, or onto a dark theme, the
/// black ring loses its edge. The disc keeps the logo exactly as the brand defines it wherever it
/// lands, which matters more than blending in.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 84});

  final double size;

  static const asset = 'assets/brand/gulyaly-mark.png';

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        boxShadow: AppTheme.softShadow(
          Theme.of(context).brightness,
          strength: 0.8,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: EdgeInsets.all(size * 0.14),
        child: Image.asset(
          asset,
          fit: BoxFit.contain,
          // The logo is the app's identity; a missing asset must not be a red error box on the
          // first screen a customer ever sees.
          errorBuilder: (_, __, ___) => const _GradientFallback(),
        ),
      ),
    );
  }
}

class _GradientFallback extends StatelessWidget {
  const _GradientFallback();

  @override
  Widget build(BuildContext context) => const DecoratedBox(
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      gradient: LinearGradient(
        colors: [AppTheme.brand, AppTheme.accent],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
    ),
    child: Center(
      child: Text(
        'G',
        style: TextStyle(
          color: Colors.white,
          fontSize: 34,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
  );
}
