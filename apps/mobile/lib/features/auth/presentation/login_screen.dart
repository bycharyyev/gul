import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/error_banner.dart';
import 'register_screen.dart';
import 'widgets/auth_form_layout.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  static const path = '/login';

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    // The keyboard hides the error banner the response may produce.
    FocusScope.of(context).unfocus();
    await ref
        .read(authControllerProvider.notifier)
        .login(phone: _phone.text.trim(), password: _password.text);
    // No navigation here: the router's guard moves to /home when the status flips. Pushing a
    // route from the callback as well would race it.
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    final strings = Strings.of(context);

    return AuthFormLayout(
      title: strings.get('auth.login.title'),
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
                // A keyboard type is only a hint — a hardware keyboard, a paste, or a swipe
                // keyboard can all put letters in a "numeric" field. Filtering is the guarantee.
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
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                onFieldSubmitted: (_) => _submit(),
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
                // Login only checks that something was typed. The 8-character rule belongs on
                // registration; enforcing it here would lock out anyone whose existing password
                // predates it, for no security gain.
                validator: (v) => (v == null || v.isEmpty)
                    ? strings.get('auth.validation.passwordRequired')
                    : null,
              ),
            ],
          ),
        ),
        if (state.error != null) ...[
          const SizedBox(height: 18),
          ErrorBanner(
            error: state.error!,
            onRetry: state.busy ? null : _submit,
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
              : Text(strings.get('auth.login.submit')),
        ),
        const SizedBox(height: 8),
        // Wrap, not Row: "Нет аккаунта? Зарегистрироваться" plus a 48dp minimum tap target
        // overflows a Row on a narrow phone, and Turkmen is longer still.
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(strings.get('auth.login.noAccount')),
            TextButton(
              onPressed: state.busy
                  ? null
                  : () => context.go(RegisterScreen.path),
              child: Text(strings.get('auth.login.register')),
            ),
          ],
        ),
      ],
    );
  }
}

/// Shared by both auth screens. The bound is the backend's own: `@Length(6, 20)` on the phone
/// field — rejecting it here saves a round-trip and an English class-validator message.
String? validatePhone(String? value, Strings strings) {
  final phone = value?.trim() ?? '';
  return (phone.length < 6 || phone.length > 20)
      ? strings.get('auth.validation.phone')
      : null;
}
