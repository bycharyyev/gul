/// The authenticated user, exactly as `/auth/me` and the login response return them.
///
/// Hand-written rather than generated: this is one small model, and a build_runner step for it
/// would cost more than it saves. Generation earns its keep once there are dozens.
class User {
  const User({
    required this.id,
    required this.phone,
    required this.username,
    required this.role,
    required this.locale,
    this.fullName,
    this.avatarUrl,
  });

  final String id;
  final String phone;
  final String username;

  /// CUSTOMER | SELLER | SUPPORT | MANAGER | ADMIN. Kept as a string on purpose: the client must
  /// not break when the backend adds a role, and it decides nothing security-relevant anyway —
  /// authorization is enforced server-side.
  final String role;

  /// `ru` | `en` | `tkm`. Note `tkm`, not the ISO `tk` — the API rejects anything else.
  final String locale;

  final String? fullName;
  final String? avatarUrl;

  /// The username doubles as the user's referral code.
  String get referralCode => username;

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'] as String,
    phone: json['phone'] as String,
    username: json['username'] as String,
    role: json['role'] as String? ?? 'CUSTOMER',
    locale: json['locale'] as String? ?? 'ru',
    fullName: json['fullName'] as String?,
    avatarUrl: json['avatarUrl'] as String?,
  );

  User copyWith({String? fullName, String? locale, String? avatarUrl}) => User(
    id: id,
    phone: phone,
    username: username,
    role: role,
    locale: locale ?? this.locale,
    fullName: fullName ?? this.fullName,
    avatarUrl: avatarUrl ?? this.avatarUrl,
  );

  @override
  bool operator ==(Object other) =>
      other is User &&
      other.id == id &&
      other.phone == phone &&
      other.username == username &&
      other.role == role &&
      other.locale == locale &&
      other.fullName == fullName &&
      other.avatarUrl == avatarUrl;

  @override
  int get hashCode =>
      Object.hash(id, phone, username, role, locale, fullName, avatarUrl);
}
