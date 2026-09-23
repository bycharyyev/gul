import '../../../core/format/money.dart';

/// A catalogue item — one operator or digital good that can be topped up.
///
/// Field shapes verified against production `GET /catalog/services`: the `Decimal` bounds arrive
/// as **strings** (`"minAmountTmt":"5"`), and `description`, `logoUrl` and `validationRegex` are
/// all nullable *and* sometimes empty strings.
class CatalogService {
  const CatalogService({
    required this.id,
    required this.code,
    required this.name,
    required this.inputType,
    required this.minAmountTmt,
    required this.maxAmountTmt,
    required this.sortOrder,
    this.description,
    this.logoUrl,
    this.validationRegex,
  });

  final String id;
  final String code;
  final String name;

  /// `PHONE` or `ACCOUNT_ID` — decides the keyboard and the label on the top-up form (Phase 3).
  final String inputType;

  final double minAmountTmt;
  final double maxAmountTmt;
  final int sortOrder;
  final String? description;
  final String? logoUrl;

  /// Server-supplied validation for `recipientIdentifier`. Applied as given rather than
  /// hardcoding a phone format per operator, because the server enforces this exact pattern and
  /// the two must not drift.
  final String? validationRegex;

  factory CatalogService.fromJson(Map<String, dynamic> json) => CatalogService(
    id: json['id'] as String,
    code: json['code'] as String? ?? '',
    name: json['name'] as String? ?? '',
    inputType: json['inputType'] as String? ?? 'PHONE',
    minAmountTmt: Money.parse(json['minAmountTmt']),
    maxAmountTmt: Money.parse(json['maxAmountTmt']),
    sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
    description: _nonEmpty(json['description']),
    logoUrl: _nonEmpty(json['logoUrl']),
    validationRegex: _nonEmpty(json['validationRegex']),
  );

  /// The admin console writes `""` where it means "unset" — an empty `validationRegex` would
  /// otherwise compile to a pattern that matches everything, and an empty `logoUrl` would send
  /// the image loader after a blank URL.
  static String? _nonEmpty(Object? raw) {
    if (raw is! String) return null;
    final trimmed = raw.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  @override
  bool operator ==(Object other) => other is CatalogService && other.id == id;

  @override
  int get hashCode => id.hashCode;
}
