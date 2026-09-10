import 'package:flutter/material.dart';

import '../../../../core/errors/app_exception.dart';
import '../../../../core/l10n/strings.dart';
import '../../../../core/widgets/error_banner.dart';

/// The frame the three profile forms share: a scrolling body that clears the keyboard, an inline
/// error slot, and a submit button that disables itself while the request is in flight.
///
/// Shared rather than repeated so all three behave identically — a form that stays enabled during
/// submission on one screen and not another is the kind of inconsistency people notice without
/// being able to name.
class FormScaffold extends StatelessWidget {
  const FormScaffold({
    super.key,
    required this.title,
    required this.formKey,
    required this.fields,
    required this.submitLabel,
    required this.onSubmit,
    required this.busy,
    this.error,
    this.footer,
  });

  final String title;
  final GlobalKey<FormState> formKey;
  final List<Widget> fields;
  final String submitLabel;
  final VoidCallback onSubmit;
  final bool busy;
  final AppException? error;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      // Form on the outside, SingleChildScrollView within. A `Form` *inside* a lazy `ListView`
      // is a trap: scrolling the fields out of view disposes them, `formKey.currentState` goes
      // null, and submit silently does nothing — reachable on a short phone with the keyboard up.
      body: SafeArea(
        child: Form(
          key: formKey,
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
                ...fields,
                if (error != null) ...[
                  const SizedBox(height: 18),
                  ErrorBanner(error: error!, onRetry: busy ? null : onSubmit),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: busy ? null : onSubmit,
                  child: busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.2,
                            color: Colors.white,
                          ),
                        )
                      : Text(submitLabel),
                ),
                if (footer != null) ...[const SizedBox(height: 18), footer!],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Shows a confirmation and pops the screen. The message stays on the screen the user lands on,
/// so it is still readable after the pop.
void popWithMessage(BuildContext context, String message) {
  final messenger = ScaffoldMessenger.of(context);
  Navigator.of(context).pop();
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// The shared "something went wrong" path for a form: keeps the user on the screen with their
/// input intact, and shows the server's own message when it sent one.
AppException toAppException(Object error) => error is AppException
    ? error
    : const AppException(kind: AppErrorKind.unknown);

/// Reads a label out of [Strings] without every form importing it directly.
String label(BuildContext context, String key) => Strings.of(context).get(key);
