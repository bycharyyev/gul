import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/l10n/strings.dart';

/// Keys built at runtime from backend values rather than written out literally. Everything under
/// these prefixes is exempt from the "must be referenced" rule below.
const _dynamicPrefixes = ['status.'];

void main() {
  test('every defined string is used, and every used string is defined', () {
    // Scanning the source rather than trusting review: a stale key is invisible, and a key used
    // but never defined renders its own name to the user — both survive code review easily.
    final referenced = <String>{};
    // Any dotted single-quoted literal, not only the ones sitting directly inside `get(` — keys
    // are also passed through ternaries and variables, and a pattern anchored on `get(` reports
    // those as dead.
    final pattern = RegExp(r"'([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+)'");

    for (final file in Directory('lib').listSync(recursive: true)) {
      if (file is! File || !file.path.endsWith('.dart')) continue;
      for (final match in pattern.allMatches(file.readAsStringSync())) {
        referenced.add(match.group(1)!);
      }
    }

    expect(
      referenced,
      isNotEmpty,
      reason: 'the scan found nothing — the pattern is wrong',
    );

    final defined = Strings.keysFor('ru');

    // Only literals that look like keys *and* are defined count as references; the broad pattern
    // also picks up things like `dart.library.io`, which are not keys and must not be reported
    // as undefined.
    final undefined = referenced
        .where(
          (key) =>
              defined.any((d) => d.split('.').first == key.split('.').first),
        )
        .toSet()
        .difference(defined);
    expect(
      undefined,
      isEmpty,
      reason: 'used in code but missing from the string table',
    );

    final unused = defined
        .difference(referenced)
        .where((key) => !_dynamicPrefixes.any(key.startsWith))
        .toSet();
    expect(unused, isEmpty, reason: 'defined but never used — delete these');
  });
}
