import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/strings.dart';
import 'remote_app_config.dart';

/// Shows update prompts and the maintenance notice over the app, and, once an update is
/// mandatory, a full-screen "update the app" page in place of it. See [RemoteAppConfig] for the
/// three levels.
class AppGate extends StatefulWidget {
  const AppGate({required this.child, super.key});

  final Widget child;

  @override
  State<AppGate> createState() => _AppGateState();
}

class _AppGateState extends State<AppGate> {
  /// Cards the person closed, until the next launch. A different text shows again.
  final _dismissed = <String>{};

  @override
  Widget build(BuildContext context) {
    final service = RemoteAppConfigService.instance;
    return ListenableBuilder(
      listenable: Listenable.merge([service.config, service.clock]),
      builder: (context, _) {
        final config = service.config.value;
        final level = service.updateLevel;
        if (level == UpdateLevel.required) {
          return _UpdateRequired(config: config);
        }

        final strings = Strings.of(context);
        final cards = <_Notice>[];
        if (level == UpdateLevel.requiredSoon) {
          cards.add(
            _Notice(
              text: strings
                  .get('update.soon')
                  .replaceAll('{date}', _formatDate(config.updateDeadline)),
              updateUrl: config.updateUrl,
              icon: Icons.warning_amber_rounded,
            ),
          );
        } else if (level == UpdateLevel.recommended) {
          cards.add(
            _Notice(
              text: strings.get('update.recommended'),
              updateUrl: config.updateUrl,
              icon: Icons.system_update,
            ),
          );
        }
        if (config.maintenanceMessage.isNotEmpty) {
          cards.add(_Notice(text: config.maintenanceMessage));
        }
        final visible = cards
            .where((c) => !_dismissed.contains(c.text))
            .toList();
        if (visible.isEmpty) return widget.child;

        final topInset = MediaQuery.paddingOf(context).top;
        return Stack(
          children: [
            // The screens keep their own layout; the cards float over the top edge, so nothing is
            // pushed down and no screen ends up with a doubled status-bar gap.
            Positioned.fill(child: widget.child),
            Positioned(
              left: 12,
              right: 12,
              top: topInset + 8,
              child: Column(
                children: [
                  for (final notice in visible)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _NoticeCard(
                        notice: notice,
                        actionLabel: strings.get('update.button'),
                        onClose: () =>
                            setState(() => _dismissed.add(notice.text)),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  static String _formatDate(String iso) {
    final date = DateTime.tryParse(iso)?.toLocal();
    if (date == null) return '';
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(date.day)}.${two(date.month)}.${date.year}';
  }
}

class _Notice {
  const _Notice({
    required this.text,
    this.updateUrl = '',
    this.icon = Icons.info_outline,
  });

  final String text;
  final String updateUrl;
  final IconData icon;
}

Uri? _httpsUri(String value) {
  final uri = Uri.tryParse(value);
  return uri != null && uri.scheme == 'https' ? uri : null;
}

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({
    required this.notice,
    required this.actionLabel,
    required this.onClose,
  });

  final _Notice notice;
  final String actionLabel;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final uri = _httpsUri(notice.updateUrl);
    final onDark = scheme.onInverseSurface;
    return Material(
      color: scheme.inverseSurface,
      elevation: 6,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 4, 10),
        child: Row(
          children: [
            Icon(notice.icon, size: 20, color: onDark),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                notice.text,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: onDark),
              ),
            ),
            if (uri != null)
              TextButton(
                onPressed: () =>
                    launchUrl(uri, mode: LaunchMode.externalApplication),
                child: Text(
                  actionLabel,
                  style: TextStyle(
                    color: scheme.inversePrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            IconButton(
              visualDensity: VisualDensity.compact,
              icon: Icon(Icons.close, size: 18, color: onDark),
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
    final uri = _httpsUri(config.updateUrl);
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
              if (uri != null) ...[
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
