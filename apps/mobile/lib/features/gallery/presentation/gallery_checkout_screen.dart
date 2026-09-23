import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/format/money.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/error_banner.dart';
import '../../../core/widgets/remote_image.dart';
import '../../../core/widgets/skeleton.dart';
import '../domain/gallery_product.dart';

/// Delivery details for one product.
///
/// **One product, not a cart.** `POST /gallery/orders` takes exactly one `productId` and creates
/// one order with one delivery and one status. A client-side cart would quietly turn a single
/// purchase into N orders, N deliveries and N statuses — which is not what the customer thinks
/// they bought (GAP 4).
class GalleryCheckoutScreen extends ConsumerStatefulWidget {
  const GalleryCheckoutScreen({super.key, required this.productId});

  static const path = '/gallery/checkout';

  final String productId;

  @override
  ConsumerState<GalleryCheckoutScreen> createState() =>
      _GalleryCheckoutScreenState();
}

class _GalleryCheckoutScreenState extends ConsumerState<GalleryCheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _city = TextEditingController();
  final _address = TextEditingController();
  final _message = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _city.dispose();
    _address.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit(GalleryProduct product) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();

    final order = await ref
        .read(galleryOrderControllerProvider.notifier)
        .submit(
          productId: product.id,
          recipientName: _name.text.trim(),
          recipientPhone: _phone.text.trim(),
          deliveryCity: _city.text.trim(),
          deliveryAddress: _address.text.trim(),
          cardMessage: _message.text.trim(),
        );

    if (order == null || !mounted) return;

    // Awaited, not fire-and-forget: the order detail screen resolves a gift order out of this
    // list, so navigating before it has refetched would send it to the top-up endpoint instead.
    ref.invalidate(ordersProvider);
    await ref.read(ordersProvider.future);
    if (!mounted) return;

    context.go('/orders/detail/${order.id}');
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final product = ref.watch(galleryProductProvider(widget.productId));

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('gallery.checkout'))),
      body: AsyncView<GalleryProduct?>(
        value: product,
        onRetry: () => ref.invalidate(galleryProductProvider(widget.productId)),
        skeleton: const Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            children: [
              Skeleton(height: 84, borderRadius: 16),
              SizedBox(height: 18),
              Skeleton(height: 300, borderRadius: 16),
            ],
          ),
        ),
        isEmpty: (value) => value == null,
        empty: EmptyState(
          icon: Icons.search_off_rounded,
          title: strings.get('gallery.gone'),
        ),
        data: (value) => _CheckoutForm(
          product: value!,
          formKey: _formKey,
          name: _name,
          phone: _phone,
          city: _city,
          address: _address,
          message: _message,
          onSubmit: () => _submit(value),
        ),
      ),
    );
  }
}

class _CheckoutForm extends ConsumerWidget {
  const _CheckoutForm({
    required this.product,
    required this.formKey,
    required this.name,
    required this.phone,
    required this.city,
    required this.address,
    required this.message,
    required this.onSubmit,
  });

  final GalleryProduct product;
  final GlobalKey<FormState> formKey;
  final TextEditingController name;
  final TextEditingController phone;
  final TextEditingController city;
  final TextEditingController address;
  final TextEditingController message;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final state = ref.watch(galleryOrderControllerProvider);

    // Form outside the scroll view: a `Form` inside a lazy list loses its fields when they
    // scroll away, and submit then silently does nothing.
    return Form(
      key: formKey,
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          32 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // What is being bought, kept in view — the form is long enough that "which bouquet
            // was this again?" is a real question halfway down.
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  RemoteImage(
                    url: product.imageUrl,
                    width: 56,
                    height: 56,
                    fallbackIcon: Icons.local_florist_outlined,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          product.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14.5,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          Money.tmt(product.priceTmt, strings.locale),
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 22),
            _Label(strings.get('gallery.recipient')),
            const SizedBox(height: 10),
            TextFormField(
              controller: name,
              enabled: !state.busy,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.name],
              maxLength: 120, // @Length(1, 120)
              decoration: InputDecoration(
                labelText: strings.get('gallery.recipient.name'),
                counterText: '',
              ),
              validator: (v) => _required(v, strings),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: phone,
              enabled: !state.busy,
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.telephoneNumber],
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9+]')),
              ],
              maxLength: 32,
              decoration: InputDecoration(
                labelText: strings.get('gallery.recipient.phone'),
                // The courier calls this number, not the buyer's — worth saying, because people
                // fill in their own by default.
                helperText: strings.get('gallery.recipient.phoneHint'),
                helperMaxLines: 2,
                counterText: '',
              ),
              // @Length(3, 32) on recipientPhone — looser than the auth phone rule on purpose.
              validator: (v) {
                final value = (v ?? '').trim();
                return (value.length < 3 || value.length > 32)
                    ? strings.get('gallery.validation.phone')
                    : null;
              },
            ),

            const SizedBox(height: 22),
            _Label(strings.get('gallery.delivery')),
            const SizedBox(height: 10),
            TextFormField(
              controller: city,
              enabled: !state.busy,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              maxLength: 80, // @Length(1, 80)
              decoration: InputDecoration(
                labelText: strings.get('gallery.delivery.city'),
                counterText: '',
              ),
              validator: (v) => _required(v, strings),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: address,
              enabled: !state.busy,
              textInputAction: TextInputAction.next,
              maxLines: 2,
              maxLength: 300, // @Length(1, 300)
              decoration: InputDecoration(
                labelText: strings.get('gallery.delivery.address'),
                counterText: '',
              ),
              validator: (v) => _required(v, strings),
            ),

            const SizedBox(height: 22),
            _Label(strings.get('gallery.card')),
            const SizedBox(height: 10),
            TextFormField(
              controller: message,
              enabled: !state.busy,
              textInputAction: TextInputAction.done,
              maxLines: 3,
              maxLength: 300, // @Length(0, 300)
              decoration: InputDecoration(
                labelText: strings.get('gallery.card.message'),
                helperText: strings.get('gallery.card.hint'),
                helperMaxLines: 2,
                // The counter stays here: this text is printed on a card, so its length is
                // information the writer wants.
              ),
            ),

            if (state.error != null) ...[
              const SizedBox(height: 18),
              ErrorBanner(
                error: state.error!,
                onRetry: state.busy ? null : onSubmit,
              ),
            ],

            const SizedBox(height: 24),
            FilledButton(
              onPressed: state.busy ? null : onSubmit,
              child: state.busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        color: Colors.white,
                      ),
                    )
                  : Text(strings.get('gallery.submit')),
            ),
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
        ),
      ),
    );
  }

  static String? _required(String? value, Strings strings) =>
      (value == null || value.trim().isEmpty)
      ? strings.get('gallery.validation.required')
      : null;
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
