import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_exception.dart';
import '../data/auth_repository.dart';
import '../domain/user.dart';

/// Where the session is in its lifecycle.
///
/// `unknown` exists so the router can hold on a splash instead of flashing the login screen
/// while the stored token is being checked — that flash is the classic mobile auth bug.
/// `unreachable` is not a flavour of `unauthenticated`. It means the app holds credentials it
/// could not verify because nothing answered — the session may well be perfectly good. Keeping it
/// separate is what stops a lost signal from turning into a login form.
enum AuthStatus { unknown, authenticated, unauthenticated, unreachable }

class AuthState {
  const AuthState({
    this.status = AuthStatus.unknown,
    this.user,
    this.busy = false,
    this.error,
  });

  final AuthStatus status;
  final User? user;

  /// A request is in flight. Submit buttons read this to disable themselves, which is what stops
  /// a double-tap from registering twice.
  final bool busy;

  final AppException? error;

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    bool? busy,
    AppException? error,
    bool clearError = false,
    bool clearUser = false,
  }) => AuthState(
    status: status ?? this.status,
    user: clearUser ? null : (user ?? this.user),
    busy: busy ?? this.busy,
    error: clearError ? null : (error ?? this.error),
  );

  @override
  bool operator ==(Object other) =>
      other is AuthState &&
      other.status == status &&
      other.user == user &&
      other.busy == busy &&
      other.error == error;

  @override
  int get hashCode => Object.hash(status, user, busy, error);
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repository) : super(const AuthState());

  final AuthRepository _repository;

  /// Called once at startup, before the first frame decides where to route.
  Future<void> restore() async {
    state = state.copyWith(status: AuthStatus.unknown, clearError: true);
    final result = await _repository.restoreSession();
    state = state.copyWith(
      status: switch (result) {
        (user: _?, reachable: _) => AuthStatus.authenticated,
        (user: null, reachable: true) => AuthStatus.unauthenticated,
        (user: null, reachable: false) => AuthStatus.unreachable,
      },
      user: result.user,
      clearUser: result.user == null,
    );
  }

  Future<bool> login({required String phone, required String password}) =>
      _run(() => _repository.login(phone: phone, password: password));

  Future<bool> register({
    required String phone,
    required String password,
    String? fullName,
    String? referredByUsername,
    String? locale,
  }) => _run(
    () => _repository.register(
      phone: phone,
      password: password,
      fullName: fullName,
      referredByUsername: referredByUsername,
      locale: locale,
    ),
  );

  /// Signing out always succeeds from the user's point of view. If clearing the keystore fails
  /// the app still drops the session — leaving someone stuck on a screen they asked to leave is
  /// worse than a stale entry the next write overwrites.
  Future<void> logout() async {
    try {
      await _repository.logout();
    } catch (_) {
      // Intentionally swallowed; see above.
    }
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Ends every session on every device. Local credentials go regardless of whether the server
  /// call succeeded — see [logout].
  Future<void> logoutEverywhere() async {
    try {
      await _repository.logoutEverywhere();
    } catch (_) {
      // Intentionally swallowed.
    }
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Replaces the cached user after a profile edit.
  ///
  /// The profile screens own the write calls — auth does not need to know about names, locales or
  /// avatars — but the user object lives here, so they hand the result back rather than each
  /// screen keeping its own copy that drifts.
  void applyUser(User user) {
    state = state.copyWith(user: user, status: AuthStatus.authenticated);
  }

  /// Called by the network layer when a refresh fails — the session ended without the user
  /// asking, so drop straight to unauthenticated and let the router move.
  void onSessionExpired() {
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void clearError() => state = state.copyWith(clearError: true);

  /// Guards every credential submission: refuses to start a second while one is in flight, so a
  /// double-tap cannot create two accounts or two sessions.
  Future<bool> _run(Future<User> Function() action) async {
    if (state.busy) return false;
    state = state.copyWith(busy: true, clearError: true);
    try {
      final user = await action();
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: user,
        busy: false,
      );
      return true;
    } on AppException catch (e) {
      state = state.copyWith(busy: false, error: e);
      return false;
    }
  }
}
