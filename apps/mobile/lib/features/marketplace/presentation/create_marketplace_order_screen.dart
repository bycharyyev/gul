import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/crystal.dart';
import '../domain/marketplace_cart.dart';
import 'marketplace_home_screen.dart';
import 'marketplace_order_detail_screen.dart';

/// Checkout for a basket that was filled on the Cargo screen.
///
/// It used to be the whole flow -- paste, preview, add, then address -- which meant three
/// navigations before the first useful action. The link field moved to Cargo, where it is the
/// first thing a customer meets, and what is left here is the part that genuinely belongs at the
/// end: where the parcel goes, and in which currency the shops will be paid.
///
/// There is deliberately no spending limit on this screen. The limit is agreed against a quoted
/// total, and nobody has quoted anything yet -- asking for it here would be asking someone to
/// cap a number they have not been shown.
class CreateMarketplaceOrderScreen extends ConsumerStatefulWidget {
  const CreateMarketplaceOrderScreen({super.key});
  static const path = 'new';

  @override
  ConsumerState<CreateMarketplaceOrderScreen> createState() => _State();
}

class _State extends ConsumerState<CreateMarketplaceOrderScreen> {
  static const _currencies = ['RUB', 'USD', 'TRY', 'CNY'];

  final _address = TextEditingController();
  String _currency = _currencies.first;
  var _submitting = false;
  String? _error;

  /// Generated once per screen, not per submit: a retry after a timeout must carry the SAME key,
  /// or the server treats it as a second order for goods the customer asked for once.
  late final String _idempotencyKey =
      'mobile-buy-${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 32)}';

  @override
  void dispose() {
    _address.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final strings = Strings.of(context);
    final cart = ref.read(marketplaceCartProvider);
    if (cart.isEmpty || _address.text.trim().length < 5) {
      setState(() => _error = strings.get('marketplace.formError'));
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final order = await ref
          .read(marketplaceRepositoryProvider)
          .create(
            items: cart,
            currency: _currency,
            deliveryAddress: _address.text,
            idempotencyKey: _idempotencyKey,
          );
      ref.read(marketplaceCartProvider.notifier).clear();
      ref.invalidate(marketplaceOrdersProvider);
      if (!mounted) return;
      context.go(
        '${MarketplaceHomeScreen.routeBase}/${MarketplaceOrderDetailScreen.pathSegment}/${order.id}',
      );
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is String ? error : strings.get('err.unknown'),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final cart = ref.watch(marketplaceCartProvider);

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('marketplace.cartTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
        children: [
          if (cart.isEmpty)
            CrystalSurface(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(strings.get('marketplace.cartEmpty')),
              ),
            )
          else
            ...cart.asMap().entries.map((entry) {
              final index = entry.key;
              final item = entry.value;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: CrystalSurface(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.preview.sourceName,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              if (item.preview.externalId != null)
                                Text(
                                  '${strings.get('marketplace.article')} ${item.preview.externalId}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: scheme.onSurfaceVariant,
                                    fontFeatures: const [
                                      FontFeature.tabularFigures(),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: strings.get('marketplace.decrease'),
                          onPressed: item.quantity > 1
                              ? () => ref
                                    .read(marketplaceCartProvider.notifier)
                                    .setQuantity(index, item.quantity - 1)
                              : null,
                          icon: const Icon(Icons.remove_rounded, size: 18),
                        ),
                        Text(
                          '${item.quantity}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                        IconButton(
                          tooltip: strings.get('marketplace.increase'),
                          onPressed: item.quantity < 99
                              ? () => ref
                                    .read(marketplaceCartProvider.notifier)
                                    .setQuantity(index, item.quantity + 1)
                              : null,
                          icon: const Icon(Icons.add_rounded, size: 18),
                        ),
                        IconButton(
                          tooltip: strings.get('marketplace.remove'),
                          onPressed: () => ref
                              .read(marketplaceCartProvider.notifier)
                              .removeAt(index),
                          icon: const Icon(Icons.close_rounded, size: 18),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          const SizedBox(height: 14),
          Text(
            strings.get('marketplace.manualReview'),
            style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _address,
            minLines: 2,
            maxLines: 4,
            decoration: InputDecoration(
              labelText: strings.get('marketplace.address'),
            ),
          ),
          const SizedBox(height: 14),
          DropdownButtonFormField<String>(
            initialValue: _currency,
            decoration: InputDecoration(
              labelText: strings.get('marketplace.currency'),
            ),
            items: [
              for (final code in _currencies)
                DropdownMenuItem(value: code, child: Text(code)),
            ],
            onChanged: (value) =>
                setState(() => _currency = value ?? _currencies.first),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Semantics(
              liveRegion: true,
              child: Text(_error!, style: TextStyle(color: scheme.error)),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _submitting || cart.isEmpty ? null : _submit,
            child: Text(
              _submitting
                  ? strings.get('common.loading')
                  : strings.get('marketplace.sendReview'),
            ),
          ),
        ],
      ),
    );
  }
}
