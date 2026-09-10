import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../app/providers.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/widgets/async_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../domain/legal_page.dart';

/// A legal page — privacy policy, public offer, FAQ — rendered as a page to read and leave.
///
/// **A reader, not a browser.** Two decisions make that true:
///
/// 1. **The content comes from the API, not from a URL.** `GET /content-pages/:slug` returns the
///    same text the website renders, with per-locale variants. Pointing a webview at
///    `gulyaly.pro/pages/privacy` would drag the site's header, footer and menu into the app —
///    the customer asked to read one page, not to browse the storefront inside a tab. The text is
///    wrapped in a small stylesheet that matches the app's own theme instead.
/// 2. **Every navigation is blocked.** `onNavigationRequest` refuses everything except the
///    initial document, so a link inside the text cannot turn this screen into a browser with no
///    address bar and no way back.
///
/// Why a webview at all, rather than Flutter text? The body is authored in the admin console and
/// can contain real formatting, and HTML is what renders it faithfully without shipping a
/// markdown engine and guessing at the author's intent.
class LegalPageScreen extends ConsumerWidget {
  const LegalPageScreen({super.key, required this.slug});

  static const path = '/profile/page';

  /// `privacy`, `offer`, `faq` — whatever the admin console has published.
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final page = ref.watch(legalPageProvider(slug));

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.get('profile.legal.$slug', fallback: slug)),
      ),
      body: AsyncView<LegalPage>(
        value: page,
        onRetry: () => ref.invalidate(legalPageProvider(slug)),
        skeleton: const Padding(
          padding: EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Skeleton(height: 22, width: 200, borderRadius: 6),
              SizedBox(height: 20),
              Skeleton(height: 14, borderRadius: 6),
              SizedBox(height: 10),
              Skeleton(height: 14, borderRadius: 6),
              SizedBox(height: 10),
              Skeleton(height: 14, width: 220, borderRadius: 6),
            ],
          ),
        ),
        // A page with no body is not an error, it is a page nobody has written yet. Saying so is
        // better than an empty white screen the customer will read as a bug.
        isEmpty: (value) => value.isEmpty,
        empty: EmptyState(
          icon: Icons.description_outlined,
          title: strings.get('profile.legal.empty'),
        ),
        data: (value) => _LegalWebView(page: value),
      ),
    );
  }
}

class _LegalWebView extends StatefulWidget {
  const _LegalWebView({required this.page});

  final LegalPage page;

  @override
  State<_LegalWebView> createState() => _LegalWebViewState();
}

class _LegalWebViewState extends State<_LegalWebView> {
  WebViewController? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;

    final theme = Theme.of(context);
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.disabled)
      ..setBackgroundColor(Colors.transparent)
      ..setNavigationDelegate(
        NavigationDelegate(
          // Nothing navigates. The document is loaded once from a data string; any link tap,
          // redirect or form is refused outright, which is what keeps this a reader.
          onNavigationRequest: (_) => NavigationDecision.prevent,
        ),
      )
      ..loadHtmlString(_documentFor(widget.page, theme));
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) return const SizedBox.shrink();
    return WebViewWidget(controller: controller);
  }
}

/// Wraps the authored text in a stylesheet that matches the app.
///
/// JavaScript is disabled and the content is escaped, so an admin-authored page cannot execute
/// anything inside the app's webview — the text is treated as text, which is what it is.
String _documentFor(LegalPage page, ThemeData theme) {
  final isDark = theme.brightness == Brightness.dark;
  final scheme = theme.colorScheme;

  String hex(Color color) =>
      '#${((color.a * 255).round() << 24 | (color.r * 255).round() << 16 | (color.g * 255).round() << 8 | (color.b * 255).round()).toRadixString(16).padLeft(8, '0').substring(2)}';

  // Blank lines become paragraphs; single newlines stay inside one. That is how the text is
  // written in the admin console, so that is how it is read here.
  final paragraphs = page.body
      .split(RegExp(r'\n\s*\n'))
      .map((block) => block.trim())
      .where((block) => block.isNotEmpty)
      .map(
        (block) =>
            '<p>${const HtmlEscape().convert(block).replaceAll('\n', '<br>')}</p>',
      )
      .join();

  return '''
<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: ${isDark ? 'dark' : 'light'}; }
  body {
    margin: 0; padding: 20px 20px 40px;
    background: transparent;
    color: ${hex(scheme.onSurface)};
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  h1 { font-size: 22px; line-height: 1.25; letter-spacing: -0.4px; margin: 0 0 18px; font-weight: 700; }
  p { margin: 0 0 14px; }
  .updated { margin-top: 28px; font-size: 13px; color: ${hex(scheme.onSurfaceVariant)}; }
</style>
</head><body>
<h1>${const HtmlEscape().convert(page.title)}</h1>
$paragraphs
</body></html>
''';
}
