import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/format/dates.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/crystal.dart';
import '../domain/marketplace_models.dart';

class MarketplaceOrderDetailScreen extends ConsumerWidget {
  const MarketplaceOrderDetailScreen({super.key, required this.orderId});
  static const pathSegment = 'order';
  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(strings.get('marketplace.order'))),
      body: AsyncView(
        value: ref.watch(marketplaceOrderProvider(orderId)),
        onRetry: () => ref.invalidate(marketplaceOrderProvider(orderId)),
        skeleton: const Center(child: CircularProgressIndicator()),
        data: (order) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Semantics(
              header: true,
              child: Text(
                strings.get(
                  'status.${order.status.toLowerCase()}',
                  fallback: order.status,
                ),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            const SizedBox(height: 12),
            CrystalSurface(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Zero is not an amount here, it is the absence of one: nobody has priced the
                    // order yet. Printing "0.00 TMT" reads as free, or as a broken total.
                    Text(
                      '${strings.get('marketplace.expected')}: ${_amount(strings, order.expectedAmount)}',
                    ),
                    Text(
                      '${strings.get('marketplace.maximum')}: ${_amount(strings, order.maximumAuthorizedAmount)}',
                    ),
                    Text(
                      '${strings.get('marketplace.address')}: ${order.deliveryAddress}',
                    ),
                  ],
                ),
              ),
            ),
            if (order.status == 'QUOTED' && order.latestQuote != null) ...[
              const SizedBox(height: 12),
              _QuoteAcceptanceCard(
                orderId: order.id,
                quote: order.latestQuote!,
              ),
            ],
            const SizedBox(height: 20),
            Text(
              strings.get('marketplace.items'),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            // What was actually ordered. Absent until now: the screen showed a status, a total
            // and an address, and nothing that said which product any of it was about.
            for (final item in order.items) _OrderedItem(item: item),
            // A heading with nothing under it is worse than no heading. The API sends no events
            // for an order yet, so this section only appears once there is something in it.
            if (order.events.isNotEmpty) ...[
              const SizedBox(height: 20),
              Text(
                strings.get('marketplace.timeline'),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
            ],
            ...order.events.map(
              (event) => ListTile(
                leading: const Icon(Icons.circle, size: 12),
                title: Text(
                  strings.get(
                    'status.${event.status.toLowerCase()}',
                    fallback: event.status,
                  ),
                ),
                subtitle: Text(
                  [
                    Dates.dateTime(event.createdAt.toLocal(), strings.locale),
                    event.note,
                  ].whereType<String>().join('\n'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuoteAcceptanceCard extends ConsumerStatefulWidget {
  const _QuoteAcceptanceCard({required this.orderId, required this.quote});

  final String orderId;
  final MarketplaceQuote quote;

  @override
  ConsumerState<_QuoteAcceptanceCard> createState() =>
      _QuoteAcceptanceCardState();
}

class _QuoteAcceptanceCardState extends ConsumerState<_QuoteAcceptanceCard> {
  late final TextEditingController _cap = TextEditingController(
    text: (widget.quote.totalTmt * 1.2).ceilToDouble().toStringAsFixed(2),
  );
  bool _consent = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _cap.dispose();
    super.dispose();
  }

  Future<void> _accept() async {
    final strings = Strings.of(context);
    final cap = double.tryParse(_cap.text.replaceAll(',', '.'));
    if (cap == null || cap < widget.quote.totalTmt || !_consent) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(marketplaceRepositoryProvider)
          .acceptQuote(
            orderId: widget.orderId,
            quoteVersion: widget.quote.version,
            maxAuthorizedTmt: cap,
          );
      ref.invalidate(marketplaceOrderProvider(widget.orderId));
      ref.invalidate(marketplaceOrdersProvider);
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is String ? error : strings.get('err.unknown'),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final cap = double.tryParse(_cap.text.replaceAll(',', '.')) ?? 0;

    return CrystalSurface(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              strings.get('marketplace.maximum'),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _cap,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                suffixText: 'TMT',
                helperText:
                    '${strings.get('marketplace.maximumHelp')} ${strings.get('marketplace.reserveReturnHelp')}',
              ),
            ),
            const SizedBox(height: 10),
            CheckboxListTile(
              value: _consent,
              onChanged: (value) => setState(() => _consent = value ?? false),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              title: Text(strings.get('marketplace.consent')),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: scheme.error)),
            ],
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _busy || !_consent || cap < widget.quote.totalTmt
                  ? null
                  : _accept,
              child: Text(
                _busy
                    ? strings.get('common.loading')
                    : strings.get('marketplace.create'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// An amount, or a plain dash when there is not one yet.
///
/// A pre-quote order genuinely has no total; rendering the stored zero as "0.00 TMT" told people
/// their order was free.
String _amount(Strings strings, double value) => value > 0
    ? '${value.toStringAsFixed(2)} TMT'
    : strings.get('marketplace.notPricedYet');

/// One line of what was ordered.
class _OrderedItem extends StatelessWidget {
  const _OrderedItem({required this.item});

  final MarketplaceCartItem item;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final preview = item.preview;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: CrystalSurface(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                preview.title ?? preview.sourceName,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                [
                  preview.sourceName,
                  if (preview.externalId != null)
                    '${strings.get('marketplace.article')} ${preview.externalId}',
                  '${item.quantity} ${strings.get('marketplace.pieces')}',
                ].join(' · '),
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
              if (preview.priceCurrent != null) ...[
                const SizedBox(height: 6),
                Text(
                  '${preview.priceCurrent!.toStringAsFixed(0)} ${preview.priceCurrency ?? ''}',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  // Says which figure this is. Nothing unverified may pass for a checked one.
                  preview.factsSource == null
                      ? strings.get('marketplace.shopPriceNote')
                      : strings.get('marketplace.preview.unverified'),
                  style: TextStyle(
                    fontSize: 11.5,
                    height: 1.3,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
