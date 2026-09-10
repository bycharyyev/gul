import 'package:flutter/material.dart';

/// A placeholder block that occupies the final layout's space while data loads.
///
/// Skeletons rather than a centred spinner for list content: the page keeps its shape, so nothing
/// jumps when the real rows arrive, and the wait reads as "loading this" instead of "frozen".
///
/// The shimmer honours `prefers-reduced-motion`: when animations are disabled at the OS level the
/// block renders as a plain static shape. A looping gradient is exactly the kind of ambient motion
/// that setting exists to stop.
class Skeleton extends StatefulWidget {
  const Skeleton({
    super.key,
    required this.height,
    this.width,
    this.borderRadius = 12,
  });

  final double height;
  final double? width;
  final double borderRadius;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final base = scheme.surfaceContainerHighest;

    if (reduceMotion) {
      _controller.stop();
      return _box(base, null);
    }

    if (!_controller.isAnimating) _controller.repeat();

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) => _box(
        base,
        LinearGradient(
          colors: [base, scheme.surface, base],
          stops: const [0.1, 0.5, 0.9],
          // Sweeps the highlight across the block rather than fading the whole thing, which
          // reads as "in progress" instead of "broken".
          begin: Alignment(-1 - 2 * (1 - _controller.value), 0),
          end: Alignment(1 + 2 * _controller.value, 0),
        ),
      ),
    );
  }

  Widget _box(Color color, Gradient? gradient) => Container(
    width: widget.width,
    height: widget.height,
    decoration: BoxDecoration(
      color: gradient == null ? color : null,
      gradient: gradient,
      borderRadius: BorderRadius.circular(widget.borderRadius),
    ),
  );
}
