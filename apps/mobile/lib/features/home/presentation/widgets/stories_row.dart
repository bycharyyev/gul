import 'package:flutter/material.dart';

import '../../../../core/l10n/strings.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/remote_image.dart';
import '../../domain/promo.dart';

/// Stories, as tall cards rather than a second banner strip.
///
/// They used to render through the same carousel as the banner, which meant two identical
/// components stacked on one screen and no way to tell what either was for. Here they are their
/// own shape — a horizontally scrolling row of tall portrait cards with a brand ring — so the
/// page reads as "one big thing that changes, then a row of things to browse".
///
/// No auto-advance: this row is browsed, not watched. Motion belongs to the banner above it.
class StoriesRow extends StatelessWidget {
  const StoriesRow({super.key, required this.stories, required this.onTap});

  final List<Promo> stories;
  final void Function(Promo story) onTap;

  static const double height = 186;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        // The cards' shadows fall outside the row's box; clipping would shear them off at the
        // edge and flatten the lift they exist to create.
        clipBehavior: Clip.none,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: stories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, i) =>
            _StoryCard(story: stories[i], onTap: () => onTap(stories[i])),
      ),
    );
  }
}

class _StoryCard extends StatefulWidget {
  const _StoryCard({required this.story, required this.onTap});

  final Promo story;
  final VoidCallback onTap;

  @override
  State<_StoryCard> createState() => _StoryCardState();
}

class _StoryCardState extends State<_StoryCard> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed != value) setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brightness = Theme.of(context).brightness;
    final story = widget.story;

    return GestureDetector(
      onTap: widget.onTap,
      // Tracked by hand rather than through InkWell: a ripple would be hidden under a
      // full-bleed photograph, so the whole card answers the finger instead.
      onTapDown: (_) => _setPressed(true),
      onTapUp: (_) => _setPressed(false),
      onTapCancel: () => _setPressed(false),
      child: AnimatedScale(
        scale: _pressed ? 0.955 : 1,
        duration: const Duration(milliseconds: 130),
        curve: Curves.easeOut,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 130),
          curve: Curves.easeOut,
          width: 124,
          // A raised card rather than a gradient ring. The ring's colours sat on the same wash
          // the page is painted with, so the edge disappeared into the background instead of
          // marking where the card ends. A pale frame plus a real shadow reads as "lifted off
          // the page" from any distance, and it stays legible over any photograph.
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
            color: brightness == Brightness.dark
                ? Colors.white.withValues(alpha: 0.14)
                : Colors.white.withValues(alpha: 0.92),
            // The shadow tightens under the finger, which is what sells the card as a physical
            // thing being pressed down rather than merely scaled.
            boxShadow: AppTheme.softShadow(
              brightness,
              strength: _pressed ? 0.5 : 1.35,
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge - 3),
            child: Stack(
              fit: StackFit.expand,
              children: [
                ColoredBox(color: scheme.surfaceContainerHighest),
                if (story.imageUrl != null)
                  RemoteImage(
                    url: story.imageUrl,
                    width: 124,
                    height: StoriesRow.height,
                    borderRadius: 0,
                  ),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.center,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Color(0xD90A0A14)],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      if (story.badgeLabel != null) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 7,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.brand,
                            borderRadius: BorderRadius.circular(
                              AppTheme.radiusPill,
                            ),
                          ),
                          child: Text(
                            story.badgeLabel!,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 9.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                      ],
                      Text(
                        story.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          height: 1.2,
                        ),
                      ),
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

/// A story, full screen, the way people expect one: tap to close, one clear action if it leads
/// somewhere.
///
/// Deliberately **not** auto-advancing and **not** timed. A timer bar would promise a sequence
/// this content does not have — these are individual promotional cards, not a reel.
class StoryViewer extends StatelessWidget {
  const StoryViewer({super.key, required this.story, required this.onOpen});

  final Promo story;

  /// Null when the story leads nowhere, which hides the action rather than showing a dead button.
  final VoidCallback? onOpen;

  static Future<void> show(
    BuildContext context, {
    required Promo story,
    required VoidCallback? onOpen,
  }) {
    return showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.86),
      builder: (_) => StoryViewer(story: story, onOpen: onOpen),
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return Dialog.fullscreen(
      backgroundColor: Colors.transparent,
      child: Stack(
        children: [
          // Tapping anywhere closes. A story is a thing you glance at and leave.
          Positioned.fill(
            child: GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                    child: RemoteImage(
                      url: story.imageUrl,
                      width: double.infinity,
                      height: MediaQuery.sizeOf(context).height * 0.62,
                      borderRadius: 0,
                      fit: BoxFit.cover,
                    ),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 44,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  story.title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.5,
                    height: 1.2,
                  ),
                ),
                if (story.subtitle != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    story.subtitle!,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.82),
                      fontSize: 15,
                      height: 1.4,
                    ),
                  ),
                ],
                if (onOpen != null) ...[
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: () {
                      Navigator.of(context).pop();
                      onOpen!();
                    },
                    child: Text(
                      story.ctaLabel ?? strings.get('home.story.open'),
                    ),
                  ),
                ],
              ],
            ),
          ),
          Positioned(
            top: 48,
            right: 20,
            child: Material(
              color: Colors.white24,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => Navigator.of(context).pop(),
                child: const SizedBox(
                  width: 44,
                  height: 44,
                  child: Icon(Icons.close_rounded, color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
