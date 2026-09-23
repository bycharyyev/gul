import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import 'widgets/form_scaffold.dart';

class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  static const path = '/profile/password';

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _repeat = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  AppException? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _repeat.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref
          .read(profileRepositoryProvider)
          .changePassword(
            currentPassword: _current.text,
            newPassword: _next.text,
          );
      if (!mounted) return;
      popWithMessage(context, Strings.of(context).get('password.changed'));
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

    return FormScaffold(
      title: strings.get('password.title'),
      formKey: _formKey,
      busy: _busy,
      error: _error,
      submitLabel: strings.get('common.save'),
      onSubmit: _submit,
      fields: [
        TextFormField(
          controller: _current,
          enabled: !_busy,
          obscureText: _obscure,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.password],
          decoration: InputDecoration(
            labelText: strings.get('password.current'),
            // One reveal toggle for the whole form: three separate eyes on three password fields
            // is clutter, and someone who wants to see what they typed wants to see all of it.
            suffixIcon: IconButton(
              onPressed: () => setState(() => _obscure = !_obscure),
              icon: Icon(
                _obscure
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
              ),
            ),
          ),
          validator: (v) => (v == null || v.isEmpty)
              ? strings.get('auth.validation.passwordRequired')
              : null,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _next,
          enabled: !_busy,
          obscureText: _obscure,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.newPassword],
          decoration: InputDecoration(labelText: strings.get('password.new')),
          // Mirrors the backend's `@Length(8, 72)` on `newPassword`.
          validator: (v) => (v == null || v.length < 8)
              ? strings.get('auth.validation.password')
              : null,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _repeat,
          enabled: !_busy,
          obscureText: _obscure,
          textInputAction: TextInputAction.done,
          onFieldSubmitted: (_) => _submit(),
          decoration: InputDecoration(
            labelText: strings.get('password.repeat'),
          ),
          // Checked here rather than after a round-trip: the server has no idea the user typed
          // the new password twice.
          validator: (v) =>
              v == _next.text ? null : strings.get('password.mismatch'),
        ),
      ],
    );
  }
}
