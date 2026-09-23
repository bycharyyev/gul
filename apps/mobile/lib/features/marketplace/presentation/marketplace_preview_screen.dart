import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/l10n/strings.dart';
import 'product_extractor.dart';

/// The product page, opened on the customer's own connection, with what it says about itself read
/// out of it.
///
/// Why this exists at all: the marketplaces answer a plain HTTP client with 403 and 307 and a
/// captcha, from every machine we own *and* from the customer's own network. They answer a real
/// browser normally — the same browser the customer would have used anyway. Measured on a real
/// device on 2026-09-09: Chrome in Turkmenistan loads the Ozon product page in full while `curl`
/// from the same phone gets 403. Nothing here evades anything; it renders the page and reads the
/// metadata the site publishes for exactly this purpose.
///
/// The page is shown, not hidden. Three reasons, in order of importance: the customer confirms
/// their own product rather than trusting a scraper; a captcha is something a person can clear in
/// one tap, after which the cookie stays and later links go straight through; and a page that
/// renders in front of somebody cannot quietly do something they did not ask for.
class MarketplacePreviewScreen extends StatefulWidget {
  const MarketplacePreviewScreen({
    super.key,
    required this.url,
    required this.sourceName,
  });

  final String url;
  final String sourceName;

  @override
  State<MarketplacePreviewScreen> createState() =>
      _MarketplacePreviewScreenState();
}

class _MarketplacePreviewScreenState extends State<MarketplacePreviewScreen> {
  static const _channel = 'GulyalyProduct';

  // The stock Android WebView announces itself with "; wv" in the user agent, which some sites
  // treat as an embedded frame and serve differently. This is Chrome's own string for the same
  // engine: no claim that is not already true of the renderer actually running.
  static const _userAgent =
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/126.0.0.0 Mobile Safari/537.36';

  late final WebViewController _controller;
  ProductFacts _facts = const ProductFacts();
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    final controller = WebViewController();
    _controller = controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setUserAgent(_userAgent)
      ..addJavaScriptChannel(_channel, onMessageReceived: _onFacts)
      ..setNavigationDelegate(
        NavigationDelegate(
          // Re-injected on every document, not just the first: a share link redirects to the
          // product page, and a captcha resolves into it. Each of those is a new document, and
          // the one worth reading is usually the last.
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
            controller.runJavaScript(productExtractorJs);
          },
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  void _onFacts(JavaScriptMessage message) {
    Map<String, dynamic> decoded;
    try {
      final raw = jsonDecode(message.message);
      if (raw is! Map<String, dynamic>) return;
      decoded = raw;
    } catch (_) {
      return;
    }
    // Kept in a debug build only, and the single most useful line when a marketplace changes its
    // markup: it says which reader answered and what it saw.
    if (kDebugMode) debugPrint('marketplace extractor: ${message.message}');
    final facts = ProductFacts.fromExtractor(decoded);
    if (facts.isEmpty || !mounted) return;
    setState(() => _facts = facts);
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.sourceName),
        actions: [
          if (_loading)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(
                child: SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: WebViewWidget(controller: _controller)),
          SafeArea(
            top: false,
            child: Material(
              color: scheme.surface,
              elevation: 8,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_facts.title != null)
                      Text(
                        _facts.title!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          height: 1.3,
                          fontWeight: FontWeight.w600,
                        ),
                      )
                    else
                      Text(
                        strings.get('marketplace.preview.reading'),
                        style: TextStyle(
                          fontSize: 12.5,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    if (_facts.price != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        // Same shape as the result card renders a server-supplied price, so the
                        // two sources look identical to the customer.
                        '${_facts.price!.toStringAsFixed(0)} ${_facts.currency ?? 'RUB'}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        // Sized to its own word rather than to a share of the row: "Пропустить"
                        // in a one-third Expanded broke across two lines mid-word.
                        TextButton(
                          onPressed: () => Navigator.of(context).pop(),
                          child: Text(
                            strings.get('marketplace.preview.skip'),
                            maxLines: 1,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                            onPressed: () => Navigator.of(context).pop(_facts),
                            child: Text(
                              strings.get('marketplace.preview.confirm'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
