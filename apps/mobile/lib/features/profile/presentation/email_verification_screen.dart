import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import 'widgets/form_scaffold.dart';

/// Two steps in one screen: submit an address, then the six-digit code that arrives by email.
///
/// One screen rather than two because the second step is meaningless without the first, and
/// pushing a route between them would let someone land on a code field with no idea which address
/// it belongs to.
class EmailVerificationScreen extends ConsumerStatefulWidget {
  const EmailVerificationScreen({super.key});

  static const path = '/profile/email';

  @override
  ConsumerState<EmailVerificationScreen> createState() =>
      _EmailVerificationScreenState();
}

class _EmailVerificationScreenState
    extends ConsumerState<EmailVerificationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _code = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;
  AppException? _error;

  @override
  void initState() {
    super.initState();
    // Resume where the account left off: an address awaiting confirmation goes straight to the
    // code step, prefilled, instead of making someone retype it.
    final status = ref.read(profileOverviewProvider).valueOrNull?.email;
    final pending = status?.pendingEmail;
    if (pending != null) {
      _email.text = pending;
      _codeSent = true;
    } else if (status?.email != null) {
      _email.text = status!.email!;
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });

    final repository = ref.read(profileRepositoryProvider);
    final strings = Strings.of(context);

    try {
      if (!_codeSent) {
        await repository.requestEmailVerification(_email.text.trim());
        if (!mounted) return;
        setState(() {
          _busy = false;
          _codeSent = true;
        });
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(strings.get('email.sent'))));
        return;
      }

      await repository.confirmEmailVerification(_code.text.trim());
      // The profile screen reads this state, so it has to be refetched before the pop or the
      // card behind still says "not added".
      ref.invalidate(profileOverviewProvider);
      if (!mounted) return;
      popWithMessage(context, strings.get('email.done'));
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
      title: strings.get('email.title'),
      formKey: _formKey,
      busy: _busy,
      error: _error,
      submitLabel: _codeSent
          ? strings.get('email.confirm')
          : strings.get('email.send'),
      onSubmit: _submit,
      fields: [
        TextFormField(
          controller: _email,
          // Locked once the code is out: changing the address here would silently invalidate the
          // code that was just sent to the old one.
          enabled: !_busy && !_codeSent,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.email],
          decoration: InputDecoration(labelText: strings.get('email.address')),
          validator: (v) =>
              _isEmail(v) ? null : strings.get('email.validation.address'),
        ),
        if (_codeSent) ...[
          const SizedBox(height: 14),
          TextFormField(
            controller: _code,
            enabled: !_busy,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.done,
            maxLength: 6,
            // Digits only, enforced rather than hinted — the numeric keyboard is a suggestion,
            // and letters in this field is the exact bug that shipped on the web reset form.
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            onFieldSubmitted: (_) => _submit(),
            decoration: InputDecoration(
              labelText: strings.get('email.code'),
              counterText: '',
            ),
            validator: (v) => (v != null && v.trim().length == 6)
                ? null
                : strings.get('email.validation.code'),
          ),
        ],
        if (_codeSent) ...[
          const SizedBox(height: 12),
          TextButton(
            onPressed: _busy
                ? null
                : () => setState(() {
                    _codeSent = false;
                    _code.clear();
                    _error = null;
                  }),
            child: Text(strings.get('email.address')),
          ),
        ],
      ],
    );
  }

  /// Deliberately loose. The server validates with `@IsEmail()` and owns the verdict; this only
  /// catches the obvious typo before spending a round-trip and a rate-limit slot on it.
  static bool _isEmail(String? value) {
    final email = value?.trim() ?? '';
    return RegExp(r'^[^@\s]+@[^@\s.]+\.[^@\s]+$').hasMatch(email);
  }
}
