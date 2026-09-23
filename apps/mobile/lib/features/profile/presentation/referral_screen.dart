import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../app/providers.dart';
import '../../../core/format/money.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../domain/profile_overview.dart';

class ReferralScreen extends ConsumerWidget {
  const ReferralScreen({super.key});

  static const path = '/profile/referral';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final overview = ref.watch(profileOverviewProvider);

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('profile.referral.title'))),
      body: AsyncView<ProfileOverview>(
        value: overview,
        onRetry: () => ref.invalidate(profileOverviewProvider),
        skeleton: const Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            children: [
              Skeleton(height: 140, borderRadius: 18),
              SizedBox(height: 16),
              Skeleton(height: 96, borderRadius: 16),
            ],
          ),
        ),
        isEmpty: (data) => data.referral == null,
        empty: EmptyState(
          // A gift box reads as "you'll receive something"; this screen is about inviting people,
          // not receiving a gift, so the empty state should say that at a glance too.
          icon: Icons.diversity_3_rounded,
          title: strings.get('referral.unavailable'),
        ),
        data: (data) => _Content(referral: data.referral!),
      ),
    );
  }
}

class _Content extends ConsumerStatefulWidget {
  const _Content({required this.referral});

  final ReferralSummary referral;

  @override
  ConsumerState<_Content> createState() => _ContentState();
}

class _ContentState extends ConsumerState<_Content> {
  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final referral = widget.referral;
    final link = ref.watch(appConfigProvider).referralLink(referral.username);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: scheme.primaryContainer,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.diversity_3_rounded,
                    size: 16,
                    color: scheme.onPrimaryContainer,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    strings.get('referral.code'),
                    style: TextStyle(
                      color: scheme.onPrimaryContainer,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              SelectableText(
                referral.username,
                style: TextStyle(
                  color: scheme.onPrimaryContainer,
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                link,
                style: TextStyle(
                  color: scheme.onPrimaryContainer.withValues(alpha: 0.75),
                  fontSize: 12.5,
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => _share(context, link),
                      icon: const Icon(Icons.ios_share_rounded, size: 18),
                      label: Text(strings.get('referral.share')),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    width: 52,
                    height: 52,
                    child: IconButton.filledTonal(
                      tooltip: strings.get('common.copied'),
                      onPressed: () => _copy(context, link),
                      icon: const Icon(Icons.copy_rounded, size: 20),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 18),
        // Deliberately vague about the amount. `ReferralSettings.customerRewardTmt` is only
        // readable through an ADMIN/MANAGER route, so the app has no honest way to name a figure
        // — and inventing one would be a promise the product might not keep (GAP 11).
        _Note(text: strings.get('referral.how')),

        const SizedBox(height: 22),
        Row(
          children: [
            _Stat(
              label: strings.get('profile.referral.invited'),
              value: '${referral.totalReferred}',
            ),
            _Stat(
              label: strings.get('profile.referral.rewarded'),
              value: '${referral.rewarded}',
            ),
            _Stat(
              label: strings.get('referral.pending'),
              value: '${referral.pending}',
            ),
          ],
        ),

        if (referral.balanceTmt != null) ...[
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        strings.get('home.balance.title'),
                        style: TextStyle(
                          color: scheme.onSurfaceVariant,
                          fontSize: 12.5,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        strings.get('home.balance.hint'),
                        style: TextStyle(
                          color: scheme.onSurfaceVariant,
                          fontSize: 11.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  Money.tmt(referral.balanceTmt!, strings.locale),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _copy(BuildContext context, String link) async {
    final strings = Strings.of(context);
    // The link, not the bare code: pasted into a chat it is one tap for the friend, and the code
    // is still readable inside it for anyone who would rather type it.
    await Clipboard.setData(ClipboardData(text: link));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(strings.get('common.copied'))));
  }

  Future<void> _share(BuildContext context, String link) async {
    final strings = Strings.of(context);
    // An invitation is a link. `/r/<code>` on the storefront stores the code and carries it into
    // registration, so the invite still counts if the friend browses first and signs up later.
    await Share.share('${strings.get('referral.shareText')}\n$link');
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Expanded(
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 20,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 2,
              style: TextStyle(
                color: scheme.onSurfaceVariant,
                fontSize: 11.5,
                height: 1.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.info_outline_rounded,
            size: 19,
            color: scheme.onSurfaceVariant,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: scheme.onSurfaceVariant,
                height: 1.4,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
