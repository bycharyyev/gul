import 'dart:async';

import 'package:flutter/services.dart';

/// Text handed to the app by the system share sheet.
///
/// Android side lives in MainActivity.kt; see its comment for why the two channels exist. The
/// method channel answers once with whatever share started the app, the event channel carries
/// every share that arrives while it is already running.
class SharedTextChannel {
  const SharedTextChannel({
    MethodChannel method = const MethodChannel('pro.gulyaly/share'),
    EventChannel events = const EventChannel('pro.gulyaly/share/events'),
  }) : _method = method,
       _events = events;

  final MethodChannel _method;
  final EventChannel _events;

  /// The share that launched the app, if any. Answers null on every platform but Android, and on
  /// a launch that was not a share.
  Future<String?> takePending() async {
    try {
      return await _method.invokeMethod<String>('takePending');
    } on MissingPluginException {
      // iOS has no share extension yet, and the widget tests run without a host platform.
      return null;
    } on PlatformException {
      return null;
    }
  }

  Stream<String> get stream =>
      _events.receiveBroadcastStream().map((event) => event as String);
}

/// The first http(s) address inside shared text.
///
/// Nobody shares a bare URL. Ozon's share button produces the product title, a newline, then the
/// link; other apps append their own promotional tail. Taking the first address and ignoring the
/// prose around it is what makes the share usable without asking the customer to edit anything.
///
/// Returns null when there is no address at all, which is the signal to leave the share alone
/// rather than open a buying form over someone's copied paragraph.
String? firstUrlIn(String text) {
  final match = RegExp(r'https?://[^\s<>"]+').firstMatch(text);
  if (match == null) return null;
  // Trailing punctuation belongs to the sentence, not to the address: "…5188439881/)." must not
  // become part of the URL the server is asked to canonicalise.
  final trimmed = match.group(0)!.replaceAll(RegExp(r'[),.\]}»]+$'), '');
  final uri = Uri.tryParse(trimmed);
  if (uri == null || !uri.hasAuthority) return null;
  // Which marketplaces are supported is the server's call, not ours -- it already answers with a
  // clear message for a host it does not know. Deciding here would put the same policy in two
  // places and let them drift.
  return trimmed;
}

/// The group-invite code inside one of our own links, or null for anything else.
///
/// A share sheet cannot tell the app what a link means, and the two kinds we accept lead to
/// opposite places: a marketplace address opens a buying form, an invite opens a group. Deciding
/// here, on the host and the path, is what keeps somebody's group invitation out of the cargo
/// calculator.
///
/// The host must match the configured site exactly. A path shaped like `/i/<code>` on somebody
/// else's domain is somebody else's page.
String? groupInviteCodeIn(String url, String siteBaseUrl) {
  final link = Uri.tryParse(url);
  final site = Uri.tryParse(siteBaseUrl);
  if (link == null || site == null || link.host.isEmpty) return null;
  if (link.host.toLowerCase() != site.host.toLowerCase()) return null;
  final segments = link.pathSegments.where((s) => s.isNotEmpty).toList();
  if (segments.length != 2 || segments.first != 'i') return null;
  final code = segments[1].trim();
  return code.isEmpty ? null : code;
}
