import '../../profile/domain/legal_page.dart';

/// The three lines of the welcome screen, as authored in the admin console.
///
/// The screen has built-in text for all three and renders it immediately; this only ever replaces
/// it. That is the whole point of the feature: the categories the app sells will keep changing —
/// post is already planned — and the one screen that describes them should not need a store
/// release to say something new.
///
/// It rides on `ContentPage`, the same CMS row the legal pages use, so nothing new exists on the
/// backend: one slug, `welcome`, with the per-locale title/body fields that model already has.
class WelcomeCopy {
  const WelcomeCopy({required this.title, this.titleAccent, this.subtitle});

  /// First line of the headline, in the page's own colour.
  final String title;

  /// Second line, the one carrying the brand gradient. Null means the admin left it out and the
  /// built-in line should stand.
  final String? titleAccent;

  /// The line under the headline. Null means the same.
  final String? subtitle;

  /// `title` is the headline; the first line of `body` is the accent half, and everything after it
  /// is the subtitle.
  ///
  /// A convention on a free-text field, and it is one — `ContentPage` offers two fields and this
  /// screen needs three. The alternative was a model of its own for a single screen. It fails
  /// softly in the direction that matters: any part the author leaves out keeps the shipped text
  /// rather than rendering blank, and a page with no title at all is treated as no override.
  static WelcomeCopy? fromPage(LegalPage page) {
    final title = page.title.trim();
    if (title.isEmpty) return null;

    final blocks = page.body
        .split(RegExp(r'\r?\n'))
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .toList();

    return WelcomeCopy(
      title: title,
      titleAccent: blocks.isNotEmpty ? blocks.first : null,
      subtitle: blocks.length > 1 ? blocks.skip(1).join(' ') : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'title': title,
    if (titleAccent != null) 'titleAccent': titleAccent,
    if (subtitle != null) 'subtitle': subtitle,
  };

  static WelcomeCopy? fromJson(Map<String, dynamic> json) {
    final title = json['title'];
    if (title is! String || title.trim().isEmpty) return null;
    return WelcomeCopy(
      title: title,
      titleAccent: json['titleAccent'] as String?,
      subtitle: json['subtitle'] as String?,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is WelcomeCopy &&
      other.title == title &&
      other.titleAccent == titleAccent &&
      other.subtitle == subtitle;

  @override
  int get hashCode => Object.hash(title, titleAccent, subtitle);
}
