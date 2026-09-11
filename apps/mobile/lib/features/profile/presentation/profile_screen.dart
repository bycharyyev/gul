import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/config/feature_flags.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/format/money.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/crystal.dart';
import '../../../core/widgets/skeleton.dart';
import '../../support/presentation/support_screen.dart';
import '../domain/profile_overview.dart';
import 'change_password_screen.dart';
import '../../seller/presentation/become_creator_screen.dart';
import 'edit_profile_screen.dart';
import 'email_verification_screen.dart';
import 'legal_page_screen.dart';
import 'referral_screen.dart';
import 'widgets/avatar_editor.dart';
import 'widgets/social_links_row.dart';

/// The slugs the storefront publishes. Every row is shown unconditionally -- vetting each one
/// up front would cost three requests on a screen that needs none of them. The page carries that
/// cost instead: a deleted document lands on a retry, an unwritten one on a plain "not written
/// yet". Neither is a blank screen, so an always-present row stays honest.
const _legalSlugs = ['privacy', 'offer', 'faq'];

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  static const path = '/profile';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final user = ref.watch(authControllerProvider).user;
    final overview = ref.watch(profileOverviewProvider);

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('profile.title'))),
      body: RefreshIndicator(
        onRefresh: () {
          ref.invalidate(socialLinksProvider);
          return ref.refresh(profileOverviewProvider.future);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            16,
            8,
            16,
            AppShell.contentBottomInset,
          ),
          children: [
            if (user != null)
              Row(
                children: [
                  AvatarEditor(avatarUrl: user.avatarUrl),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user.fullName?.trim().isNotEmpty == true
                              ? user.fullName!
                              : user.username,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.4,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          user.phone,
                          style: TextStyle(
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 24),

            // The two extra calls fail soft, so this section degrades on its own without taking
            // the sign-out button -- the reason most people open this screen -- down with it.
            AsyncView<ProfileOverview>(
              value: overview,
              onRetry: () => ref.invalidate(profileOverviewProvider),
              skeleton: const Column(
                children: [
                  Skeleton(height: 82, borderRadius: AppTheme.radiusMedium),
                  SizedBox(height: 12),
                  Skeleton(height: 150, borderRadius: AppTheme.radiusLarge),
                ],
              ),
              data: (data) => Column(
                children: [
                  _EmailCard(status: data.email),
                  // `kReferralRewardsEnabled` gates the whole reward surface, not just this
                  // card: with it off the repository never fetches a summary, so `referral` is
                  // already null. The flag is named here too so a reader looking for "where did
                  // the referral card go" finds the answer at the site they are reading.
                  if (kReferralRewardsEnabled && data.referral != null) ...[
                    const SizedBox(height: 12),
                    // The single home for referrals. It used to be split between here and a card
                    // on Home; one place means one answer to "where is my code".
                    _ReferralCard(referral: data.referral!),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 26),
            _SectionLabel(strings.get('profile.settings')),
            const SizedBox(height: 10),
            _TileGroup(
              children: [
                _Tile(
                  icon: Icons.support_agent_rounded,
                  title: strings.get('support.title'),
                  onTap: () => context.push(SupportScreen.path),
                ),
                _Tile(
                  icon: Icons.badge_outlined,
                  title: strings.get('profile.edit'),
                  onTap: () => context.push(EditProfileScreen.path),
                ),
                _Tile(
                  icon: Icons.language_rounded,
                  title: strings.get('profile.language'),
                  trailing: Text(
                    _languageName(strings.locale),
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  onTap: () => _pickLanguage(context, ref),
                ),
                _Tile(
                  icon: Icons.lock_outline_rounded,
                  title: strings.get('profile.changePassword'),
                  onTap: () => context.push(ChangePasswordScreen.path),
                ),
                // Only where it leads somewhere. A seller already has a shop, and staff cannot
                // have one -- offering it to either is offering a door that answers "no".
                if (ref.watch(authControllerProvider).user?.role == 'CUSTOMER')
                  _Tile(
                    icon: Icons.storefront_outlined,
                    title: strings.get('creator.title'),
                    onTap: () => context.push(
                      '${ProfileScreen.path}/${BecomeCreatorScreen.pathSegment}',
                    ),
                  ),
              ],
            ),

            const SizedBox(height: 26),
            _SectionLabel(strings.get('profile.legal')),
            const SizedBox(height: 10),
            _TileGroup(
              children: [
                for (final slug in _legalSlugs)
                  _Tile(
                    icon: switch (slug) {
                      'privacy' => Icons.shield_outlined,
                      'offer' => Icons.description_outlined,
                      _ => Icons.help_outline_rounded,
                    },
                    title: strings.get('profile.legal.$slug', fallback: slug),
                    onTap: () => context.push('${LegalPageScreen.path}/$slug'),
                  ),
              ],
            ),

            const SizedBox(height: 26),
            const SocialLinksRow(),

            const SizedBox(height: 26),
            // Destructive actions sit apart, at the end, in the error colour -- never next to a
            // routine setting somebody is tapping quickly.
            _TileGroup(
              children: [
                _Tile(
                  icon: Icons.logout_rounded,
                  title: strings.get('profile.logout'),
                  danger: true,
                  onTap: () =>
                      ref.read(authControllerProvider.notifier).logout(),
                ),
                _Tile(
                  icon: Icons.devices_other_rounded,
                  title: strings.get('profile.logoutAll'),
                  danger: true,
                  onTap: () => _confirmLogoutEverywhere(context, ref),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _languageName(String locale) => switch (locale) {
    'en' => 'English',
    'tkm' => 'Türkmen',
    _ => 'Русский',
  };

  Future<void> _pickLanguage(BuildContext context, WidgetRef ref) async {
    final strings = Strings.of(context);
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final locale in ['ru', 'en', 'tkm'])
              ListTile(
                title: Text(_languageName(locale)),
                trailing: locale == strings.locale
                    ? const Icon(Icons.check_rounded)
                    : null,
                onTap: () => Navigator.of(context).pop(locale),
              ),
          ],
        ),
      ),
    );

    if (selected == null || selected == strings.locale) return;

    final user = ref.read(authControllerProvider).user;
    if (user == null) return;

    try {
      await ref.read(profileRepositoryProvider).updateLocale(selected);
      // The server is the record; the local copy follows it, so a failed call leaves the UI in
      // the language the account is actually set to rather than one it only looks set to.
      ref
          .read(authControllerProvider.notifier)
          .applyUser(user.copyWith(locale: selected));
    } on AppException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(strings.error(e))));
    }
  }

  Future<void> _confirmLogoutEverywhere(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final strings = Strings.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(strings.get('profile.logoutAll')),
        content: Text(strings.get('profile.logoutAll.message')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(strings.get('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error,
            ),
            child: Text(strings.get('common.confirm')),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    await ref.read(authControllerProvider.notifier).logoutEverywhere();
  }
}

class _EmailCard extends StatelessWidget {
  const _EmailCard({required this.status});

  final EmailStatus status;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    final (label, icon, color) = switch (status) {
      _ when status.isVerified => (
        strings.get('profile.email.verified'),
        Icons.verified_rounded,
        const Color(0xFF0D9488),
      ),
      _ when status.pendingEmail != null => (
        strings.get('profile.email.pending'),
        Icons.schedule_rounded,
        const Color(0xFFB45309),
      ),
      _ => (
        strings.get('profile.email.missing'),
        Icons.mail_outline_rounded,
        scheme.onSurfaceVariant,
      ),
    };

    return CrystalSurface(
      onTap: () => context.push(EmailVerificationScreen.path),
      padding: const EdgeInsets.all(15),
      child: Row(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  status.email ??
                      status.pendingEmail ??
                      strings.get('profile.email.title'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14.5,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  status.isVerified
                      ? label
                      : '$label · ${strings.get('profile.email.why')}',
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 12.5,
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant),
        ],
      ),
    );
  }
}

class _ReferralCard extends StatelessWidget {
  const _ReferralCard({required this.referral});

  final ReferralSummary referral;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return GestureDetector(
      onTap: () => context.push(ReferralScreen.path),
      child: BrandGradient(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    strings.get('profile.referral.title'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: Colors.white70),
              ],
            ),
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    strings.get('profile.referral.code'),
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.8),
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    referral.username,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 17,
                      letterSpacing: 0.4,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                if (referral.balanceTmt != null)
                  _Stat(
                    label: strings.get('profile.referral.balance'),
                    value: Money.tmt(referral.balanceTmt!, strings.locale),
                  ),
                _Stat(
                  label: strings.get('profile.referral.invited'),
                  value: '${referral.totalReferred}',
                ),
                _Stat(
                  label: strings.get('profile.referral.rewarded'),
                  value: '${referral.rewarded}',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.78),
              fontSize: 11.5,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 15,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 4),
    child: Text(
      text,
      style: Theme.of(context).textTheme.titleSmall?.copyWith(
        fontWeight: FontWeight.w700,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    ),
  );
}

/// Rows grouped into one translucent card, with hairline separators — the settings-list shape
/// people already know, instead of a stack of floating rows on a bare page.
class _TileGroup extends StatelessWidget {
  const _TileGroup({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return CrystalSurface(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0)
              Divider(height: 1, indent: 54, color: scheme.outlineVariant),
            children[i],
          ],
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.trailing,
    this.danger = false,
  });

  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final Widget? trailing;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = danger ? scheme.error : scheme.onSurface;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16),
      leading: Icon(
        icon,
        color: danger ? scheme.error : scheme.primary,
        size: 22,
      ),
      title: Text(
        title,
        style: TextStyle(color: color, fontWeight: FontWeight.w500),
      ),
      trailing:
          trailing ??
          (danger
              ? null
              : Icon(
                  Icons.chevron_right_rounded,
                  color: scheme.onSurfaceVariant,
                )),
      onTap: onTap,
    );
  }
}
