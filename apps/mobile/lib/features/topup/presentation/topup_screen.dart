import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/shell.dart';
import '../../../core/contacts/contact_picker.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/network/external_links.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/error_banner.dart';
import '../../../core/widgets/remote_image.dart';
import '../../../core/widgets/skeleton.dart';
import '../../home/domain/catalog_service.dart';
import '../domain/topup_options.dart';
import 'widgets/amount_field.dart';
import 'widgets/estimate_card.dart';

class TopupScreen extends ConsumerStatefulWidget {
  const TopupScreen({
    super.key,
    this.initialServiceId,
    this.contactPicker = const ContactPicker(),
  });

  static const path = '/topup';

  /// Set when arriving from a home tile, so the operator is already chosen.
  final String? initialServiceId;

  /// Injected so a test can choose a contact without a real Contacts app.
  final ContactPicker contactPicker;

  @override
  ConsumerState<TopupScreen> createState() => _TopupScreenState();
}

class _TopupScreenState extends ConsumerState<TopupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _recipient = TextEditingController();
  final _amount = TextEditingController();

  /// Only what the *user* has chosen is stored. Everything else — which operator is showing,
  /// which currency, which payment method — is derived from the loaded data each build, so there
  /// is no second copy to fall out of step and nothing has to be assigned during a build.
  String? _serviceId;
  String? _currency;
  String? _methodId;

  @override
  void initState() {
    super.initState();
    _serviceId = widget.initialServiceId;
  }

  @override
  void dispose() {
    _recipient.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _pickFromContacts() async {
    final strings = Strings.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final contact = await widget.contactPicker.pick();
      // Backing out of the picker must leave a half-typed number alone.
      if (contact == null || !mounted) return;
      _recipient.text = contact.phone;
      // The cursor goes to the end, not to offset zero, so the next keystroke corrects the
      // number rather than prefixing it.
      _recipient.selection = TextSelection.collapsed(
        offset: contact.phone.length,
      );
      setState(() {});
    } on PlatformException {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text(strings.get('topup.recipient.contactsFailed'))),
      );
    }
  }

  CatalogService _resolveService(List<CatalogService> services) =>
      services.where((s) => s.id == _serviceId).firstOrNull ?? services.first;

  void _selectService(CatalogService service) {
    if (_serviceId == service.id) return;
    setState(() {
      _serviceId = service.id;
      // Currencies and the recipient format are per-operator. Carrying either across a switch
      // would submit a value the new service rejects.
      _currency = null;
      _recipient.clear();
    });
  }

  Future<void> _submit(CatalogService service, TopupOptions options) async {
    final currency = _currency ?? options.currencies.firstOrNull;
    final method =
        options.paymentMethods.where((m) => m.id == _methodId).firstOrNull ??
        options.paymentMethods.firstOrNull;

    if (currency == null || method == null) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    FocusScope.of(context).unfocus();

    final submission = await ref
        .read(topupControllerProvider.notifier)
        .submit(
          serviceId: service.id,
          serviceName: service.name,
          paymentMethodId: method.id,
          recipientIdentifier: _recipient.text.trim(),
          amountTmt: parseAmount(_amount.text)!,
          currency: currency,
        );

    if (submission == null || !mounted) return;
    final order = submission.order;

    // The history now has a row the cached list does not know about, and the referral balance on
    // Home may have just been spent as a discount.
    ref.invalidate(ordersProvider);
    ref.invalidate(homeProvider);

    _amount.clear();
    _recipient.clear();
    setState(() => _currency = null);

    final redirectUrl = submission.payment.redirectUrl;
    if (redirectUrl != null) {
      await const ExternalLinks().openPayment(context, redirectUrl);
      if (!mounted) return;
    }
    // The order remains pending until the authenticated provider webhook settles it.
    context.go('/orders/detail/${order.id}');
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final services = ref.watch(catalogServicesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('topup.title'))),
      body: AsyncView<List<CatalogService>>(
        value: services,
        onRetry: () => ref.invalidate(catalogServicesProvider),
        skeleton: const _TopupSkeleton(),
        isEmpty: (list) => list.isEmpty,
        empty: EmptyState(
          icon: Icons.sim_card_outlined,
          title: strings.get('home.services.empty'),
        ),
        data: (list) {
          final service = _resolveService(list);
          final submit = ref.watch(topupControllerProvider);
          final options = ref.watch(topupOptionsProvider(service.id));

          // A `Form` inside a lazy `ListView` is a trap: scrolling the fields off-screen disposes
          // them, `_formKey.currentState` becomes null, and pressing submit silently does
          // nothing. `SingleChildScrollView` builds the whole form eagerly, which is what a form
          // this size wants anyway.
          return Form(
            key: _formKey,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(
                16,
                8,
                16,
                AppShell.contentBottomInset,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Label(strings.get('topup.operator')),
                  const SizedBox(height: 10),
                  _ServiceStrip(
                    services: list,
                    selected: service,
                    enabled: !submit.busy,
                    onSelected: _selectService,
                  ),
                  const SizedBox(height: 24),
                  TextFormField(
                    controller: _recipient,
                    enabled: !submit.busy,
                    // `inputType` decides the keyboard: PHONE gets the dialpad; an account id
                    // does not, because forcing digits on an alphanumeric id is a trap.
                    keyboardType: service.inputType == 'PHONE'
                        ? TextInputType.phone
                        : TextInputType.text,
                    inputFormatters: service.inputType == 'PHONE'
                        ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9+]'))]
                        : null,
                    textInputAction: TextInputAction.next,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      labelText: service.inputType == 'PHONE'
                          ? strings.get('topup.recipient.phone')
                          : strings.get('topup.recipient.account'),
                      // Only for a phone, and only where the picker exists. A game account id is
                      // nobody's contact, so offering the address book there is an invitation to
                      // paste a number into a field that will reject it.
                      suffixIcon:
                          service.inputType == 'PHONE' &&
                              ContactPicker.isSupported
                          ? IconButton(
                              icon: const Icon(Icons.contacts_outlined),
                              tooltip: strings.get('topup.recipient.fromContacts'),
                              onPressed: submit.busy ? null : _pickFromContacts,
                            )
                          : null,
                    ),
                    validator: (value) =>
                        validateRecipient(value, service, strings),
                  ),
                  const SizedBox(height: 18),
                  AmountField(
                    controller: _amount,
                    min: service.minAmountTmt,
                    max: service.maxAmountTmt,
                    enabled: !submit.busy,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 24),
                  AsyncView<TopupOptions>(
                    value: options,
                    onRetry: () =>
                        ref.invalidate(topupOptionsProvider(service.id)),
                    skeleton: const Skeleton(height: 200, borderRadius: 16),
                    data: (options) => _Payment(
                      service: service,
                      options: options,
                      currency: _currency ?? options.currencies.firstOrNull,
                      methodId: _methodId,
                      amountText: _amount.text,
                      busy: submit.busy,
                      error: submit.error,
                      onCurrencySelected: (c) => setState(() => _currency = c),
                      onMethodSelected: (m) => setState(() => _methodId = m.id),
                      onSubmit: () => _submit(service, options),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _Payment extends StatelessWidget {
  const _Payment({
    required this.service,
    required this.options,
    required this.currency,
    required this.methodId,
    required this.amountText,
    required this.busy,
    required this.error,
    required this.onCurrencySelected,
    required this.onMethodSelected,
    required this.onSubmit,
  });

  final CatalogService service;
  final TopupOptions options;
  final String? currency;
  final String? methodId;
  final String amountText;
  final bool busy;
  final AppException? error;
  final ValueChanged<String> onCurrencySelected;
  final ValueChanged<PaymentMethodOption> onMethodSelected;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    final method =
        options.paymentMethods.where((m) => m.id == methodId).firstOrNull ??
        options.paymentMethods.firstOrNull;

    final estimate = TopupEstimate.of(
      amountTmt: parseAmount(amountText),
      rate: options.rateFor(currency),
      method: method,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Label(strings.get('topup.currency')),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final code in options.currencies)
              ChoiceChip(
                label: Text(code),
                selected: code == currency,
                onSelected: busy ? null : (_) => onCurrencySelected(code),
                // 44dp minimum: a chip sized to a three-letter label alone is a 30dp target.
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                side: BorderSide(color: scheme.outlineVariant),
              ),
          ],
        ),
        if (method != null) ...[
          const SizedBox(height: 20),
          _Label(strings.get('topup.method')),
          const SizedBox(height: 10),
          _MethodList(
            methods: options.paymentMethods,
            selected: method,
            // Production returns exactly one method. A single-option picker is a decision the
            // user does not get to make, so it renders as a statement instead.
            enabled: !busy && options.paymentMethods.length > 1,
            onSelected: onMethodSelected,
          ),
        ],
        if (estimate != null && method != null) ...[
          const SizedBox(height: 20),
          EstimateCard(estimate: estimate, method: method),
        ],
        if (error != null) ...[
          const SizedBox(height: 18),
          ErrorBanner(error: error!, onRetry: busy ? null : onSubmit),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: (busy || currency == null || method == null)
              ? null
              : onSubmit,
          child: busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.2,
                    color: Colors.white,
                  ),
                )
              // "Create order", not "Pay {amount}": this button does not move money. The web
              // storefront's label promises something the manual flow does not deliver.
              : Text(strings.get('topup.submit')),
        ),
        if (method?.isManual == true) ...[
          const SizedBox(height: 12),
          Text(
            strings.get('topup.manualNotice'),
            textAlign: TextAlign.center,
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 12,
              height: 1.4,
            ),
          ),
        ],
      ],
    );
  }
}

/// Applies the operator's own `validationRegex` when it has one.
///
/// The server compiles and enforces this exact pattern, so applying it here keeps the two in step
/// — hardcoding a Turkmen phone format per operator would drift the moment an operator changes.
String? validateRecipient(
  String? value,
  CatalogService service,
  Strings strings,
) {
  final recipient = (value ?? '').trim();

  // `@Length(3, 64)` on `CreateOrderDto.recipientIdentifier`.
  if (recipient.length < 3 || recipient.length > 64) {
    return strings.get('topup.recipient.invalid');
  }

  final pattern = service.validationRegex;
  if (pattern == null) return null;

  try {
    return RegExp(pattern).hasMatch(recipient)
        ? null
        : strings.get('topup.recipient.invalid');
  } on FormatException {
    // An admin can save a pattern that does not compile in Dart. Blocking a real order over the
    // catalogue's own bad data would be worse than letting the server have the final say.
    return null;
  }
}

class _ServiceStrip extends StatelessWidget {
  const _ServiceStrip({
    required this.services,
    required this.selected,
    required this.enabled,
    required this.onSelected,
  });

  final List<CatalogService> services;
  final CatalogService selected;
  final bool enabled;
  final void Function(CatalogService) onSelected;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    // The strip's height follows the text scale. A fixed 96dp holds a two-line operator name at
    // normal size and clips it at the largest accessibility setting -- which is when the name
    // most needs to be readable.
    final scale = MediaQuery.textScalerOf(context).scale(12) / 12;

    return SizedBox(
      height: 96 + (scale - 1).clamp(0, 2) * 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: services.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) {
          final service = services[i];
          final isSelected = service.id == selected.id;

          return Material(
            color: isSelected ? scheme.primaryContainer : scheme.surface,
            borderRadius: BorderRadius.circular(16),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: enabled ? () => onSelected(service) : null,
              child: Ink(
                width: 104,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    // Selection is carried by border weight *and* colour, so it survives a
                    // grayscale screenshot and a colour-blind viewer alike.
                    color: isSelected ? scheme.primary : scheme.outlineVariant,
                    width: isSelected ? 2 : 1,
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      RemoteImage(
                        url: service.logoUrl,
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        fallbackIcon: Icons.sim_card_outlined,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        service.name,
                        maxLines: 2,
                        textAlign: TextAlign.center,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11.5,
                          height: 1.15,
                          fontWeight: isSelected
                              ? FontWeight.w700
                              : FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _MethodList extends StatelessWidget {
  const _MethodList({
    required this.methods,
    required this.selected,
    required this.enabled,
    required this.onSelected,
  });

  final List<PaymentMethodOption> methods;
  final PaymentMethodOption selected;
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
                      color: method.id == selected.id
                          ? scheme.primary
                          : scheme.outlineVariant,
                      width: method.id == selected.id ? 2 : 1,
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
                        if (method.feePercent > 0)
                          Text(
                            '+${formatPercent(method.feePercent)}',
                            style: TextStyle(
                              color: scheme.onSurfaceVariant,
                              fontSize: 13,
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

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: Theme.of(context).textTheme.titleSmall?.copyWith(
      fontWeight: FontWeight.w700,
      color: Theme.of(context).colorScheme.onSurfaceVariant,
    ),
  );
}

class _TopupSkeleton extends StatelessWidget {
  const _TopupSkeleton();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.fromLTRB(16, 16, 16, 32),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Skeleton(height: 96, borderRadius: 16),
        SizedBox(height: 24),
        Skeleton(height: 56, borderRadius: 14),
        SizedBox(height: 18),
        Skeleton(height: 56, borderRadius: 14),
        SizedBox(height: 24),
        Skeleton(height: 200, borderRadius: 16),
      ],
    ),
  );
}
