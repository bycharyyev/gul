/// Where a story or home slide sends the user when tapped.
///
/// The backend supplies `linkType` explicitly, and the app routes on it rather than guessing from
/// whichever id happens to be non-null — a slide can carry a stale `serviceId` alongside
/// `linkType: NONE`, and guessing would navigate somewhere the editor did not intend.
enum PromoLinkType { none, service, galleryProduct, external, unknown }

/// A merchandising card. `/stories` and `/home-slides` return the same shape; only the placement
/// differs, so one model serves both.
class Promo {
  const Promo({
    required this.id,
    required this.title,
    required this.linkType,
    required this.sortOrder,
    this.isActive = true,
    this.subtitle,
    this.imageUrl,
    this.ctaLabel,
    this.badgeLabel,
    this.sponsorLabel,
    this.serviceId,
    this.galleryProductId,
    this.externalUrl,
    this.startsAt,
    this.endsAt,
  });

  final String id;
  final String title;
  final PromoLinkType linkType;
  final int sortOrder;
  final bool isActive;
  final String? subtitle;
  final String? imageUrl;
  final String? ctaLabel;
  final String? badgeLabel;

  /// Present when the placement was paid for. Disclosing it is not optional — an ad that does not
  /// announce itself as one is a dark pattern, and in several markets illegal.
  final String? sponsorLabel;

  final String? serviceId;
  final String? galleryProductId;
  final String? externalUrl;
  final DateTime? startsAt;
  final DateTime? endsAt;

  /// The schedule window is the client's job. `isActive` alone is not enough: a campaign that
  /// starts tomorrow is active and not yet live. Both are checked here rather than trusting the
  /// endpoint to have filtered, because the same rows are also written by the seller console.
  bool isLiveAt(DateTime now) {
    if (!isActive) return false;
    if (startsAt != null && now.isBefore(startsAt!)) return false;
    if (endsAt != null && now.isAfter(endsAt!)) return false;
    return true;
  }

  factory Promo.fromJson(Map<String, dynamic> json) => Promo(
    id: json['id'] as String,
    title: json['title'] as String? ?? '',
    linkType: _linkType(json['linkType']),
    sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
    isActive: json['isActive'] as bool? ?? true,
    subtitle: _nonEmpty(json['subtitle']),
    imageUrl: _nonEmpty(json['imageUrl']),
    ctaLabel: _nonEmpty(json['ctaLabel']),
    badgeLabel: _nonEmpty(json['badgeLabel']),
    sponsorLabel: _nonEmpty(json['sponsorLabel']),
    serviceId: _nonEmpty(json['serviceId']),
    galleryProductId: _nonEmpty(json['galleryProductId']),
    externalUrl: _nonEmpty(json['externalUrl']),
    startsAt: DateTime.tryParse(json['startsAt'] as String? ?? '')?.toLocal(),
    endsAt: DateTime.tryParse(json['endsAt'] as String? ?? '')?.toLocal(),
  );

  static PromoLinkType _linkType(Object? raw) => switch (raw) {
    'NONE' => PromoLinkType.none,
    'INTERNAL_SERVICE' => PromoLinkType.service,
    'INTERNAL_GALLERY_PRODUCT' => PromoLinkType.galleryProduct,
    'EXTERNAL_URL' => PromoLinkType.external,
    // A link type this build does not know about renders as a plain, non-tappable card
    // rather than disappearing — the editor's content still reaches the user.
    _ => PromoLinkType.unknown,
  };

  static String? _nonEmpty(Object? raw) {
    if (raw is! String) return null;
    final trimmed = raw.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
}

/// A link to one of the shop's social accounts.
///
/// Rendered on the profile screen and opened in the real app or browser -- never in a webview.
/// Instagram and TikTok both detect an embedded webview and refuse to sign anyone in, so an
/// in-app browser here would be a link that visibly fails.
class SocialLink {
  const SocialLink({
    required this.id,
    required this.platform,
    required this.url,
    required this.sortOrder,
    this.label,
  });

  final String id;

  /// `INSTAGRAM` | `TIKTOK` | `TELEGRAM` | ... Kept as a string so a platform added server-side
  /// still renders, with a generic icon.
  final String platform;

  final String url;
  final int sortOrder;
  final String? label;

  factory SocialLink.fromJson(Map<String, dynamic> json) => SocialLink(
    id: json['id'] as String,
    platform: json['platform'] as String? ?? '',
    url: json['url'] as String? ?? '',
    sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
    label: Promo._nonEmpty(json['label']),
  );

  /// True when there is actually somewhere to go. A social row with an empty URL is hidden
  /// rather than shown as a button that does nothing.
  bool get isUsable => url.startsWith('http://') || url.startsWith('https://');
}
