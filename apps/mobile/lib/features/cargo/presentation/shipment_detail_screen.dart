import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/format/money.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/crystal.dart';
import '../../../core/widgets/skeleton.dart';
import '../../../core/widgets/status_chip.dart';
import '../domain/cargo_models.dart';

final _shipmentProvider = FutureProvider.autoDispose.family<Shipment, String>(
  (ref, id) => ref.watch(cargoRepositoryProvider).loadOne(id),
);

class ShipmentDetailScreen extends ConsumerWidget {
  const ShipmentDetailScreen({super.key, required this.shipmentId});

  final String shipmentId;

  static const pathSegment = 'shipments';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final shipment = ref.watch(_shipmentProvider(shipmentId));

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('cargo.detail.title'))),
      body: AsyncView<Shipment>(
        value: shipment,
        onRetry: () => ref.invalidate(_shipmentProvider(shipmentId)),
        skeleton: const _Skeleton(),
        data: (s) => _Content(shipment: s, shipmentId: shipmentId),
      ),
    );
  }
}

class _Content extends ConsumerStatefulWidget {
  const _Content({required this.shipment, required this.shipmentId});

  final Shipment shipment;
  final String shipmentId;

  @override
  ConsumerState<_Content> createState() => _ContentState();
}

class _ContentState extends ConsumerState<_Content> {
  bool _pickupFormOpen = false;
  final _address = TextEditingController();
  final _timeWindow = TextEditingController();
  final _phone = TextEditingController();
  DateTime? _date;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _address.text = widget.shipment.pickupAddress;
    _phone.text = widget.shipment.senderPhone;
  }

  @override
  void dispose() {
    _address.dispose();
    _timeWindow.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submitPickup() async {
    final strings = Strings.of(context);
    if (_date == null ||
        _address.text.trim().isEmpty ||
        _timeWindow.text.trim().isEmpty) {
      setState(() => _error = strings.get('gallery.validation.required'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(cargoRepositoryProvider)
          .requestPickup(
            widget.shipmentId,
            address: _address.text.trim(),
            requestedDate: _date!,
            timeWindow: _timeWindow.text.trim(),
            phone: _phone.text.trim(),
          );
      if (!mounted) return;
      setState(() => _pickupFormOpen = false);
      ref.invalidate(_shipmentProvider(widget.shipmentId));
    } on AppException catch (e) {
      if (mounted) setState(() => _error = Strings.of(context).error(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final s = widget.shipment;
    final canRequestPickup = s.status == 'PAID' && s.pickup == null;

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        16,
        16,
        16,
        AppShell.contentBottomInset,
      ),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.publicTrackingNumber,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text('${s.originCity.name} → ${s.destinationCity.name}'),
                ],
              ),
            ),
            StatusChip(status: s.status),
          ],
        ),
        const SizedBox(height: 18),
        CrystalSurface(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.itemType.name),
                const SizedBox(height: 4),
                Text(
                  '${s.declaredWeightKg} kg',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontSize: 12.5,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      strings.get('cargo.paymentMethod'),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        fontSize: 12.5,
                      ),
                    ),
                    Text(
                      s.paymentMethod.name,
                      style: const TextStyle(fontSize: 12.5),
                    ),
                  ],
                ),
                const Divider(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      strings.get('cargo.total'),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      Money.tmt(s.totalPriceTmt, strings.locale),
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 22),
        Text(
          strings.get('cargo.timeline'),
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
        const SizedBox(height: 12),
        ...s.trackingEvents.map(
          (ev) => Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  margin: const EdgeInsets.only(top: 5),
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        strings.get(
                          'status.${ev.status.toLowerCase()}',
                          fallback: ev.status,
                        ),
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        _formatDate(ev.createdAt, strings.locale),
                        style: TextStyle(
                          fontSize: 11.5,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                      if (ev.note != null)
                        Text(ev.note!, style: const TextStyle(fontSize: 12.5)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        if (canRequestPickup) ...[
          const SizedBox(height: 12),
          if (!_pickupFormOpen)
            FilledButton(
              onPressed: () => setState(() => _pickupFormOpen = true),
              child: Text(strings.get('cargo.requestPickup')),
            )
          else
            CrystalSurface(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      strings.get('cargo.requestPickup'),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _address,
                      decoration: InputDecoration(
                        labelText: strings.get('cargo.pickupAddress'),
                      ),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton(
                      onPressed: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: DateTime.now().add(
                            const Duration(days: 1),
                          ),
                          firstDate: DateTime.now(),
                          lastDate: DateTime.now().add(
                            const Duration(days: 60),
                          ),
                        );
                        if (picked != null) setState(() => _date = picked);
                      },
                      child: Text(
                        _date == null
                            ? strings.get('cargo.pickupDate')
                            : _formatDate(_date!, strings.locale),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _timeWindow,
                      decoration: InputDecoration(
                        labelText: strings.get('cargo.timeWindow'),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: InputDecoration(
                        labelText: strings.get('cargo.pickupPhone'),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _error!,
                        style: const TextStyle(
                          color: Colors.red,
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: _busy ? null : _submitPickup,
                      child: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(strings.get('cargo.requestPickupSubmit')),
                    ),
                  ],
                ),
              ),
            ),
        ],
        if (s.pickup != null) ...[
          const SizedBox(height: 12),
          Text(
            strings.get('cargo.pickupRequested'),
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontSize: 12.5,
            ),
          ),
        ],
      ],
    );
  }

  String _formatDate(DateTime d, String locale) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        16,
        16,
        16,
        AppShell.contentBottomInset,
      ),
      children: const [
        Skeleton(height: 44, borderRadius: 10),
        SizedBox(height: 18),
        Skeleton(height: 110, borderRadius: 18),
        SizedBox(height: 22),
        Skeleton(height: 20, width: 100, borderRadius: 6),
        SizedBox(height: 12),
        Skeleton(height: 60, borderRadius: 10),
      ],
    );
  }
}
