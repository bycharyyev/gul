/// The state of the account's email address.
///
/// An email is optional on this backend — registration is by phone and never collects one. It
/// matters because it is the only channel order confirmations go out on, and the only key
/// password recovery accepts.
class EmailStatus {
  const EmailStatus({
    required this.email,
    required this.isVerified,
    required this.pendingEmail,
  });

  final String? email;
  final bool isVerified;

  /// An address that has been submitted but whose 6-digit code has not been entered yet.
  final String? pendingEmail;

  bool get isMissing => email == null || email!.isEmpty;

  factory EmailStatus.fromJson(Map<String, dynamic> json) => EmailStatus(
    email: _nonEmpty(json['email']),
    isVerified: json['emailVerified'] as bool? ?? false,
    pendingEmail: _nonEmpty(json['pendingEmail']),
  );

  static const unknown = EmailStatus(
    email: null,
    isVerified: false,
    pendingEmail: null,
  );

  static String? _nonEmpty(Object? raw) {
    if (raw is! String) return null;
    final trimmed = raw.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
}

/// The referral picture: the user's own code, their balance, and how many people used it.
class ReferralSummary {
  const ReferralSummary({
    required this.username,
    required this.canChangeUsername,
    required this.totalReferred,
    required this.rewarded,
    required this.pending,
    this.balanceTmt,
  });

  /// Doubles as the referral code — there is no separate code field on this backend.
  final String username;

  /// False for sellers, whose handle is fixed.
  final bool canChangeUsername;

  final int totalReferred;
  final int rewarded;
  final int pending;

  /// Null for sellers: their rewards land in the payout balance instead.
  final double? balanceTmt;

  factory ReferralSummary.fromJson(Map<String, dynamic> json) {
    final stats = json['stats'] as Map<String, dynamic>? ?? const {};
    final balance = json['referralBalanceTmt'];
    return ReferralSummary(
      username: json['username'] as String? ?? '',
      canChangeUsername: json['canChangeUsername'] as bool? ?? false,
      totalReferred: (stats['totalReferred'] as num?)?.toInt() ?? 0,
      rewarded: (stats['rewarded'] as num?)?.toInt() ?? 0,
      pending: (stats['pending'] as num?)?.toInt() ?? 0,
      balanceTmt: balance is num ? balance.toDouble() : null,
    );
  }
}

/// Everything the profile screen renders in one value.
class ProfileOverview {
  const ProfileOverview({required this.email, required this.referral});

  final EmailStatus email;

  /// Null when the referral call failed — the rest of the screen still renders.
  final ReferralSummary? referral;
}
