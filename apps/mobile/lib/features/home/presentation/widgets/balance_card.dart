import 'package:flutter/material.dart';

import '../../../../core/format/money.dart';
import '../../../../core/l10n/strings.dart';
import '../../../../core/theme/app_theme.dart';

/// The referral balance.
///
/// Called "referral balance", never "wallet" or "balance" alone. There is no customer wallet on
/// this backend — no deposits, no withdrawals — and a card labelled "Balance" would promise a
/// mechanism that does not exist. The subtitle says exactly what the money does instead.
class BalanceCard extends StatelessWidget {
  const BalanceCard({
    super.key,
    required this.greeting,
    required this.balanceTmt,
  });

  final String greeting;

  /// Null for sellers and when the referral call failed — the card then shows just the greeting
  /// rather than a misleading zero.
  final double? balanceTmt;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          colors: [AppTheme.brand, AppTheme.brandDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            greeting,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (balanceTmt != null) ...[
            const SizedBox(height: 18),
            Text(
              strings.get('home.balance.title'),
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.78),
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              Money.tmt(balanceTmt!, strings.locale),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 30,
                fontWeight: FontWeight.w700,
                // Tabular figures so the amount does not jitter when it changes after an order.
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(height: 6),
            Text(
              strings.get('home.balance.hint'),
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.72),
                fontSize: 12,
                height: 1.35,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
