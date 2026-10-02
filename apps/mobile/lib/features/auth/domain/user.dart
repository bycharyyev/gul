/// The authenticated user, exactly as `/auth/me` and the login response return them.
///
/// Hand-written rather than generated: this is one small model, and a build_runner step for it
/// would cost more than it saves. Generation earns its keep once there are dozens.
class User {
  const User({
    required this.id,
    required this.username,
    required this.role,
    required this.locale,
    this.email,
    this.phone,
    this.fullName,
    this.avatarUrl,
    this.country,
    this.phoneBonusAt,
    this.phoneBonusTmt,
  });

  final String id;

  /// The sign-in address (since 2026-10-02 accounts are created and signed into by email). Null
  /// only on an old phone-only account.
  final String? email;

  /// Optional: added later in the profile, and earns the one-off phone bonus.
  final String? phone;
  final String username;

  /// CUSTOMER | SELLER | SUPPORT | MANAGER | ADMIN. Kept as a string on purpose: the client must
  /// not break when the backend adds a role, and it decides nothing security-relevant anyway —
  /// authorization is enforced server-side.
  final String role;

  /// `ru` | `en` | `tkm`. Note `tkm`, not the ISO `tk` — the API rejects anything else.
  final String locale;

  final String? fullName;
  final String? avatarUrl;

  /// ISO 3166-1 alpha-2. Guessed from the phone number when one is first added, and editable in
  /// the profile. Null until then.
  final String? country;

  /// When the bonus for adding a phone was credited; null while it is not earned yet.
  final String? phoneBonusAt;

  /// Size of that bonus in TMT, sent by the server so the app never hard-codes it. Only present on
  /// `/auth/me` and profile updates.
  final num? phoneBonusTmt;

  /// The username doubles as the user's referral code.
  String get referralCode => username;

  /// What to show under the name: the address people sign in with, else the number.
  String get contactLabel => email ?? phone ?? '';

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'] as String,
    email: json['email'] as String?,
    phone: json['phone'] as String?,
    username: json['username'] as String,
    role: json['role'] as String? ?? 'CUSTOMER',
    locale: json['locale'] as String? ?? 'ru',
    fullName: json['fullName'] as String?,
    avatarUrl: json['avatarUrl'] as String?,
    country: json['country'] as String?,
    phoneBonusAt: json['phoneBonusAt'] as String?,
    phoneBonusTmt: json['phoneBonusTmt'] as num?,
  );

  User copyWith({
    String? fullName,
    String? locale,
    String? avatarUrl,
    String? country,
  }) => User(
    id: id,
    email: email,
    phone: phone,
    username: username,
    role: role,
    locale: locale ?? this.locale,
    fullName: fullName ?? this.fullName,
    avatarUrl: avatarUrl ?? this.avatarUrl,
    country: country ?? this.country,
    phoneBonusAt: phoneBonusAt,
    phoneBonusTmt: phoneBonusTmt,
  );

  @override
  bool operator ==(Object other) =>
      other is User &&
      other.id == id &&
      other.email == email &&
      other.phone == phone &&
      other.username == username &&
      other.role == role &&
      other.locale == locale &&
      other.fullName == fullName &&
      other.avatarUrl == avatarUrl &&
      other.country == country &&
      other.phoneBonusAt == phoneBonusAt &&
      other.phoneBonusTmt == phoneBonusTmt;

  @override
  int get hashCode => Object.hash(
    id,
    email,
    phone,
    username,
    role,
    locale,
    fullName,
    avatarUrl,
    country,
    phoneBonusAt,
    phoneBonusTmt,
  );
}
