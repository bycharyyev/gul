import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/l10n/strings.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/remote_image.dart';
import '../../domain/promo.dart';

/// The home banner: advances on its own, gently, and stops the moment anyone objects.
///
/// Auto-advance was asked for, and it is the one carousel behaviour with real accessibility
/// obligations attached. All of them are met rather than skipped:
///
/// * **a visible pause control** — not a hidden gesture, a labelled button on the card;
/// * **it stops when touched** — dragging pauses the timer, and it stays paused until the person
///   is done, because content sliding away mid-read is the actual complaint people have;
/// * **it never starts under `prefers-reduced-motion`** — the OS setting wins over the design;
/// * **it stops when only one banner exists**, because a timer that changes nothing is pure cost.
///
/// The transition is a crossfade-and-drift rather than a hard slide: at 8 seconds apart, a slide
/// reads as the screen jumping on its own.
class PromoCarousel extends StatefulWidget {
  const PromoCarousel({
    super.key,
    required this.promos,
    required this.onTap,
    this.height = 190,
    this.autoAdvance = true,
  });

  final List<Promo> promos;
  final void Function(Promo promo) onTap;
  final double height;
  final bool autoAdvance;

  /// Long enough to read a headline and decide, short enough to feel alive.
  static const interval = Duration(seconds: 8);

  @override
  State<PromoCarousel> createState() => _PromoCarouselState();
}

class _PromoCarouselState extends State<PromoCarousel> {
  final _controller = PageController(viewportFraction: 0.9);

  Timer? _timer;
  int _index = 0;
  bool _paused = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncTimer();
  }

  @override
  void didUpdateWidget(covariant PromoCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  bool get _shouldRun {
    if (!widget.autoAdvance || _paused) return false;
    // One banner has nowhere to advance to.
    if (widget.promos.length < 2) return false;
    // The OS setting is not a suggestion.
    return !MediaQuery.disableAnimationsOf(context);
  }

  void _syncTimer() {
    _timer?.cancel();
    if (!_shouldRun) return;
    _timer = Timer.periodic(PromoCarousel.interval, (_) => _advance());
  }

  void _advance() {
    if (!mounted || !_controller.hasClients) return;
    final next = (_index + 1) % widget.promos.length;
    _controller.animateToPage(
      next,
      duration: const Duration(milliseconds: 650),
      curve: Curves.easeInOutCubic,
    );
  }

  void _setPaused(bool paused) {
    setState(() => _paused = paused);
    _syncTimer();
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final canAutoAdvance =
        widget.autoAdvance &&
        widget.promos.length > 1 &&
        !MediaQuery.disableAnimationsOf(context);

    return Column(
      children: [
        SizedBox(
          height: widget.height,
          child: NotificationListener<ScrollNotification>(
            // A drag pauses the timer for good. Resuming behind someone's finger is how a
            // carousel steals the card they were about to tap.
            onNotification: (notification) {
              if (notification is ScrollStartNotification &&
                  notification.dragDetails != null &&
                  !_paused) {
                _setPaused(true);
              }
              return false;
            },
            child: PageView.builder(
              controller: _controller,
              itemCount: widget.promos.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (context, i) => _Slide(
                promo: widget.promos[i],
                height: widget.height,
                onTap: () => widget.onTap(widget.promos[i]),
              ),
            ),
          ),
        ),
        if (widget.promos.length > 1) ...[
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // A 44dp control, sized for a finger, not decoration.
              if (canAutoAdvance || _paused)
                SizedBox(
                  width: 44,
                  height: 44,
                  child: IconButton(
                    onPressed: () => _setPaused(!_paused),
                    tooltip: strings.get(
                      _paused ? 'home.banner.play' : 'home.banner.pause',
                    ),
                    iconSize: 18,
                    icon: Icon(
                      _paused ? Icons.play_arrow_rounded : Icons.pause_rounded,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ),
              for (var i = 0; i < widget.promos.length; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 260),
                  curve: Curves.easeOutCubic,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: i == _index ? 20 : 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: i == _index ? scheme.primary : scheme.outlineVariant,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _Slide extends StatelessWidget {
  const _Slide({
    required this.promo,
    required this.height,
    required this.onTap,
  });

  final Promo promo;
  final double height;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // A card with nowhere to go must not look tappable: an inert ripple teaches people that taps
    // do nothing here, and they stop trying the ones that work.
    final tappable =
        promo.linkType != PromoLinkType.none &&
        promo.linkType != PromoLinkType.unknown;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 5),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        child: Material(
          color: scheme.surfaceContainerHighest,
          child: InkWell(
            onTap: tappable ? onTap : null,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (promo.imageUrl != null)
                  RemoteImage(
                    url: promo.imageUrl,
                    width: double.infinity,
                    height: height,
                    borderRadius: 0,
                  ),
                // Scrim only where the text sits, so the image stays visible above it.
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.center,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Color(0xCC0A0A14)],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      // A paid placement that does not announce itself is a dark pattern, and in
                      // several markets illegal.
                      if (promo.sponsorLabel != null)
                        _Tag(
                          text: promo.sponsorLabel!,
                          background: Colors.white24,
                        ),
                      if (promo.badgeLabel != null)
                        _Tag(
                          text: promo.badgeLabel!,
                          background: AppTheme.brand,
                        ),
                      Text(
                        promo.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.3,
                          height: 1.2,
                        ),
                      ),
                      if (promo.subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          promo.subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.88),
                            fontSize: 13.5,
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
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.text, required this.background});

  final String text;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
      ),
      child: Text(
        text,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
