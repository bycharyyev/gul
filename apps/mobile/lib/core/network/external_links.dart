import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/strings.dart';

/// Opens a link outside the app.
///
/// Deliberately not a webview. A social profile belongs in the real Instagram or TikTok app --
/// both detect an embedded webview and refuse to sign anyone in, so an in-app browser here would
/// be a link that visibly fails. The in-app reader (see `LegalPageScreen`) exists for content the
/// API owns; this exists for everything that belongs to someone else.
class ExternalLinks {
  const ExternalLinks();

  /// Returns true when the platform actually took the link.
  ///
  /// A refusal is surfaced rather than swallowed: a tap that appears to do nothing reads as a
  /// broken app, while "could not open" reads as a phone without that app installed.
  Future<bool> open(BuildContext context, String url) async {
    final uri = Uri.tryParse(url);
    // Only http(s). A URL from the CMS is authored content, and launching an arbitrary scheme
    // from it would hand a content editor the ability to fire intents.
    if (uri == null || !(uri.isScheme('http') || uri.isScheme('https'))) {
      _report(context);
      return false;
    }

    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) _report(context);
    return opened;
  }

  /// Payment redirects must never downgrade to cleartext HTTP.
  Future<bool> openPayment(BuildContext context, String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.isScheme('https')) {
      _report(context);
      return false;
    }
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) _report(context);
    return opened;
  }

  void _report(BuildContext context) {
    final strings = Strings.of(context);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(strings.get('common.linkFailed'))));
  }
}
