import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/format/money.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/crystal.dart';
import '../../topup/domain/topup_options.dart' show PaymentMethodOption;
import '../domain/cargo_models.dart';
import 'shipment_detail_screen.dart';
import 'cargo_home_screen.dart';
import 'widgets/cargo_banner_card.dart';

class CreateShipmentScreen extends ConsumerStatefulWidget {
  const CreateShipmentScreen({super.key});

  static const path = 'create';

  @override
  ConsumerState<CreateShipmentScreen> createState() =>
      _CreateShipmentScreenState();
}

class _CreateShipmentScreenState extends ConsumerState<CreateShipmentScreen> {
  final _formKey = GlobalKey<FormState>();
  final _senderName = TextEditingController();
  final _senderPhone = TextEditingController();
  final _pickupAddress = TextEditingController();
  final _recipientName = TextEditingController();
  final _recipientPhone = TextEditingController();
  final _weightKg = TextEditingController();
  final _quantity = TextEditingController(text: '1');
  final _deliveryAddress = TextEditingController();
  final _notes = TextEditingController();

  CargoDirections? _directions;
  CargoCity? _originCity;
  CargoCity? _destinationCity;
  CargoItemType? _itemType;
  List<PaymentMethodOption> _paymentMethods = const [];
  PaymentMethodOption? _paymentMethod;
  ShipmentDeliveryMode _deliveryMode = ShipmentDeliveryMode.warehousePickup;
  bool _fragile = false;
  CargoQuote? _quote;
  bool _loadingDirections = true;
  bool _loadingQuote = false;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _weightKg.addListener(_refreshQuote);
    _quantity.addListener(_refreshQuote);
    _loadDirections();
    _loadPaymentMethods();
    unawaited(_prefillSender());
  }

  @override
  void dispose() {
    _senderName.dispose();
    _senderPhone.dispose();
    _pickupAddress.dispose();
    _recipientName.dispose();
    _recipientPhone.dispose();
    _weightKg.dispose();
    _quantity.dispose();
    _deliveryAddress.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _loadDirections() async {
    final directions = await ref.read(cargoRepositoryProvider).loadDirections();
    if (!mounted) return;
    setState(() {
      _directions = directions;
      // Preselect anything there is only one of: a picker with a single option is not a decision.
      _originCity = directions.origins.length == 1
          ? directions.origins.first
          : null;
      _destinationCity = directions.destinations.length == 1
          ? directions.destinations.first
          : null;
      _itemType = directions.itemTypes.isNotEmpty
          ? directions.itemTypes.first
          : null;
      _loadingDirections = false;
    });
    // Fire-and-forget: the first quote fills in once a weight or count is entered, and the form
    // is already usable without it.
    unawaited(_refreshQuote());
  }

  /// The sender is nearly always the person filling the form in, so start from their profile
  /// instead of making them retype what the account already knows. Both fields stay editable.
  Future<void> _prefillSender() async {
    try {
      final me = await ref.read(authRepositoryProvider).me();
      if (!mounted) return;
      setState(() {
        if (_senderName.text.isEmpty) _senderName.text = me.fullName ?? '';
        if (_senderPhone.text.isEmpty) _senderPhone.text = me.phone;
      });
    } catch (_) {
      // A missing profile is not worth an error here -- the fields simply stay empty.
    }
  }

  Future<void> _loadPaymentMethods() async {
    final methods = await ref
        .read(cargoRepositoryProvider)
        .loadPaymentMethods();
    if (!mounted) return;
    setState(() {
      _paymentMethods = methods;
      _paymentMethod = methods.length == 1 ? methods.first : null;
    });
  }

  Future<void> _refreshQuote() async {
    final itemType = _itemType;
    if (itemType == null) {
      setState(() => _quote = null);
      return;
    }
    final weight = double.tryParse(_weightKg.text.replaceAll(',', '.'));
    final count = int.tryParse(_quantity.text.trim());
    final ready = itemType.isCounted
        ? (count != null && count >= 1)
        : (weight != null && weight > 0);
    if (!ready) {
      setState(() => _quote = null);
      return;
    }
    setState(() => _loadingQuote = true);
    try {
      final quote = await ref
          .read(cargoRepositoryProvider)
          .quote(
            itemTypeId: itemType.id,
            declaredWeightKg: itemType.isCounted ? null : weight,
            quantity: itemType.isCounted ? count : null,
          );
      if (mounted) setState(() => _quote = quote);
    } catch (_) {
      if (mounted) setState(() => _quote = null);
    } finally {
      if (mounted) setState(() => _loadingQuote = false);
    }
  }

  Future<void> _submit() async {
    final itemType = _itemType;
    if (!(_formKey.currentState?.validate() ?? false) ||
        _originCity == null ||
        _destinationCity == null ||
        itemType == null ||
        _paymentMethod == null) {
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final shipment = await ref
          .read(cargoRepositoryProvider)
          .createShipment(
            originCityId: _originCity!.id,
            destinationCityId: _destinationCity!.id,
            itemTypeId: itemType.id,
            paymentMethodId: _paymentMethod!.id,
            senderName: _senderName.text.trim(),
            senderPhone: _senderPhone.text.trim(),
            pickupAddress: _pickupAddress.text.trim(),
            recipientName: _recipientName.text.trim(),
            recipientPhone: _recipientPhone.text.trim(),
            deliveryMode: _deliveryMode,
            deliveryAddress: _deliveryMode == ShipmentDeliveryMode.doorDelivery
                ? _deliveryAddress.text.trim()
                : null,
            declaredWeightKg: itemType.isCounted
                ? null
                : double.parse(_weightKg.text.replaceAll(',', '.')),
            quantity: itemType.isCounted
                ? int.parse(_quantity.text.trim())
                : null,
            fragile: _fragile,
            notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          );
      if (!mounted) return;
      context.pushReplacement(
        '/home/${CargoHomeScreen.path}/${ShipmentDetailScreen.pathSegment}/${shipment.id}',
      );
    } on AppException catch (e) {
      if (!mounted) return;
      setState(() => _error = Strings.of(context).error(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    if (_loadingDirections) {
      return Scaffold(
        appBar: AppBar(title: Text(strings.get('cargo.create.title'))),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if ((_directions?.destinations.isEmpty ?? true) ||
        (_directions?.itemTypes.isEmpty ?? true)) {
      return Scaffold(
        appBar: AppBar(title: Text(strings.get('cargo.create.title'))),
        body: Center(child: Text(strings.get('cargo.noRoute'))),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('cargo.create.title'))),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            16,
            16,
            16,
            AppShell.contentBottomInset,
          ),
          children: [
            const CargoBannerCard(),
            DropdownButtonFormField<CargoCity>(
              initialValue: _originCity,
              decoration: InputDecoration(
                labelText: strings.get('cargo.originCity'),
              ),
              items: (_directions?.origins ?? const <CargoCity>[])
                  .map((c) => DropdownMenuItem(value: c, child: Text(c.name)))
                  .toList(),
              onChanged: (c) => setState(() => _originCity = c),
              validator: (v) =>
                  v == null ? strings.get('gallery.validation.required') : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<CargoCity>(
              initialValue: _destinationCity,
              decoration: InputDecoration(
                labelText: strings.get('cargo.destinationCity'),
              ),
              items: (_directions?.destinations ?? const <CargoCity>[])
                  .map((c) => DropdownMenuItem(value: c, child: Text(c.name)))
                  .toList(),
              onChanged: (c) => setState(() => _destinationCity = c),
              validator: (v) =>
                  v == null ? strings.get('gallery.validation.required') : null,
            ),
            const SizedBox(height: 18),
            _SectionLabel(strings.get('cargo.sender')),
            TextFormField(
              controller: _senderName,
              decoration: InputDecoration(
                labelText: strings.get('cargo.senderName'),
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? strings.get('gallery.validation.required')
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _senderPhone,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: strings.get('cargo.senderPhone'),
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? strings.get('gallery.validation.required')
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _pickupAddress,
              decoration: InputDecoration(
                labelText: strings.get('cargo.pickupAddress'),
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? strings.get('gallery.validation.required')
                  : null,
            ),
            const SizedBox(height: 22),
            _SectionLabel(strings.get('cargo.recipient')),
            TextFormField(
              controller: _recipientName,
              decoration: InputDecoration(
                labelText: strings.get('cargo.recipientName'),
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? strings.get('gallery.validation.required')
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _recipientPhone,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: strings.get('cargo.recipientPhone'),
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? strings.get('gallery.validation.required')
                  : null,
            ),
            const SizedBox(height: 12),
            SegmentedButton<ShipmentDeliveryMode>(
              segments: [
                ButtonSegment(
                  value: ShipmentDeliveryMode.warehousePickup,
                  label: Text(
                    strings.get('cargo.warehousePickup'),
                    textAlign: TextAlign.center,
                  ),
                ),
                ButtonSegment(
                  value: ShipmentDeliveryMode.doorDelivery,
                  label: Text(
                    strings.get('cargo.doorDelivery'),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
              selected: {_deliveryMode},
              onSelectionChanged: (s) =>
                  setState(() => _deliveryMode = s.first),
            ),
            if (_deliveryMode == ShipmentDeliveryMode.doorDelivery) ...[
              const SizedBox(height: 12),
              TextFormField(
                controller: _deliveryAddress,
                decoration: InputDecoration(
                  labelText: strings.get('cargo.deliveryAddress'),
                ),
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? strings.get('gallery.validation.required')
                    : null,
              ),
            ],
            const SizedBox(height: 22),
            _SectionLabel(strings.get('cargo.cargo')),
            DropdownButtonFormField<CargoItemType>(
              initialValue: _itemType,
              decoration: InputDecoration(
                labelText: strings.get('cargo.itemType'),
              ),
              items: (_directions?.itemTypes ?? const <CargoItemType>[])
                  .map((t) => DropdownMenuItem(value: t, child: Text(t.name)))
                  .toList(),
              onChanged: (t) {
                setState(() => _itemType = t);
                _refreshQuote();
              },
              validator: (v) =>
                  v == null ? strings.get('gallery.validation.required') : null,
            ),
            if (_itemType?.description != null) ...[
              const SizedBox(height: 6),
              Text(
                _itemType!.description!,
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context).hintColor,
                ),
              ),
            ],
            const SizedBox(height: 12),
            // Weight or count, never both: which one is billable is the cargo type's decision.
            if (_itemType?.isCounted ?? false)
              TextFormField(
                controller: _quantity,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: strings.get('cargo.quantity'),
                  helperText: strings.get('cargo.pricedPerItem'),
                ),
                validator: (v) {
                  final n = int.tryParse((v ?? '').trim());
                  if (n == null || n < 1) {
                    return strings.get('gallery.validation.required');
                  }
                  return null;
                },
              )
            else
              TextFormField(
                controller: _weightKg,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: strings.get('cargo.weightKg'),
                  helperText: _itemType?.minWeightKg == null
                      ? null
                      : '${strings.get('cargo.minWeightHint')} ${_itemType!.minWeightKg!.toStringAsFixed(0)} ${strings.get('cargo.kg')}',
                ),
                validator: (v) {
                  final weight = double.tryParse(
                    (v ?? '').replaceAll(',', '.'),
                  );
                  if (weight == null || weight <= 0) {
                    return strings.get('gallery.validation.required');
                  }
                  final min = _itemType?.minWeightKg;
                  // The partner refuses anything lighter; say so here rather than at the warehouse.
                  if (min != null && weight < min) {
                    return strings.get('gallery.validation.required');
                  }
                  return null;
                },
              ),
            const SizedBox(height: 8),
            CheckboxListTile(
              value: _fragile,
              onChanged: (v) => setState(() => _fragile = v ?? false),
              title: Text(strings.get('cargo.fragile')),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
            ),
            TextFormField(
              controller: _notes,
              decoration: InputDecoration(
                labelText: strings.get('cargo.notes'),
              ),
            ),
            if (_paymentMethods.isNotEmpty) ...[
              const SizedBox(height: 22),
              _SectionLabel(strings.get('cargo.paymentMethod')),
              _PaymentMethodList(
                methods: _paymentMethods,
                selected: _paymentMethod,
                // A single-option picker is a decision the user does not get to make -- mirrors
                // the top-up flow's own treatment of "production returns exactly one method".
                enabled: _paymentMethods.length > 1,
                onSelected: (m) => setState(() => _paymentMethod = m),
              ),
            ],
            if (_quote != null) ...[
              const SizedBox(height: 22),
              CrystalSurface(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        strings.get('cargo.quote'),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      if (_quote!.pricePerKgTmt != null)
                        _PriceRow(
                          strings.get('cargo.pricePerKg'),
                          Money.tmt(_quote!.pricePerKgTmt!, strings.locale),
                        ),
                      if (_quote!.pricePerItemTmt != null)
                        _PriceRow(
                          strings.get('cargo.pricePerItem'),
                          '${Money.tmt(_quote!.pricePerItemTmt!, strings.locale)} × ${_quote!.quantity}',
                        ),
                      _PriceRow(
                        strings.get('cargo.pickupFee'),
                        Money.tmt(_quote!.pickupFeeTmt, strings.locale),
                      ),
                      const Divider(height: 18),
                      _PriceRow(
                        strings.get('cargo.total'),
                        Money.tmt(_quote!.totalPriceTmt, strings.locale),
                        bold: true,
                      ),
                    ],
                  ),
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 14),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 22),
            FilledButton(
              onPressed:
                  (_submitting ||
                      _loadingQuote ||
                      _quote == null ||
                      _paymentMethod == null)
                  ? null
                  : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        color: Colors.white,
                      ),
                    )
                  : Text(strings.get('cargo.submit')),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Text(
      text,
      style: TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w700,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    ),
  );
}

/// Local twin of the top-up flow's own `_MethodList` -- same look and single-option treatment,
/// but Cargo's price never depends on which method is picked (no fee arithmetic to show here).
class _PaymentMethodList extends StatelessWidget {
  const _PaymentMethodList({
    required this.methods,
    required this.selected,
    required this.enabled,
    required this.onSelected,
  });

  final List<PaymentMethodOption> methods;
  final PaymentMethodOption? selected;
  final bool enabled;
  final ValueChanged<PaymentMethodOption> onSelected;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Column(
      children: [
        for (final method in methods)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: scheme.surface,
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: enabled ? () => onSelected(method) : null,
                child: Ink(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: method.id == selected?.id
                          ? scheme.primary
                          : scheme.outlineVariant,
                      width: method.id == selected?.id ? 2 : 1,
                    ),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 14,
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.account_balance_wallet_outlined,
                          size: 20,
                          color: scheme.onSurfaceVariant,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            method.name,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow(this.label, this.value, {this.bold = false});

  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    ),
  );
}
