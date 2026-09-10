import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../../../core/widgets/status_chip.dart';
import '../domain/order.dart';

class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  static const pathSegment = 'detail';
  static const path = '/home/orders/detail';

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final order = ref.watch(orderDetailProvider(orderId));

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('orders.detail.title'))),
      body: AsyncView<OrderSummary>(
        value: order,
        onRetry: () => ref.invalidate(orderDetailProvider(orderId)),
        skeleton: const Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            children: [
              Skeleton(height: 96, borderRadius: 18),
              SizedBox(height: 16),
              Skeleton(height: 220, borderRadius: 18),
            ],
          ),
        ),
        data: (order) => _Detail(order: order),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.order});

  final OrderSummary order;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        // The headline answers the two questions someone opens this screen with: how much, and
        // what is happening to it.
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                order.title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                Money.tmt(order.amountTmt, strings.locale),
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 12),
              StatusChip(status: order.status),
            ],
          ),
        ),

        if (order.isAwaitingPayment) ...[
          const SizedBox(height: 14),
          // The one place the app tells the truth about how payment actually works here: a person
          // confirms it by hand. Pretending a card was charged would be a lie the backend cannot
          // back up.
          _Notice(text: strings.get('orders.detail.awaitingPayment')),
        ],

        if (order.failureReason != null) ...[
          const SizedBox(height: 14),
          _Notice(
            text:
                '${strings.get('orders.detail.failure')}: ${order.failureReason}',
            tone: _NoticeTone.danger,
          ),
        ],

        if (order.deliveryNote != null) ...[
          const SizedBox(height: 14),
          _CopyRow(
            label: strings.get('orders.detail.note'),
            value: order.deliveryNote!,
          ),
        ],

        const SizedBox(height: 20),
        _Section(
          title: strings.get('orders.detail.summary'),
          rows: [
            if (order.subtitle != null)
              _Row(strings.get('orders.detail.recipient'), order.subtitle!),
            _Row(
              strings.get('orders.detail.amount'),
              Money.tmt(order.amountTmt, strings.locale),
            ),
            // Only shown when it exists and differs — a "Fee: 0 TMT" line is noise, and repeating
            // the amount as "Total" when nothing was added to it is worse than saying nothing.
            if (order.feeAmount != null && order.feeAmount! > 0)
              _Row(
                strings.get('orders.detail.fee'),
                Money.amount(order.feeAmount!, strings.locale),
              ),
            if (order.referralDiscountTmt != null &&
                order.referralDiscountTmt! > 0)
              _Row(
                strings.get('orders.detail.discount'),
                '−${Money.tmt(order.referralDiscountTmt!, strings.locale)}',
              ),
            if (order.amountCharged != null && order.currency != null)
              _Row(
                strings.get('orders.detail.charged'),
                '${Money.amount(order.amountCharged!, strings.locale)} ${order.currency}',
              ),
          ],
        ),

        const SizedBox(height: 16),
        _Section(
          title: strings.get('orders.detail.id'),
          rows: [
            if (order.createdAt != null)
              _Row(
                strings.get('orders.detail.created'),
                Dates.dateTime(order.createdAt!, strings.locale),
              ),
            if (order.paidAt != null)
              _Row(
                strings.get('orders.detail.paid'),
                Dates.dateTime(order.paidAt!, strings.locale),
              ),
            if (order.completedAt != null)
              _Row(
                strings.get('orders.detail.completed'),
                Dates.dateTime(order.completedAt!, strings.locale),
              ),
          ],
        ),

        const SizedBox(height: 16),
        _CopyRow(
          label: strings.get('orders.detail.id'),
          value: order.id,
          monospace: true,
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.rows});

  final String title;
  final List<_Row> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: scheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0) Divider(height: 1, color: scheme.outlineVariant),
                rows[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13.5),
            ),
          ),
          const SizedBox(width: 16),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 13.5,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A value worth copying — an activation code, an order number to quote to support.
class _CopyRow extends StatelessWidget {
  const _CopyRow({
    required this.label,
    required this.value,
    this.monospace = false,
  });

  final String label;
  final String value;
  final bool monospace;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Material(
      color: scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          await Clipboard.setData(ClipboardData(text: value));
          if (!context.mounted) return;
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(
              SnackBar(content: Text(strings.get('common.copied'))),
            );
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        color: scheme.onSurfaceVariant,
                        fontSize: 12.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      value,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        fontFamily: monospace ? 'monospace' : null,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Icon(
                Icons.copy_rounded,
                size: 18,
                color: scheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _NoticeTone { info, danger }

class _Notice extends StatelessWidget {
  const _Notice({required this.text, this.tone = _NoticeTone.info});

  final String text;
  final _NoticeTone tone;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDanger = tone == _NoticeTone.danger;
    final background = isDanger
        ? scheme.errorContainer
        : scheme.primaryContainer;
    final foreground = isDanger
        ? scheme.onErrorContainer
        : scheme.onPrimaryContainer;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            isDanger ? Icons.error_outline_rounded : Icons.info_outline_rounded,
            size: 19,
            color: foreground,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: foreground, height: 1.35, fontSize: 13.5),
            ),
          ),
        ],
      ),
    );
  }
}
