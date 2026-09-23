import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/providers.dart';
import '../../../../core/l10n/strings.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../home/domain/promo.dart';

/// The shop's social accounts.
///
/// Absent rather than broken when the call fails: the repository returns an empty list and this
/// renders nothing. A "could not load social links" error on the screen someone opened to sign
/// out would be noise about something nobody was looking for.
///
/// Links open **outside** the app. An embedded webview is the wrong place for Instagram or
/// TikTok -- both detect one and refuse to sign a person in.
class SocialLinksRow extends ConsumerWidget {
  const SocialLinksRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final links =
        ref.watch(socialLinksProvider).valueOrNull ?? const <SocialLink>[];
    if (links.isEmpty) return const SizedBox.shrink();

    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          strings.get('profile.social'),
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: scheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final link in links)
              _SocialChip(
                link: link,
                onTap: () =>
                    ref.read(externalLinksProvider).open(context, link.url),
              ),
          ],
        ),
      ],
    );
  }
}

class _SocialChip extends StatelessWidget {
  const _SocialChip({required this.link, required this.onTap});

  final SocialLink link;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (icon, label) = _presentation(link);

    return Material(
      color: Colors.white.withValues(
        alpha: Theme.of(context).brightness == Brightness.dark ? 0.06 : 0.82,
      ),
      borderRadius: BorderRadius.circular(AppTheme.radiusPill),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
        onTap: onTap,
        child: Container(
          // 44dp tall: a social chip is a real touch target, not a decoration.
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppTheme.radiusPill),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13.5,
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                Icons.north_east_rounded,
                size: 13,
                color: scheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// A platform the app has not been taught about still renders, with a generic link icon and its
  /// own name -- better than hiding a channel the shop is actually on.
  static (IconData, String) _presentation(SocialLink link) {
    final label = link.label?.trim().isNotEmpty == true
        ? link.label!
        : _titleCase(link.platform);

    final icon = switch (link.platform.toUpperCase()) {
      'INSTAGRAM' => Icons.camera_alt_outlined,
      'TIKTOK' => Icons.music_note_rounded,
      'TELEGRAM' => Icons.send_rounded,
      'YOUTUBE' => Icons.play_circle_outline_rounded,
      'FACEBOOK' => Icons.facebook_rounded,
      'WHATSAPP' => Icons.chat_bubble_outline_rounded,
      _ => Icons.link_rounded,
    };

    return (icon, label);
  }

  static String _titleCase(String value) {
    if (value.isEmpty) return value;
    return value[0].toUpperCase() + value.substring(1).toLowerCase();
  }
}
