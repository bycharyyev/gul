import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import '../../auth/presentation/login_screen.dart' show validatePhone;
import 'widgets/form_scaffold.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  static const path = '/profile/edit';

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _fullName;
  late final TextEditingController _phone;
  bool _busy = false;
  AppException? _error;

  @override
  void initState() {
    super.initState();
    // Pre-filled from the current account: an edit form that starts blank makes people retype
    // what is already correct, and a blank required field is one submit away from wiping a name.
    final user = ref.read(authControllerProvider).user;
    _fullName = TextEditingController(text: user?.fullName ?? '');
    _phone = TextEditingController(text: user?.phone ?? '');
  }

  @override
  void dispose() {
    _fullName.dispose();
    _phone.dispose();
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
      final user = await ref
          .read(profileRepositoryProvider)
          .updateProfile(
            fullName: _fullName.text.trim(),
            phone: _phone.text.trim(),
          );
      ref.read(authControllerProvider.notifier).applyUser(user);
      if (!mounted) return;
      popWithMessage(context, Strings.of(context).get('edit.saved'));
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
      title: strings.get('edit.title'),
      formKey: _formKey,
      busy: _busy,
      error: _error,
      submitLabel: strings.get('common.save'),
      onSubmit: _submit,
      fields: [
        TextFormField(
          controller: _fullName,
          enabled: !_busy,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          maxLength: 120,
          decoration: InputDecoration(
            labelText: strings.get('edit.fullName'),
            counterText: '',
          ),
          // `UpdateMeDto` marks fullName `@Length(1, 120)` and non-optional, so an empty value is
          // a 400 rather than a no-op.
          validator: (v) => (v == null || v.trim().isEmpty)
              ? strings.get('auth.register.fullName')
              : null,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _phone,
          enabled: !_busy,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.done,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9+]')),
          ],
          onFieldSubmitted: (_) => _submit(),
          decoration: InputDecoration(labelText: strings.get('edit.phone')),
          validator: (v) => validatePhone(v, strings),
        ),
      ],
    );
  }
}
