import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/l10n/strings.dart';
import '../../gallery/presentation/product_screen.dart';
import '../../home/presentation/home_screen.dart';

/// Where `gulyaly.com/l/<slug>` lands inside the app.
///
/// A link staff pointed at one of this app's own pages (today, only a product) opens that screen
/// directly, in-app, rather than round-tripping through a browser tab this app would immediately
/// have to hand off from. Anything else -- an external page, a promo nobody has built an in-app
/// screen for -- opens the way any other outside link does (see [ExternalLinks]), because this
/// app has nowhere of its own to put it.
class ManagedLinkRedirectScreen extends ConsumerStatefulWidget {
  const ManagedLinkRedirectScreen({super.key, required this.slug});
  final String slug;

  @override
  ConsumerState<ManagedLinkRedirectScreen> createState() =>
      _ManagedLinkRedirectScreenState();
}

class _ManagedLinkRedirectScreenState
    extends ConsumerState<ManagedLinkRedirectScreen> {
  bool _notFound = false;

  @override
  void initState() {
    super.initState();
    unawaited(_resolve());
  }

  Future<void> _resolve() async {
    final String target;
    try {
      target = await ref
          .read(managedLinkRepositoryProvider)
          .resolveTargetUrl(widget.slug);
    } catch (_) {
      if (mounted) setState(() => _notFound = true);
      return;
    }
    if (!mounted) return;

    final internal = _asProductRoute(target);
    if (internal != null) {
      context.go(internal);
      return;
    }

    await ref.read(externalLinksProvider).open(context, target);
    if (mounted) context.go(HomeScreen.path);
  }

  /// Recognises only this app's own product page, and only on this app's own site -- a link an
  /// admin pointed elsewhere must open elsewhere, not be guessed at.
  String? _asProductRoute(String target) {
    final uri = Uri.tryParse(target);
    if (uri == null) return null;
    final siteHost = Uri.tryParse(
      ref.read(appConfigProvider).siteBaseUrl,
    )?.host;
    if (siteHost == null || uri.host != siteHost) return null;
    final segments = uri.pathSegments;
    if (segments.length != 3 ||
        segments[0] != 'gallery' ||
        segments[1] != 'product') {
      return null;
    }
    return '${ProductScreen.path}/${segments[2]}';
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return Scaffold(
      body: Center(
        child: _notFound
            ? Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      strings.get('link.notFound'),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => context.go(HomeScreen.path),
                      child: Text(strings.get('link.backHome')),
                    ),
                  ],
                ),
              )
            : const CircularProgressIndicator(),
      ),
    );
  }
}
