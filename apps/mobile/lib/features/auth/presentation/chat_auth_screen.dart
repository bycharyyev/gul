import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/strings.dart';
import '../../../core/theme/app_theme.dart';
import 'login_screen.dart';
import 'register_screen.dart';

/// Which question the conversation opens with.
enum ChatAuthStart { login, register }

enum _Step {
  loginEmail,
  loginPassword,
  forgotCode,
  forgotPassword,
  regName,
  regEmail,
  regPassword,
  regReferral,
  regCode,
  busy,
  done,
}

class _Msg {
  _Msg(this.id, this.fromMe, this.text, {this.tone});
  final int id;
  final bool fromMe;
  final String text;

  /// null, 'error' or 'success'.
  final String? tone;
}

class _Chip {
  const _Chip(this.label, this.run);
  final String label;
  final VoidCallback run;
}

/// Sign-in, sign-up and password reset as one conversation, mirroring apps/web's AuthChat.
///
/// It drives the same calls as the classic screens (AuthController for login and registration,
/// AuthRepository for the reset), so the router guard still does the navigating: once the status
/// flips to authenticated this screen is replaced, exactly as with the forms. The classic forms
/// stay reachable from the header, because password managers fill a plain form most reliably.
class ChatAuthScreen extends ConsumerStatefulWidget {
  const ChatAuthScreen({super.key, required this.start});

  static const loginPath = '/login';
  static const registerPath = '/register';

  final ChatAuthStart start;

  @override
  ConsumerState<ChatAuthScreen> createState() => _ChatAuthScreenState();
}

class _ChatAuthScreenState extends ConsumerState<ChatAuthScreen> {
  static final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
  static const _mask = '••••••••';

  final _messages = <_Msg>[];
  final _input = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  var _chips = <_Chip>[];
  var _step = _Step.busy;
  var _typing = false;
  var _reveal = false;
  String? _inputError;
  var _nextId = 1;

  /// Bumped on restart so a reply still "typing" from the previous conversation is dropped.
  var _session = 0;

  String _email = '';
  String _password = '';
  String _name = '';
  String _referral = '';
  String _code = '';

  Strings get _s => Strings.of(context);
  String _t(String key, [Map<String, String> vars = const {}]) {
    var text = _s.get(key);
    vars.forEach((k, v) => text = text.replaceAll('{$k}', v));
    return text;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _restart());
  }

  @override
  void dispose() {
    _session++;
    _input.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  bool get _accepting => _step != _Step.busy && _step != _Step.done;

  void _push(bool fromMe, String text, {String? tone}) {
    // An answer leaves the input as soon as it is in the conversation -- a password must not
    // linger in the field while the request runs.
    if (fromMe) _input.clear();
    setState(() => _messages.add(_Msg(_nextId++, fromMe, text, tone: tone)));
    _scrollDown();
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      final reduce = MediaQuery.of(context).disableAnimations;
      final target = _scroll.position.maxScrollExtent;
      if (reduce) {
        _scroll.jumpTo(target);
      } else {
        _scroll.animateTo(
          target,
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
        );
      }
    });
  }

  /// Bot lines, each after a short typing pause. False when the conversation was restarted or the
  /// screen left meanwhile -- callers stop there.
  Future<bool> _say(List<String> lines, {String? tone}) async {
    final mine = _session;
    final pause = MediaQuery.of(context).disableAnimations
        ? Duration.zero
        : const Duration(milliseconds: 420);
    for (var i = 0; i < lines.length; i++) {
      if (!mounted || _session != mine) return false;
      setState(() => _typing = true);
      _scrollDown();
      await Future<void>.delayed(pause);
      if (!mounted || _session != mine) return false;
      setState(() => _typing = false);
      // Only the first line carries the tone: "error, then the question" reads naturally.
      _push(false, lines[i], tone: i == 0 ? tone : null);
    }
    return mounted && _session == mine;
  }

  void _ask(_Step step, [List<_Chip> chips = const []]) {
    if (!mounted) return;
    setState(() {
      _input.clear();
      _inputError = null;
      _reveal = false;
      _chips = chips;
      _step = step;
    });
    if (_accepting) _focus.requestFocus();
    _scrollDown();
  }

  void _choose(String label, VoidCallback then) {
    setState(() => _chips = []);
    _push(true, label);
    then();
  }

  _Chip _chip(String key, VoidCallback then) =>
      _Chip(_t(key), () => _choose(_t(key), then));

  void _setBusy() => setState(() {
    _step = _Step.busy;
    _chips = [];
  });

  // ---- flows ----

  Future<void> _restart() async {
    _session++;
    ref.read(authControllerProvider.notifier).clearError();
    setState(() {
      _messages.clear();
      _chips = [];
      _typing = false;
      _step = _Step.busy;
      _email = _password = _name = _referral = _code = '';
    });
    if (!await _say([_t('authChat.hello')])) return;
    if (widget.start == ChatAuthStart.login) {
      await _beginLogin();
    } else {
      await _beginRegister();
    }
  }

  Future<void> _beginLogin() async {
    _setBusy();
    if (await _say([_t('authChat.login.askEmail')])) _ask(_Step.loginEmail);
  }

  Future<void> _askPassword() async {
    _setBusy();
    if (await _say([_t('authChat.login.askPassword')])) {
      _ask(_Step.loginPassword, [_chip('authChat.chipForgot', _beginForgot)]);
    }
  }

  Future<void> _beginRegister() async {
    _setBusy();
    if (await _say([_t('authChat.register.askName')])) {
      _ask(_Step.regName, [_chip('authChat.chipSkip', () => _afterName(''))]);
    }
  }

  Future<void> _afterName(String name) async {
    _name = name;
    _setBusy();
    final lines = [
      if (name.isNotEmpty) _t('authChat.register.nice', {'name': name}),
      _t('authChat.register.askEmail'),
    ];
    if (await _say(lines)) _ask(_Step.regEmail);
  }

  Future<void> _reaskRegEmail() async {
    _setBusy();
    if (await _say([_t('authChat.register.askEmail')])) _ask(_Step.regEmail);
  }

  Future<void> _askReferral() async {
    _setBusy();
    if (await _say([_t('authChat.register.askReferral')])) {
      _ask(_Step.regReferral, [
        _chip('authChat.chipNoCode', () {
          _referral = '';
          _startRegistration();
        }),
      ]);
    }
  }

  List<_Chip> _codeChips() => [
    _chip('authChat.chipResend', _startRegistration),
    _chip('authChat.chipOtherEmail', _reaskRegEmail),
  ];

  Future<void> _startRegistration() async {
    _setBusy();
    setState(() => _typing = true);
    final controller = ref.read(authControllerProvider.notifier);
    final started = await controller.startRegistration(
      email: _email,
      password: _password,
      fullName: _name,
      referredByUsername: _referral,
      // `tkm`, not the ISO `tk` -- the API rejects `tk`.
      locale: _s.locale,
    );
    if (!mounted) return;
    setState(() => _typing = false);
    if (started != null) {
      final ok = await _say([
        _t('authChat.register.sent', {
          'email': started.email,
          'minutes': '${started.expiresInMinutes}',
        }),
        _t('authChat.register.askCode'),
      ]);
      if (ok) _ask(_Step.regCode, _codeChips());
      return;
    }
    final error = ref.read(authControllerProvider).error;
    controller.clearError();
    if (error?.statusCode == 409) {
      if (await _say([_t('authChat.register.emailTaken')], tone: 'error')) {
        _ask(_Step.busy, [
          _chip('authChat.chipLoginInstead', _askPassword),
          _chip('authChat.chipOtherEmail', _reaskRegEmail),
        ]);
      }
      return;
    }
    if (await _say([_errorText(error)], tone: 'error')) await _reaskRegEmail();
  }

  Future<void> _confirmRegistration() async {
    _setBusy();
    setState(() => _typing = true);
    final controller = ref.read(authControllerProvider.notifier);
    final ok = await controller.confirmRegistration(email: _email, code: _code);
    if (!mounted) return;
    setState(() => _typing = false);
    // On success the router guard replaces this screen; nothing more to say here.
    if (ok) return;
    final error = ref.read(authControllerProvider).error;
    controller.clearError();
    if (await _say([_errorText(error)], tone: 'error')) {
      _ask(_Step.regCode, _codeChips());
    }
  }

  Future<void> _login() async {
    _setBusy();
    setState(() => _typing = true);
    final controller = ref.read(authControllerProvider.notifier);
    final ok = await controller.login(email: _email, password: _password);
    if (!mounted) return;
    setState(() => _typing = false);
    if (ok) return;
    final error = ref.read(authControllerProvider).error;
    controller.clearError();
    if (await _say([
      _errorText(error),
      _t('authChat.login.retry'),
    ], tone: 'error')) {
      _ask(_Step.busy, [
        _chip('authChat.chipPasswordAgain', _askPassword),
        _chip('authChat.chipForgot', _beginForgot),
        _chip('authChat.chipOtherEmail', _beginLogin),
        _chip('authChat.chipCreate', _beginRegister),
      ]);
    }
  }

  Future<void> _beginForgot() async {
    _setBusy();
    setState(() => _typing = true);
    try {
      final minutes = await ref
          .read(authRepositoryProvider)
          .requestPasswordReset(_email);
      if (!mounted) return;
      setState(() => _typing = false);
      if (await _say([
        _t('authChat.forgot.sent', {'minutes': '$minutes'}),
        _t('authChat.forgot.askCode'),
      ])) {
        _ask(_Step.forgotCode);
      }
    } on AppException catch (e) {
      if (!mounted) return;
      setState(() => _typing = false);
      if (await _say([_errorText(e)], tone: 'error')) {
        _ask(_Step.busy, [_chip('authChat.chipForgot', _beginForgot)]);
      }
    }
  }

  Future<void> _resetPassword() async {
    _setBusy();
    setState(() => _typing = true);
    try {
      await ref
          .read(authRepositoryProvider)
          .confirmPasswordReset(
            email: _email,
            code: _code,
            newPassword: _password,
          );
      if (!mounted) return;
      setState(() => _typing = false);
      if (await _say([_t('authChat.forgot.done')])) await _login();
    } on AppException catch (e) {
      if (!mounted) return;
      setState(() => _typing = false);
      if (await _say([
        _errorText(e),
        _t('authChat.forgot.askCode'),
      ], tone: 'error')) {
        _ask(_Step.forgotCode);
      }
    }
  }

  String _errorText(AppException? e) =>
      e == null ? _t('authChat.err.generic') : _s.error(e);

  // ---- input ----

  void _submit() {
    if (!_accepting) return;
    final raw = _input.text;
    final v = raw.trim();
    void fail(String key) => setState(() => _inputError = _t(key));

    switch (_step) {
      case _Step.loginEmail:
      case _Step.regEmail:
        final email = v.toLowerCase();
        if (!_emailRe.hasMatch(email)) return fail('authChat.err.email');
        _email = email;
        final wasLogin = _step == _Step.loginEmail;
        _push(true, email);
        if (wasLogin) {
          _askPassword();
        } else {
          _setBusy();
          _say([_t('authChat.register.askPassword')]).then((ok) {
            if (ok) _ask(_Step.regPassword);
          });
        }
      case _Step.loginPassword:
        if (raw.isEmpty) return fail('authChat.err.passwordEmpty');
        _password = raw;
        _push(true, _mask);
        _login();
      case _Step.regPassword:
      case _Step.forgotPassword:
        if (raw.length < 8 || raw.length > 72) {
          return fail('authChat.err.password');
        }
        _password = raw;
        final wasReg = _step == _Step.regPassword;
        _push(true, _mask);
        if (wasReg) {
          _askReferral();
        } else {
          _resetPassword();
        }
      case _Step.regName:
        if (v.length > 120) return fail('authChat.err.name');
        _push(true, v.isEmpty ? _t('authChat.chipSkip') : v);
        _afterName(v);
      case _Step.regReferral:
        if (v.length < 2 || v.length > 32) return fail('authChat.err.referral');
        _referral = v;
        _push(true, v);
        _startRegistration();
      case _Step.regCode:
      case _Step.forgotCode:
        if (!RegExp(r'^\d{6}$').hasMatch(v)) return fail('authChat.err.code');
        _code = v;
        final wasReg = _step == _Step.regCode;
        _push(true, v);
        if (wasReg) {
          _confirmRegistration();
        } else {
          _setBusy();
          _say([_t('authChat.forgot.askPassword')]).then((ok) {
            if (ok) _ask(_Step.forgotPassword);
          });
        }
      case _Step.busy:
      case _Step.done:
        return;
    }
  }

  // ---- view ----

  bool get _isPassword =>
      _step == _Step.loginPassword ||
      _step == _Step.regPassword ||
      _step == _Step.forgotPassword;
  bool get _isCode => _step == _Step.regCode || _step == _Step.forgotCode;
  bool get _isEmail => _step == _Step.loginEmail || _step == _Step.regEmail;

  String get _placeholder {
    if (!_accepting) return _t('authChat.ph.chips');
    if (_isPassword) return _t('authChat.ph.password');
    if (_isCode) return _t('authChat.ph.code');
    if (_isEmail) return _t('authChat.ph.email');
    if (_step == _Step.regName) return _t('authChat.ph.name');
    return _t('authChat.ph.referral');
  }

  Iterable<String>? get _autofill {
    if (_isEmail) return const [AutofillHints.email];
    if (_step == _Step.loginPassword) return const [AutofillHints.password];
    if (_isPassword) return const [AutofillHints.newPassword];
    if (_isCode) return const [AutofillHints.oneTimeCode];
    if (_step == _Step.regName) return const [AutofillHints.name];
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: _CrystalBackground(
        dark: dark,
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                child: _CrystalPanel(
                  dark: dark,
                  child: Column(
                    children: [
                      _header(dark, scheme),
                      Expanded(child: _feed(dark, scheme)),
                      _composer(dark, scheme),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header(bool dark, ColorScheme scheme) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: dark
                ? Colors.white.withValues(alpha: 0.08)
                : AppTheme.brand.withValues(alpha: 0.10),
          ),
        ),
      ),
      child: Row(
        children: [
          const _Gem(size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _t('authChat.name'),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        color: AppTheme.accent,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _typing ? _t('authChat.typing') : _t('authChat.online'),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.accent,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: _t('authChat.restart'),
            onPressed: _restart,
            icon: const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            tooltip: _t('authChat.classic'),
            onPressed: () => context.go(
              widget.start == ChatAuthStart.login
                  ? LoginScreen.path
                  : RegisterScreen.path,
            ),
            icon: const Icon(Icons.edit_note_rounded),
          ),
        ],
      ),
    );
  }

  Widget _feed(bool dark, ColorScheme scheme) {
    final reduce = MediaQuery.of(context).disableAnimations;
    return ListView(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 8),
      children: [
        for (final m in _messages)
          _Appear(
            key: ValueKey(m.id),
            enabled: !reduce,
            child: _Bubble(message: m, dark: dark),
          ),
        if (_typing)
          _Appear(
            enabled: !reduce,
            child: Align(
              alignment: Alignment.centerLeft,
              child: _BotShell(
                dark: dark,
                child: _TypingDots(animate: !reduce),
              ),
            ),
          ),
        if (_chips.isNotEmpty && !_typing)
          _Appear(
            enabled: !reduce,
            child: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final c in _chips)
                    OutlinedButton(
                      onPressed: c.run,
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(48, 44),
                        shape: const StadiumBorder(),
                        side: BorderSide(
                          color: AppTheme.brandLight.withValues(
                            alpha: dark ? 0.45 : 0.55,
                          ),
                        ),
                        foregroundColor: dark
                            ? AppTheme.brandLight
                            : AppTheme.brandDark,
                        backgroundColor: dark
                            ? Colors.white.withValues(alpha: 0.04)
                            : Colors.white,
                        textStyle: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                      child: Text(c.label),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _composer(bool dark, ColorScheme scheme) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: dark
                ? Colors.white.withValues(alpha: 0.08)
                : AppTheme.brand.withValues(alpha: 0.10),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_inputError != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: Text(
                _inputError!,
                style: TextStyle(color: scheme.error, fontSize: 13),
              ),
            ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  focusNode: _focus,
                  enabled: _accepting,
                  obscureText: _isPassword && !_reveal,
                  keyboardType: _isCode
                      ? TextInputType.number
                      : _isEmail
                      ? TextInputType.emailAddress
                      : TextInputType.text,
                  autocorrect: false,
                  enableSuggestions: !_isPassword && !_isEmail,
                  textCapitalization: _step == _Step.regName
                      ? TextCapitalization.words
                      : TextCapitalization.none,
                  autofillHints: _autofill,
                  inputFormatters: _isCode
                      ? [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(6),
                        ]
                      : null,
                  textInputAction: TextInputAction.send,
                  onChanged: (_) {
                    if (_inputError != null) {
                      setState(() => _inputError = null);
                    }
                  },
                  onSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    hintText: _placeholder,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 14,
                    ),
                    border: const OutlineInputBorder(
                      borderRadius: BorderRadius.all(Radius.circular(28)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: const BorderRadius.all(Radius.circular(28)),
                      borderSide: BorderSide(
                        color: AppTheme.brand.withValues(alpha: 0.18),
                      ),
                    ),
                    disabledBorder: OutlineInputBorder(
                      borderRadius: const BorderRadius.all(Radius.circular(28)),
                      borderSide: BorderSide(
                        color: AppTheme.brand.withValues(alpha: 0.08),
                      ),
                    ),
                    suffixIcon: _isPassword
                        ? IconButton(
                            tooltip: _reveal
                                ? _t('authChat.hidePassword')
                                : _t('authChat.showPassword'),
                            onPressed: () => setState(() => _reveal = !_reveal),
                            icon: Icon(
                              _reveal
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined,
                            ),
                          )
                        : null,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Semantics(
                button: true,
                label: _t('authChat.send'),
                child: Opacity(
                  opacity: _accepting ? 1 : 0.4,
                  child: Material(
                    shape: const CircleBorder(),
                    clipBehavior: Clip.antiAlias,
                    child: Ink(
                      decoration: const BoxDecoration(
                        gradient: _gemGradient,
                        shape: BoxShape.circle,
                      ),
                      child: InkWell(
                        onTap: _accepting ? _submit : null,
                        child: const SizedBox(
                          width: 50,
                          height: 50,
                          child: Icon(
                            Icons.send_rounded,
                            color: Colors.white,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ---- crystal look ----

const _gemGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [AppTheme.brandLight, AppTheme.brandDark, AppTheme.accent],
  stops: [0, 0.55, 1],
);

/// The page: the app's ambient wash plus a few static, translucent "facets". Painted once; no
/// blur and no animation, per the performance rule in AppTheme.
class _CrystalBackground extends StatelessWidget {
  const _CrystalBackground({required this.dark, required this.child});
  final bool dark;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: dark
              ? const [Color(0xFF12102A), AppTheme.canvasDark]
              : const [Color(0xFFF2F1FF), AppTheme.canvasLight],
        ),
      ),
      child: CustomPaint(
        painter: _FacetPainter(dark: dark),
        child: child,
      ),
    );
  }
}

class _FacetPainter extends CustomPainter {
  _FacetPainter({required this.dark});
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final a = dark ? 0.16 : 0.12;
    void facet(List<Offset> pts, Color color) {
      final path = Path()..addPolygon(pts, true);
      canvas.drawPath(path, Paint()..color = color);
    }

    facet([
      Offset(0, h * 0.05),
      Offset(w * 0.55, 0),
      Offset(w * 0.2, h * 0.32),
    ], AppTheme.washViolet.withValues(alpha: a));
    facet([
      Offset(w, h * 0.12),
      Offset(w, h * 0.48),
      Offset(w * 0.62, h * 0.30),
    ], AppTheme.washTeal.withValues(alpha: a * 0.9));
    facet([
      Offset(w * 0.1, h),
      Offset(w * 0.75, h),
      Offset(w * 0.45, h * 0.72),
    ], AppTheme.washRose.withValues(alpha: a * 0.6));
  }

  @override
  bool shouldRepaint(_FacetPainter old) => old.dark != dark;
}

/// The chat pane: near-opaque glass with an iridescent 1px edge.
class _CrystalPanel extends StatelessWidget {
  const _CrystalPanel({required this.dark, required this.child});
  final bool dark;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: dark
              ? [
                  AppTheme.brandDark,
                  Colors.white.withValues(alpha: 0.18),
                  const Color(0xFF0D9488),
                ]
              : [AppTheme.brandLight, Colors.white, AppTheme.washTeal],
        ),
        boxShadow: AppTheme.softShadow(
          dark ? Brightness.dark : Brightness.light,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(1),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(27),
          child: ColoredBox(
            color: dark ? const Color(0xFF16142A) : const Color(0xFFFCFBFF),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// A cut gem: rotated square, violet-to-teal, two light facets across the top.
class _Gem extends StatelessWidget {
  const _Gem({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Transform.rotate(
        angle: 0.785398,
        child: Container(
          margin: EdgeInsets.all(size * 0.12),
          decoration: BoxDecoration(
            gradient: _gemGradient,
            borderRadius: BorderRadius.circular(size * 0.22),
          ),
          foregroundDecoration: BoxDecoration(
            borderRadius: BorderRadius.circular(size * 0.22),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.white.withValues(alpha: 0.55),
                Colors.white.withValues(alpha: 0),
              ],
              stops: const [0, 0.45],
            ),
          ),
          child: Transform.rotate(
            angle: -0.785398,
            child: const Center(
              child: Text(
                'G',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BotShell extends StatelessWidget {
  const _BotShell({required this.dark, required this.child, this.tone});
  final bool dark;
  final Widget child;
  final String? tone;

  @override
  Widget build(BuildContext context) {
    const radius = BorderRadius.only(
      topLeft: Radius.circular(20),
      topRight: Radius.circular(20),
      bottomRight: Radius.circular(20),
      bottomLeft: Radius.circular(6),
    );
    if (tone == 'error') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: radius,
          color: dark ? const Color(0xFF2A1520) : const Color(0xFFFFF1F3),
          border: Border.all(
            color: const Color(0xFFE11D48).withValues(alpha: 0.25),
          ),
        ),
        child: child,
      );
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: radius,
        gradient: LinearGradient(
          colors: [
            AppTheme.brandLight.withValues(alpha: 0.5),
            AppTheme.washTeal.withValues(alpha: 0.4),
          ],
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(1),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(19),
              topRight: Radius.circular(19),
              bottomRight: Radius.circular(19),
              bottomLeft: Radius.circular(5),
            ),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: dark
                  ? const [Color(0xFF221F3D), Color(0xFF1A1830)]
                  : const [Colors.white, Color(0xFFF4F2FF)],
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.dark});
  final _Msg message;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final maxWidth = MediaQuery.sizeOf(context).width * 0.78;
    const textStyle = TextStyle(fontSize: 15, height: 1.35);

    if (message.fromMe) {
      return Align(
        alignment: Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          constraints: BoxConstraints(maxWidth: maxWidth),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: const BoxDecoration(
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(20),
              topRight: Radius.circular(20),
              bottomLeft: Radius.circular(20),
              bottomRight: Radius.circular(6),
            ),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFF7B5CFF),
                AppTheme.brandDark,
                Color(0xFF4A22C9),
              ],
            ),
          ),
          child: Text(
            message.text,
            style: textStyle.copyWith(color: Colors.white),
          ),
        ),
      );
    }

    final color = switch (message.tone) {
      'error' => dark ? const Color(0xFFFDA4AF) : const Color(0xFFBE123C),
      'success' => dark ? const Color(0xFF2DD4BF) : const Color(0xFF0D9488),
      _ => dark ? Colors.white : const Color(0xFF1E1B2E),
    };
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: _BotShell(
            dark: dark,
            tone: message.tone,
            child: Text(message.text, style: textStyle.copyWith(color: color)),
          ),
        ),
      ),
    );
  }
}

/// Short rise-and-fade for each new message; off under "remove animations".
class _Appear extends StatelessWidget {
  const _Appear({super.key, required this.enabled, required this.child});
  final bool enabled;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!enabled) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      builder: (_, t, c) => Opacity(
        opacity: t,
        child: Transform.translate(offset: Offset(0, 8 * (1 - t)), child: c),
      ),
      child: child,
    );
  }
}

class _TypingDots extends StatefulWidget {
  const _TypingDots({required this.animate});
  final bool animate;

  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void initState() {
    super.initState();
    if (widget.animate) unawaited(_c.repeat());
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 14,
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, __) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < 3; i++)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Opacity(
                  opacity: widget.animate
                      ? 0.3 + 0.7 * _pulse((_c.value - i * 0.15) % 1)
                      : 0.6,
                  child: Container(
                    width: 6,
                    height: 6,
                    decoration: const BoxDecoration(
                      color: AppTheme.brandLight,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  double _pulse(double t) =>
      t < 0.4 ? t / 0.4 : (t < 0.8 ? (0.8 - t) / 0.4 : 0);
}
