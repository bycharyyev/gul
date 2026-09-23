/// A CMS page: privacy policy, public offer, FAQ.
///
/// The backend stores one base (Russian) title/body plus optional per-locale overrides, and an
/// empty override means "not translated yet" rather than "empty page" -- so resolution falls back
/// to the base rather than showing a customer a blank privacy policy.
class LegalPage {
  const LegalPage({
    required this.slug,
    required this.title,
    required this.body,
    required this.updatedAt,
  });

  final String slug;
  final String title;

  /// Plain text / light markdown, as authored in the admin console.
  final String body;

  final DateTime? updatedAt;

  factory LegalPage.fromJson(Map<String, dynamic> json, String locale) {
    String? pick(String base, String en, String tkm) {
      final value = switch (locale) {
        'en' => json[en],
        'tkm' => json[tkm],
        _ => json[base],
      };
      final text = value is String ? value.trim() : '';
      if (text.isNotEmpty) return text;
      final fallback = json[base];
      return fallback is String && fallback.trim().isNotEmpty
          ? fallback.trim()
          : null;
    }

    return LegalPage(
      slug: json['slug'] as String? ?? '',
      title: pick('title', 'titleEn', 'titleTkm') ?? '',
      body: pick('body', 'bodyEn', 'bodyTkm') ?? '',
      updatedAt: DateTime.tryParse(
        json['updatedAt'] as String? ?? '',
      )?.toLocal(),
    );
  }

  bool get isEmpty => body.trim().isEmpty;
}
