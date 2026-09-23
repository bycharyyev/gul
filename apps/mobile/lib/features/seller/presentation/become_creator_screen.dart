import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';

/// Opening a shop from inside the app.
///
/// Asks for three things and nothing else. The website's form has to collect a phone and a
/// password because whoever fills it in has no account yet — which is exactly why that form
/// cannot serve somebody who does: the phone it asks for is already taken, and the application
/// was refused before it was ever reviewed. Here the account is already signed in, so the two
/// fields that identify a person are not asked for and not sent.
class BecomeCreatorScreen extends ConsumerStatefulWidget {
  const BecomeCreatorScreen({super.key});

  static const pathSegment = 'become-creator';

  @override
  ConsumerState<BecomeCreatorScreen> createState() =>
      _BecomeCreatorScreenState();
}

class _BecomeCreatorScreenState extends ConsumerState<BecomeCreatorScreen> {
  final _shopName = TextEditingController();
  final _handle = TextEditingController();
  final _description = TextEditingController();
  bool _busy = false;
  String? _error;
  bool _sent = false;

  @override
  void dispose() {
    _shopName.dispose();
    _handle.dispose();
    _description.dispose();
    super.dispose();
  }

  bool get _ready =>
      _shopName.text.trim().isNotEmpty &&
      _handle.text.trim().length >= 2 &&
      !_busy;

  Future<void> _submit() async {
    if (!_ready) return;
    final strings = Strings.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(sellerRepositoryProvider)
          .applyAsMe(
            handle: _handle.text.trim().toLowerCase(),
            shopName: _shopName.text.trim(),
            description: _description.text.trim().isEmpty
                ? null
                : _description.text.trim(),
          );
      if (!mounted) return;
      setState(() {
        _sent = true;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e is AppException
            ? strings.error(e)
            : strings.get('err.unknown');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('creator.title'))),
      body: _sent
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.mark_email_read_rounded,
                      size: 48,
                      color: scheme.primary,
                    ),
                    const SizedBox(height: 14),
                    Text(
                      strings.get('creator.sentTitle'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      strings.get('creator.sentBody'),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13.5,
                        height: 1.45,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
              children: [
                Text(
                  strings.get('creator.intro'),
                  style: TextStyle(
                    fontSize: 13.5,
                    height: 1.45,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 20),
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
                    // Shown, not silently applied: the address is public and permanent enough
                    // that somebody should see what they are choosing.
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
                  decoration: InputDecoration(
                    labelText: strings.get('creator.description'),
                    alignLabelWithHint: true,
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    _error!,
                    style: TextStyle(color: scheme.error, fontSize: 13),
                  ),
                ],
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: _ready ? _submit : null,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  child: _busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(strings.get('creator.submit')),
                ),
              ],
            ),
    );
  }
}
