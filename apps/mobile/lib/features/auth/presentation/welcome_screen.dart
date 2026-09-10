import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/brand_mark.dart';
import 'login_screen.dart';
import 'register_screen.dart';

/// The first screen a signed-out visitor sees.
///
/// The login form used to be the front door, which asks for a password before saying what the
/// password is for. This says what the app does, shows the things it sells orbiting the mark, and
/// leaves the choice — join, or sign in — as the only thing to act on.
///
/// The three lines of copy come from the CMS when it has something to say and from
/// [Strings] otherwise. What this app sells is going to keep growing — post is already planned —
/// and the screen that describes it should not need a store release to name a new category.
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  static const path = '/welcome';

  /// The headline's accent line, in brand order — violet, magenta, teal.
  ///
  /// These are deliberately *not* [AppTheme.washRose] and [AppTheme.accent]. Those two are ground
  /// colours: they exist to be washed across a background at low opacity, and painted as text on
  /// a near-white page they measured 2.4:1 against it — under the 3:1 that large text needs, and
  /// visibly washed out on the phone. The stops below are the same three hues taken darker, and
  /// the worst of them clears 3.8:1 on both the light and the dark ground.
  @visibleForTesting
  static const headlineGradient = [
    AppTheme.brand,
    Color(0xFFD81B7A),
    Color(0xFF0D8B7F),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    // Null until the CMS answers, and null forever if it never does. Each line falls back on its
    // own, so an admin who fills in only the headline keeps the shipped subtitle rather than
    // blanking it.
    final copy = ref.watch(welcomeCopyProvider);
    final title = copy?.title ?? strings.get('welcome.title');
    final titleAccent = copy?.titleAccent ?? strings.get('welcome.titleAccent');
    final subtitle = copy?.subtitle ?? strings.get('welcome.subtitle');

    // One style for both halves of the headline, so the gradient line and the plain line share a
    // baseline grid instead of drifting apart when the system text size changes.
    final headline = TextStyle(
      fontSize: 32,
      fontWeight: FontWeight.w800,
      letterSpacing: -1.1,
      height: 1.12,
      color: scheme.onSurface,
    );

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const Expanded(child: _Constellation()),
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 0, 28, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    // The brand is written Gulyaly, capital G, everywhere it appears. A lowercase
                    // wordmark is a styling fashion, not this brand's name.
                    'Gulyaly',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 2.6,
                      color: scheme.onSurfaceVariant.withValues(alpha: 0.75),
                    ),
                  ),
                  const SizedBox(height: 14),
                  // A crossfade, not a loading state. The key is the text itself, so when the CMS
                  // says exactly what the binary already says — the common case — the key does not
                  // change and nothing animates at all. It only fades when the words really differ.
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 260),
                    child: Column(
                      key: ValueKey('$title|$titleAccent|$subtitle'),
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          title,
                          textAlign: TextAlign.center,
                          style: headline,
                        ),
                        // The second line carries the brand gradient. It is the one saturated
                        // thing in the copy, which is why nothing else here competes for colour.
                        ShaderMask(
                          blendMode: BlendMode.srcIn,
                          shaderCallback: (rect) => const LinearGradient(
                            colors: headlineGradient,
                          ).createShader(rect),
                          child: Text(
                            titleAccent,
                            textAlign: TextAlign.center,
                            style: headline.copyWith(color: Colors.white),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          subtitle,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 15,
                            height: 1.45,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 26),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => context.go(RegisterScreen.path),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(56),
                        shape: const StadiumBorder(),
                        textStyle: const TextStyle(
                          fontSize: 16.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      child: Text(strings.get('welcome.start')),
                    ),
                  ),
                  const SizedBox(height: 6),
                  SizedBox(
                    width: double.infinity,
                    child: TextButton(
                      onPressed: () => context.go(LoginScreen.path),
                      style: TextButton.styleFrom(
                        minimumSize: const Size.fromHeight(50),
                        shape: const StadiumBorder(),
                      ),
                      child: Text(strings.get('welcome.haveAccount')),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The brand mark with the things the app actually sells in orbit around it.
///
/// Each bubble is placed by an angle on a named ring rather than by a hand-tuned offset, so the
/// bubbles genuinely sit on the circles drawn behind them — nudging one cannot leave it floating
/// half a radius off its own orbit.
///
/// Static, and deliberately: an animated hero costs a frame for as long as somebody sits here
/// deciding, and it would be the first thing `prefers-reduced-motion` had to switch off.
class _Constellation extends StatelessWidget {
  const _Constellation();

  // (degrees clockwise from the right, ring fraction, icon, tint, diameter as a fraction of the
  // artwork). The two solid rings drawn below are at 1.0 and 0.62.
  static const _orbits = <(double, double, IconData, Color, double)>[
    (204, 1.0, Icons.sim_card_outlined, AppTheme.brand, 0.21),
    (312, 1.0, Icons.local_florist_rounded, AppTheme.washRose, 0.24),
    (24, 1.0, Icons.card_giftcard_rounded, AppTheme.accent, 0.19),
    (116, 1.0, Icons.bolt_rounded, AppTheme.washViolet, 0.18),
    (248, 0.62, Icons.percent_rounded, AppTheme.accent, 0.16),
    (58, 0.62, Icons.favorite_rounded, AppTheme.washRose, 0.15),
  ];

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Sized from the space left over after the copy, so a short phone shrinks the artwork
        // rather than pushing the buttons off the bottom.
        final size = constraints.biggest.shortestSide.clamp(200.0, 330.0);

        return Center(
          child: SizedBox(
            width: size,
            height: size,
            child: Stack(
              alignment: Alignment.center,
              children: [
                _Ring(diameter: size),
                _Ring(diameter: size * 0.62),
                BrandMark(size: size * 0.28),
                for (final (degrees, ring, icon, tint, scale) in _orbits)
                  _Bubble(
                    // A ring of diameter `size` has radius `size / 2`, which is exactly the half
                    // extent an Alignment of 1.0 refers to — so cos/sin land the bubble's centre
                    // on the circle with no fudge factor.
                    alignment: Alignment(
                      ring * math.cos(degrees * math.pi / 180),
                      ring * math.sin(degrees * math.pi / 180),
                    ),
                    icon: icon,
                    tint: tint,
                    size: size * scale,
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// An orbit line. White, and faint enough to be felt rather than read.
///
/// It is drawn from a literal rather than from `colorScheme.outlineVariant`, which is where the
/// first version got this wrong: that token is *already* translucent, and `withValues(alpha:)`
/// replaces a colour's alpha instead of scaling it. Asking for "the hairline, at 55%" therefore
/// produced pure black at 55% — a near-solid line that measured 7:1 against the ground and was
/// the hardest edge on a screen whose whole point is softness.
class _Ring extends StatelessWidget {
  const _Ring({required this.diameter});

  final double diameter;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      width: diameter,
      height: diameter,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: Colors.white.withValues(alpha: isDark ? 0.10 : 0.85),
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({
    required this.alignment,
    required this.icon,
    required this.tint,
    required this.size,
  });

  final Alignment alignment;
  final IconData icon;
  final Color tint;
  final double size;

  @override
  Widget build(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    final isDark = brightness == Brightness.dark;

    return Align(
      alignment: alignment,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          // Lit from the top left, like everything else in the design language: the gradient and
          // the shadow offset agree about where the light comes from.
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              tint.withValues(alpha: isDark ? 0.38 : 0.24),
              tint.withValues(alpha: isDark ? 0.20 : 0.11),
            ],
          ),
          border: Border.all(
            color: Colors.white.withValues(alpha: isDark ? 0.12 : 0.7),
          ),
          boxShadow: AppTheme.softShadow(brightness, strength: 0.85),
        ),
        child: Icon(icon, size: size * 0.46, color: tint),
      ),
    );
  }
}
