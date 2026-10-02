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

  /// The classic form; `/register` itself is the chat (ChatAuthScreen).
  static const path = '/register/form';

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();

  /// Set once the code has been mailed; the screen then asks for the code instead of the form.
  ({String email, int expiresInMinutes})? _sentTo;
  final _fullName = TextEditingController();
  final _referral = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _code.dispose();
    _fullName.dispose();
    _referral.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    final started = await ref
        .read(authControllerProvider.notifier)
        .startRegistration(
          email: _email.text.trim().toLowerCase(),
          password: _password.text,
          fullName: _fullName.text.trim(),
          referredByUsername: _referral.text.trim(),
          // The device's language becomes the account's, so the first order email arrives in a
          // language the person actually reads. `tkm`, not the ISO `tk` — the API rejects `tk`.
          locale: Strings.of(context).locale,
        );
    if (started != null && mounted) {
      _code.clear();
      setState(() => _sentTo = started);
    }
  }

  Future<void> _confirm() async {
    final sentTo = _sentTo;
    if (sentTo == null || _code.text.trim().length != 6) return;
    FocusScope.of(context).unfocus();
    await ref
        .read(authControllerProvider.notifier)
        .confirmRegistration(email: sentTo.email, code: _code.text.trim());
    // No navigation here: the router's guard moves to /home once the status flips.
  }

  Widget _codeStep(BuildContext context, Strings strings) {
    final state = ref.watch(authControllerProvider);
    final sentTo = _sentTo!;
    return AuthFormLayout(
      title: strings.get('auth.register.codeTitle'),
      children: [
        Text(
          strings
              .get('auth.register.codeHint')
              .replaceAll('{email}', sentTo.email)
              .replaceAll('{minutes}', sentTo.expiresInMinutes.toString()),
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            height: 1.35,
          ),
        ),
        const SizedBox(height: 18),
        TextField(
          controller: _code,
          enabled: !state.busy,
          autofocus: true,
          keyboardType: TextInputType.number,
          autofillHints: const [AutofillHints.oneTimeCode],
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _confirm(),
          decoration: InputDecoration(
            labelText: strings.get('auth.register.codeLabel'),
          ),
        ),
        if (state.error != null) ...[
          const SizedBox(height: 18),
          ErrorBanner(
            error: state.error!,
            onRetry: state.busy ? null : _confirm,
          ),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: state.busy || _code.text.trim().length != 6
              ? null
              : _confirm,
          child: state.busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.2,
                    color: Colors.white,
                  ),
                )
              : Text(strings.get('auth.register.confirm')),
        ),
        const SizedBox(height: 8),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          children: [
            TextButton(
              onPressed: state.busy
                  ? null
                  : () {
                      ref.read(authControllerProvider.notifier).clearError();
                      setState(() => _sentTo = null);
                    },
              child: Text(strings.get('auth.register.changeEmail')),
            ),
            TextButton(
              onPressed: state.busy ? null : _submit,
              child: Text(strings.get('auth.register.resend')),
            ),
          ],
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    final strings = Strings.of(context);
    if (_sentTo != null) return _codeStep(context, strings);

    return AuthFormLayout(
      title: strings.get('auth.register.title'),
      children: [
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _email,
                enabled: !state.busy,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autocorrect: false,
                autofillHints: const [AutofillHints.email],
                decoration: InputDecoration(
                  labelText: strings.get('auth.login.email'),
                ),
                validator: (v) => validateEmail(v, strings),
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
            // A conflict on this screen has exactly one cause: the email is already an account.
            // It is reachable without the person doing anything wrong — a registration that timed
            // out on a bad connection may well have succeeded on the server, and the retry then
            // lands on their own new account. The API answers that in English, and the reply that
            // matters is not "conflict" but "you already have an account, sign in" — with the
            // sign-in link sitting directly below this banner.
            message: state.error!.kind == AppErrorKind.conflict
                ? strings.get('auth.register.emailTaken')
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
