import 'package:flutter/material.dart';

/// The app's visual identity: **Crystal**.
///
/// The brand hues stay exactly what the web storefront uses — violet `brand.500` with a teal
/// accent — because a customer moving between the site and the app must recognise one product.
/// What changed is everything around them: flat white cards on a flat grey page read as a form,
/// which is what made the first pass feel like a website from a decade ago.
///
/// Crystal replaces that with three ideas, applied consistently:
///
/// * **an ambient ground** — a soft violet/teal/rose wash instead of flat grey, so surfaces have
///   something to sit *on* rather than merge into (see [AmbientBackground]);
/// * **translucent surfaces** — cards are white at 78–86% over that wash with a hairline light
///   border, so the ground tints them and depth comes from layering rather than from a drop
///   shadow drawn on nothing;
/// * **generous radii and air** — 20–28dp corners and a wider spacing rhythm.
///
/// **Real blur is used in exactly one place**: the floating navigation bar. `BackdropFilter` is
/// the most expensive thing in this design language, and a phone that stutters while scrolling a
/// product grid has not been made to feel premium — it has been made to feel cheap. Everywhere
/// else the same look is achieved with translucent fills over the ambient ground, which costs
/// nothing.
class AppTheme {
  const AppTheme._();

  // ---- Brand, unchanged from apps/web's Tailwind config ----
  static const brand = Color(0xFF6D4BFF); // brand.500
  static const brandDark = Color(0xFF5A2FEE); // brand.600
  static const brandLight = Color(0xFF8570FF); // brand.400
  static const accent = Color(0xFF14B8A6); // accent.500

  /// The three washes that make the ambient ground. Kept here so the background, the nav bar and
  /// any hero surface all bloom from the same light.
  static const washViolet = Color(0xFF8570FF);
  static const washTeal = Color(0xFF2DD4BF);
  static const washRose = Color(0xFFFF8FB1);

  static const canvasLight = Color(0xFFF7F6FC);
  static const canvasDark = Color(0xFF0A0A14);

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final scheme =
        ColorScheme.fromSeed(seedColor: brand, brightness: brightness).copyWith(
          primary: isDark ? brandLight : brand,
          secondary: accent,
          // Surfaces are translucent at the widget level (see CrystalSurface); the scheme value is
          // the opaque fallback for anything Material paints itself.
          surface: isDark ? const Color(0xFF14141F) : Colors.white,
          outlineVariant: isDark
              ? const Color(0x1FFFFFFF)
              : const Color(0x14000000),
        );

    final base = ThemeData(colorScheme: scheme, useMaterial3: true);

    return base.copyWith(
      // Every screen is transparent so the one ambient ground shows through. Android's default
      // zoom transition assumes the opposite: it paints its own scrim behind the animating pages,
      // which over a transparent page is visible as a flash of flat colour before the gradient
      // snaps back. `FadeUpwards` slides and fades without painting anything of its own.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.fuchsia: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.linux: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.windows: FadeUpwardsPageTransitionsBuilder(),
        },
      ),
      // Transparent: AmbientBackground paints the ground, and a scaffold colour on top of it
      // would hide the whole point.
      scaffoldBackgroundColor: Colors.transparent,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: base.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
          color: scheme.onSurface,
        ),
      ),
      textTheme: base.textTheme
          .apply(fontFamily: null)
          .copyWith(
            headlineSmall: base.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: -0.6,
            ),
            titleLarge: base.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4,
            ),
            titleMedium: base.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: -0.2,
            ),
          ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark
            ? const Color(0x14FFFFFF)
            : Colors.white.withValues(alpha: 0.72),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 18,
        ),
        border: _field(scheme.outlineVariant),
        enabledBorder: _field(scheme.outlineVariant),
        focusedBorder: _field(scheme.primary, width: 1.6),
        errorBorder: _field(scheme.error),
        focusedErrorBorder: _field(scheme.error, width: 1.6),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          // 54dp: the primary action on a phone deserves to be the easiest thing to hit.
          minimumSize: const Size.fromHeight(54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusPill),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.1,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(50),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusPill),
          ),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(48, 48),
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusPill),
        ),
        side: BorderSide(color: scheme.outlineVariant),
        backgroundColor: isDark
            ? const Color(0x14FFFFFF)
            : Colors.white.withValues(alpha: 0.7),
        selectedColor: scheme.primary.withValues(alpha: isDark ? 0.28 : 0.14),
        showCheckmark: false,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      dialogTheme: DialogThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusLarge),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(radiusLarge),
          ),
        ),
        backgroundColor: isDark ? const Color(0xFF14141F) : Colors.white,
      ),
    );
  }

  // ---- Shape tokens. One scale, so nothing invents its own corner. ----
  static const double radiusSmall = 14;
  static const double radiusMedium = 20;
  static const double radiusLarge = 28;
  static const double radiusPill = 999;

  static OutlineInputBorder _field(Color color, {double width = 1}) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusSmall + 2),
        borderSide: BorderSide(color: color, width: width),
      );

  /// The soft, wide, low-opacity shadow the whole design uses. One definition, so surfaces at the
  /// same level cast the same light.
  static List<BoxShadow> softShadow(
    Brightness brightness, {
    double strength = 1,
  }) {
    final isDark = brightness == Brightness.dark;
    return [
      BoxShadow(
        color: (isDark ? Colors.black : const Color(0xFF1F1052)).withValues(
          alpha: (isDark ? 0.32 : 0.06) * strength,
        ),
        blurRadius: 28 * strength,
        offset: Offset(0, 10 * strength),
      ),
    ];
  }
}
