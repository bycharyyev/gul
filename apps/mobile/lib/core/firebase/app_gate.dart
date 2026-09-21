import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/strings.dart';
import 'remote_app_config.dart';

/// Shows the maintenance banner and, for builds older than `min_app_version`, a full-screen
/// "update the app" page in place of the app.
class AppGate extends StatelessWidget {
  const AppGate({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final service = RemoteAppConfigService.instance;
    return ValueListenableBuilder<RemoteAppConfig>(
      valueListenable: service.config,
      builder: (context, config, _) {
        if (service.updateRequired) return _UpdateRequired(config: config);
        if (config.maintenanceMessage.isEmpty) return child;
        return Column(
          children: [
            Material(
              color: Theme.of(context).colorScheme.tertiaryContainer,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: Text(
                    config.maintenanceMessage,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              ),
            ),
            Expanded(child: child),
          ],
        );
      },
    );
  }
}

class _UpdateRequired extends StatelessWidget {
  const _UpdateRequired({required this.config});

  final RemoteAppConfig config;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final uri = Uri.tryParse(config.updateUrl);
    final canOpen = uri != null && uri.scheme == 'https';
    return Material(
      color: Theme.of(context).colorScheme.surface,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.system_update, size: 56),
              const SizedBox(height: 16),
              Text(
                strings.get('update.title'),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(strings.get('update.message'), textAlign: TextAlign.center),
              if (canOpen) ...[
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () =>
                      launchUrl(uri, mode: LaunchMode.externalApplication),
                  child: Text(strings.get('update.button')),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
