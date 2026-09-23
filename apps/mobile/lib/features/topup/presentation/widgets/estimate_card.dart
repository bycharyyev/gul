import 'package:flutter/material.dart';

import '../../../../core/format/money.dart';
import '../../../../core/l10n/strings.dart';
import '../../domain/topup_options.dart';

/// What the customer will pay, approximately.
///
/// Labelled `≈` and titled "estimate" in every locale, because it is computed on the client and
/// the server has the last word — an available referral balance is deducted at creation time, so
/// the real figure can come out lower. Calling this a "total" would be a number the receipt then
/// contradicts.
class EstimateCard extends StatelessWidget {
  const EstimateCard({super.key, required this.estimate, required this.method});

  final TopupEstimate estimate;
  final PaymentMethodOption method;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            strings.get('topup.estimate.title'),
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 10),
          _Line(
            label: strings.get('topup.estimate.recipientGets'),
            value: Money.tmt(estimate.amountTmt, strings.locale),
          ),
          // A zero fee is not a line worth printing.
          if (estimate.fee > 0)
            _Line(
              label:
                  '${strings.get('orders.detail.fee')} · ${formatPercent(method.feePercent)}',
              value:
                  '${Money.amount(estimate.fee, strings.locale)} ${estimate.currency}',
            ),
          const SizedBox(height: 8),
          Divider(height: 1, color: scheme.outlineVariant),
          const SizedBox(height: 12),
          // Wrap rather than Row: at the largest text size the label and a four-figure total do
          // not share one line, and the total is the number the customer came here to read.
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 12,
            runSpacing: 4,
            children: [
              Text(
                strings.get('topup.estimate.youPay'),
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
              Text(
                '≈ ${Money.amount(estimate.total, strings.locale)} ${estimate.currency}',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 19,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            strings.get('topup.estimate.note'),
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 11.5,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

/// `0%` rather than `0.0%` when the value is whole — a fee line is read at a glance.
String formatPercent(double value) =>
    value == value.roundToDouble() ? '${value.round()}%' : '$value%';

class _Line extends StatelessWidget {
  const _Line({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
