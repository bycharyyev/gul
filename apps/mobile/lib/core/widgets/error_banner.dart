import 'package:flutter/material.dart';

import '../errors/app_exception.dart';
import '../l10n/strings.dart';

/// Inline failure message for a form.
///
/// Inline rather than a snackbar: a snackbar times out, and a person re-reading why their login
/// failed after fumbling the password should not have to trigger it again. Retryable failures get
/// a retry affordance; a wrong password does not — retrying that is just pressing the button.
class ErrorBanner extends StatelessWidget {
  const ErrorBanner({
    super.key,
    required this.error,
    this.onRetry,
    this.message,
  });

  final AppException error;
  final VoidCallback? onRetry;

  /// Replaces the text [Strings.error] would derive from [error].
  ///
  /// For the cases where the screen knows something the mapper cannot: the API returns
  /// its conflict messages in English, and on a screen where a conflict has exactly one
  /// cause, the screen can say what it is in the reader's own language.
  final String? message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final strings = Strings.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.error_outline,
                size: 20,
                color: scheme.onErrorContainer,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message ?? strings.error(error),
                  style: TextStyle(
                    color: scheme.onErrorContainer,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
          if (onRetry != null && error.isRetryable) ...[
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: onRetry,
                child: Text(strings.get('common.retry')),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
