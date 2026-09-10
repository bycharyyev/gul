import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/error_banner.dart';
import 'login_screen.dart';
import 'widgets/auth_form_layout.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  static const path = '/register';

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _fullName = TextEditingController();
  final _referral = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    _fullName.dispose();
    _referral.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    await ref
        .read(authControllerProvider.notifier)
        .register(
          phone: _phone.text.trim(),
          password: _password.text,
          fullName: _fullName.text.trim(),
          referredByUsername: _referral.text.trim(),
          // The device's language becomes the account's, so the first order email arrives in a
          // language the person actually reads. `tkm`, not the ISO `tk` — the API rejects `tk`.
          locale: Strings.of(context).locale,
        );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    final strings = Strings.of(context);

    return AuthFormLayout(
      title: strings.get('auth.register.title'),
      children: [
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _phone,
                enabled: !state.busy,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.telephoneNumber],
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9+]')),
                ],
                decoration: InputDecoration(
                  labelText: strings.get('auth.login.phone'),
                ),
                validator: (v) => validatePhone(v, strings),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _password,
                enabled: !state.busy,
                obscureText: _obscure,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.newPassword],
                decoration: InputDecoration(
                  labelText: strings.get('auth.login.password'),
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: Icon(
                      _obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
                // Mirrors the backend's `@Length(8, 72)`.
                validator: (v) => (v == null || v.length < 8)
                    ? strings.get('auth.validation.password')
                    : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _fullName,
                enabled: !state.busy,
                textInputAction: TextInputAction.next,
                textCapitalization: TextCapitalization.words,
                autofillHints: const [AutofillHints.name],
                maxLength: 120,
                decoration: InputDecoration(
                  labelText: strings.get('auth.register.fullName'),
                  counterText: '',
                ),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _referral,
                enabled: !state.busy,
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _submit(),
                maxLength: 32,
                decoration: InputDecoration(
                  labelText: strings.get('auth.register.referral'),
                  counterText: '',
                  prefixIcon: const Icon(Icons.diversity_3_rounded, size: 20),
                ),
                // Rebuilds this row only, not the whole form, when the field changes.
                onChanged: (_) => setState(() {}),
              ),
              if (_referral.text.trim().isNotEmpty) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Theme.of(
                      context,
                    ).colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.shield_outlined,
                        size: 17,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 9),
                      Expanded(
                        child: Text(
                          strings.get('auth.register.antifraudNote'),
                          style: TextStyle(
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                            fontSize: 12.5,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        if (state.error != null) ...[
          const SizedBox(height: 18),
          ErrorBanner(
            error: state.error!,
            onRetry: state.busy ? null : _submit,
            // A conflict on this screen has exactly one cause: the phone is already an account.
            // It is reachable without the person doing anything wrong — a registration that timed
            // out on a bad connection may well have succeeded on the server, and the retry then
            // lands on their own new account. The API answers that in English, and the reply that
            // matters is not "conflict" but "you already have an account, sign in" — with the
            // sign-in link sitting directly below this banner.
            message: state.error!.kind == AppErrorKind.conflict
                ? strings.get('auth.register.phoneTaken')
                : null,
          ),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: state.busy ? null : _submit,
          child: state.busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.2,
                    color: Colors.white,
                  ),
                )
              : Text(strings.get('auth.register.submit')),
        ),
        const SizedBox(height: 8),
        // See the note on the same row in login_screen.dart — a Row overflows here.
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(strings.get('auth.register.haveAccount')),
            TextButton(
              onPressed: state.busy ? null : () => context.go(LoginScreen.path),
              child: Text(strings.get('auth.register.login')),
            ),
          ],
        ),
      ],
    );
  }
}
