import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/welcome_copy_repository.dart';
import '../domain/welcome_copy.dart';

/// Holds whatever the CMS last said the welcome screen should say, or null for "use what shipped".
///
/// Cache first, then network — never the other way round, and never a loading state. A skeleton
/// here would slow down every launch, including the overwhelming majority where the text has not
/// changed, and on a failed request it would have nothing to resolve into. The screen renders the
/// built-in copy on the first frame and this quietly replaces it if there is something newer.
class WelcomeCopyController extends StateNotifier<WelcomeCopy?> {
  WelcomeCopyController(this._repository, this._locale) : super(null) {
    _load();
  }

  final WelcomeCopyRepository _repository;
  final String _locale;

  Future<void> _load() async {
    final cached = await _repository.readCached(_locale);
    if (!mounted) return;
    if (cached != null) state = cached;

    final fresh = await _repository.fetch(_locale);
    if (!mounted) return;
    // Null means the request failed or nobody has written the page. Either way the cached copy —
    // or the built-in one — is still the best thing to show, so it is left alone.
    if (fresh != null) state = fresh;
  }
}
