import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../errors/app_exception.dart';
import '../l10n/strings.dart';

/// Renders the four states every remote screen has: loading, error, empty, and data.
///
/// One place, so no screen forgets one of them. The default failure path is the one that gets
/// skipped in practice, and a screen that silently shows nothing on a failed request is
/// indistinguishable from a screen with no data.
class AsyncView<T> extends StatelessWidget {
  const AsyncView({
    super.key,
    required this.value,
    required this.data,
    required this.skeleton,
    this.onRetry,
    this.isEmpty,
    this.empty,
  });

  final AsyncValue<T> value;
  final Widget Function(T value) data;

  /// Shown while loading. A shape that matches the loaded content, not a spinner — see [Skeleton].
  final Widget skeleton;

  final VoidCallback? onRetry;
  final bool Function(T value)? isEmpty;
  final Widget? empty;

  @override
  Widget build(BuildContext context) {
    return value.when(
      // `skipLoadingOnRefresh` is the default: a pull-to-refresh keeps the current list on screen
      // instead of replacing it with skeletons, which is what makes refresh feel instant.
      loading: () => skeleton,
      error: (error, _) => ErrorState(
        error: error is AppException
            ? error
            : const AppException(kind: AppErrorKind.unknown),
        onRetry: onRetry,
      ),
      data: (value) {
        if (isEmpty?.call(value) == true && empty != null) return empty!;
        return data(value);
      },
    );
  }
}

/// A failed load, with a way out of it.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, this.onRetry});

  final AppException error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              error.kind == AppErrorKind.network
                  ? Icons.wifi_off_rounded
                  : Icons.error_outline_rounded,
              size: 40,
              color: scheme.onSurfaceVariant,
            ),
            const SizedBox(height: 14),
            Text(
              strings.error(error),
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurfaceVariant, height: 1.4),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: Text(strings.get('common.retry')),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// "Nothing here yet" — with what to do about it, never a blank screen.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 28, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
            if (message != null) ...[
              const SizedBox(height: 8),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: TextStyle(color: scheme.onSurfaceVariant, height: 1.4),
              ),
            ],
            if (action != null) ...[const SizedBox(height: 20), action!],
          ],
        ),
      ),
    );
  }
}
