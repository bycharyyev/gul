import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/strings.dart';
import 'remote_app_config.dart';

/// Shows the maintenance notice and, for builds older than `min_app_version`, a full-screen
/// "update the app" page in place of the app.
class AppGate extends StatefulWidget {
  const AppGate({required this.child, super.key});

  final Widget child;

  @override
  State<AppGate> createState() => _AppGateState();
}

class _AppGateState extends State<AppGate> {
  /// The notice text the person closed. A different message shows again; the same one stays away
  /// until the next launch.
  String? _dismissed;

  @override
  Widget build(BuildContext context) {
    final service = RemoteAppConfigService.instance;
    return ListenableBuilder(
      listenable: Listenable.merge([service.config, service.serverForcedUpdate]),
      builder: (context, _) {
        final config = service.config.value;
        if (service.updateRequired) return _UpdateRequired(config: config);
        final message = config.maintenanceMessage;
        if (message.isEmpty || message == _dismissed) return widget.child;

        final topInset = MediaQuery.paddingOf(context).top;
        return Stack(
          children: [
            // The screens keep their own layout; the notice floats over the top edge, so nothing
            // is pushed down and no screen ends up with a doubled status-bar gap.
            Positioned.fill(child: widget.child),
            Positioned(
              left: 12,
              right: 12,
              top: topInset + 8,
              child: _NoticeCard(
                message: message,
                onClose: () => setState(() => _dismissed = message),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({required this.message, required this.onClose});

  final String message;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.inverseSurface,
      elevation: 6,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 4, 10),
        child: Row(
          children: [
            Icon(Icons.info_outline, size: 20, color: scheme.onInverseSurface),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: scheme.onInverseSurface,
                ),
              ),
            ),
            IconButton(
              visualDensity: VisualDensity.compact,
              icon: Icon(
                Icons.close,
                size: 18,
                color: scheme.onInverseSurface,
              ),
              onPressed: onClose,
            ),
          ],
        ),
      ),
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
