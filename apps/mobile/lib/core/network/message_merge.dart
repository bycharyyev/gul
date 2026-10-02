/// Incremental message reads (`?after=<message id>`): the server answers with only the messages
/// newer than the cursor and `incremental: true`. These helpers keep what is already on screen and
/// add what arrived -- nothing that was loaded before is ever dropped.
library;

/// `?after=<id>` for a message read, or nothing before the first full load.
String afterQuery(String? cursor) => cursor == null || cursor.isEmpty
    ? ''
    : '?after=${Uri.encodeQueryComponent(cursor)}';

/// [held] plus the messages of [incoming] it does not have yet, ordered by time (then id).
///
/// A message this device sent and that the poll brings back is not shown twice; a message from
/// the other side stored just before ours lands above it, not below.
List<T> mergeMessages<T>(
  List<T> held,
  List<T> incoming, {
  required String Function(T) id,
  required DateTime? Function(T) at,
}) {
  if (incoming.isEmpty) return held;
  final seen = {for (final m in held) id(m)};
  final merged = [
    ...held,
    for (final m in incoming)
      if (!seen.contains(id(m))) m,
  ];
  merged.sort((a, b) {
    final ta = at(a);
    final tb = at(b);
    final byTime = (ta == null || tb == null) ? 0 : ta.compareTo(tb);
    return byTime != 0 ? byTime : id(a).compareTo(id(b));
  });
  return merged;
}
