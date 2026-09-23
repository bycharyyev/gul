import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/remote_image.dart';
import '../../../core/widgets/skeleton.dart';
import '../../profile/presentation/widgets/form_scaffold.dart'
    show toAppException;
import '../domain/my_shop.dart';
import 'shop_screen.dart';

/// The identity of an approved seller's shop -- its logo, name, address and description -- and
/// the only place in the app to change any of it.
///
/// Before this screen existed, becoming a seller ended at the application: `BecomeCreatorScreen`
/// asks a customer for a shop name and an address once, an admin approves it, and from then on
/// nothing in the app let the seller touch their own shop again. The logo field the server has
/// always accepted (`PATCH /sellers/me`, `logoUrl`) had no way to reach it -- a seller's posts
/// carried a name and no picture, permanently, because nothing offered one.
class MyShopScreen extends ConsumerWidget {
  const MyShopScreen({super.key});
  static const pathSegment = 'my-shop';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final shop = ref.watch(myShopProvider);
    return Scaffold(
      appBar: AppBar(title: Text(strings.get('shop.mine.title'))),
      body: AsyncView<MyShop>(
        value: shop,
        skeleton: const _Loading(),
        onRetry: () => ref.invalidate(myShopProvider),
        data: (value) => _MyShopForm(initial: value),
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: const [
      Center(child: Skeleton(height: 84, width: 84, borderRadius: 42)),
      SizedBox(height: 24),
      Skeleton(height: 56),
      SizedBox(height: 14),
      Skeleton(height: 56),
      SizedBox(height: 14),
      Skeleton(height: 90),
    ],
  );
}

class _MyShopForm extends ConsumerStatefulWidget {
  const _MyShopForm({required this.initial});
  final MyShop initial;

  @override
  ConsumerState<_MyShopForm> createState() => _MyShopFormState();
}

class _MyShopFormState extends ConsumerState<_MyShopForm> {
  late String? _logoUrl;
  late final TextEditingController _shopName;
  late final TextEditingController _handle;
  late final TextEditingController _description;

  bool _busy = false;
  AppException? _error;

  @override
  void initState() {
    super.initState();
    // Pre-filled from what the server already has, like every other edit form in this app -- a
    // form that opens blank makes someone retype their own shop name to keep it unchanged.
    _logoUrl = widget.initial.logoUrl;
    _shopName = TextEditingController(text: widget.initial.shopName);
    _handle = TextEditingController(text: widget.initial.handle);
    _description = TextEditingController(
      text: widget.initial.description ?? '',
    );
  }

  @override
  void dispose() {
    _shopName.dispose();
    _handle.dispose();
    _description.dispose();
    super.dispose();
  }

  bool get _dirty =>
      _shopName.text.trim() != widget.initial.shopName ||
      _handle.text.trim().toLowerCase() != widget.initial.handle ||
      _description.text.trim() != (widget.initial.description ?? '');

  Future<void> _save() async {
    final strings = Strings.of(context);
    final shopName = _shopName.text.trim();
    final handle = _handle.text.trim().toLowerCase();
    if (shopName.isEmpty || handle.length < 2) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await ref
          .read(sellerRepositoryProvider)
          .updateMyProfile(
            shopName: shopName,
            handle: handle,
            description: _description.text.trim(),
          );
      // The public shop page and the feed's "В магазин" link both read from this; without
      // invalidating them a just-renamed shop would still show its old name until something
      // else happened to refetch it.
      ref.invalidate(myShopProvider);
      ref.invalidate(shopProvider(updated.handle));
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(strings.get('shop.mine.saved'))));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = toAppException(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final theme = Theme.of(context);
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          16,
          16,
          16,
          32 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: _LogoPicker(
                logoUrl: _logoUrl,
                onChanged: (url) => setState(() => _logoUrl = url),
              ),
            ),
            if (!widget.initial.isEnabled) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.visibility_off_outlined,
                      color: theme.colorScheme.onErrorContainer,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        strings.get('shop.mine.disabled'),
                        style: TextStyle(
                          color: theme.colorScheme.onErrorContainer,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 24),
            TextField(
              controller: _shopName,
              maxLength: 120,
              textCapitalization: TextCapitalization.words,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: strings.get('creator.shopName'),
                prefixIcon: const Icon(Icons.storefront_outlined),
              ),
            ),
            TextField(
              controller: _handle,
              maxLength: 32,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: strings.get('creator.handle'),
                prefixText: '@',
                helperText: strings.get('creator.handleHint'),
                helperMaxLines: 2,
                prefixIcon: const Icon(Icons.alternate_email_rounded),
              ),
            ),
            const SizedBox(height: 4),
            TextField(
              controller: _description,
              maxLength: 500,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: strings.get('creator.description'),
                alignLabelWithHint: true,
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 6),
              Text(
                strings.error(_error!),
                style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
              ),
            ],
            const SizedBox(height: 14),
            FilledButton(
              onPressed:
                  (_busy ||
                      !_dirty ||
                      _shopName.text.trim().isEmpty ||
                      _handle.text.trim().length < 2)
                  ? null
                  : _save,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(strings.get('common.save')),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () =>
                  context.push(ShopScreen.pathFor(widget.initial.handle)),
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: Text(strings.get('shop.mine.viewPage')),
            ),
          ],
        ),
      ),
    );
  }
}

/// The shop's logo. Uploads and saves on pick, the way the personal avatar does -- a logo is not
/// part of the form's own "Сохранить", it is its own small commitment, and treating it as one
/// avoids a half-finished name edit silently taking a new logo down with it if it fails.
class _LogoPicker extends ConsumerStatefulWidget {
  const _LogoPicker({required this.logoUrl, required this.onChanged});
  final String? logoUrl;
  final ValueChanged<String?> onChanged;

  @override
  ConsumerState<_LogoPicker> createState() => _LogoPickerState();
}

class _LogoPickerState extends ConsumerState<_LogoPicker> {
  bool _busy = false;

  Future<void> _pick(ImageSource source) async {
    final strings = Strings.of(context);
    setState(() => _busy = true);
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        // A logo is shown small -- a circle beside a post, a thumbnail on the shop page -- so it
        // is downscaled before upload the same way the personal avatar is: comfortably above what
        // any of those need, and small enough to finish uploading on a slow connection.
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (picked == null) {
        if (mounted) setState(() => _busy = false);
        return;
      }
      final url = await ref
          .read(sellerRepositoryProvider)
          .uploadLogo(File(picked.path));
      await ref.read(sellerRepositoryProvider).updateMyProfile(logoUrl: url);
      ref.invalidate(myShopProvider);
      if (!mounted) return;
      widget.onChanged(url);
      setState(() => _busy = false);
      _toast(strings.get('shop.mine.logoUpdated'));
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _toast(
        e is AppException
            ? strings.error(e)
            : strings.get('shop.mine.logoFailed'),
      );
    }
  }

  Future<void> _remove() async {
    final strings = Strings.of(context);
    setState(() => _busy = true);
    try {
      await ref.read(sellerRepositoryProvider).removeLogo();
      ref.invalidate(myShopProvider);
      if (!mounted) return;
      widget.onChanged(null);
      setState(() => _busy = false);
      _toast(strings.get('shop.mine.logoRemoved'));
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _toast(
        e is AppException
            ? strings.error(e)
            : strings.get('shop.mine.logoFailed'),
      );
    }
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _openSheet() async {
    final strings = Strings.of(context);
    final hasLogo = widget.logoUrl != null;
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(strings.get('profile.avatar.gallery')),
              onTap: () => Navigator.of(context).pop('gallery'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: Text(strings.get('profile.avatar.camera')),
              onTap: () => Navigator.of(context).pop('camera'),
            ),
            if (hasLogo)
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded),
                title: Text(strings.get('profile.avatar.remove')),
                onTap: () => Navigator.of(context).pop('remove'),
              ),
          ],
        ),
      ),
    );
    if (action == null || !mounted) return;
    switch (action) {
      case 'gallery':
        await _pick(ImageSource.gallery);
      case 'camera':
        await _pick(ImageSource.camera);
      case 'remove':
        await _remove();
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    const size = 84.0;
    return Semantics(
      button: true,
      label: strings.get('shop.mine.logoChange'),
      child: InkWell(
        onTap: _busy ? null : _openSheet,
        borderRadius: BorderRadius.circular(size / 2),
        child: Stack(
          alignment: Alignment.center,
          children: [
            ClipOval(
              child: RemoteImage(
                url: widget.logoUrl,
                width: size,
                height: size,
                borderRadius: 0,
                fallbackIcon: Icons.storefront_outlined,
              ),
            ),
            if (_busy)
              const SizedBox(
                width: size,
                height: size,
                child: CircularProgressIndicator(strokeWidth: 2.4),
              )
            else
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Theme.of(context).scaffoldBackgroundColor,
                      width: 2,
                    ),
                  ),
                  child: const Icon(
                    Icons.edit_rounded,
                    size: 14,
                    color: Colors.white,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
