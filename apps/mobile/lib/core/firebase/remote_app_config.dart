import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Settings the team can change from the Firebase console without shipping a new APK.
///
/// Three levels of "please update", from gentle to urgent:
///
///  1. `latest_app_version`  older builds get a dismissible "new version available" card.
///  2. `min_app_version` + `update_deadline` (ISO date-time)
///                           builds below the minimum get a "required by DATE" card that can be
///                           closed until the deadline, and a blocking screen after it.
///  3. `min_app_version` alone
///                           builds below the minimum are blocked at once (a security fix).
///
/// Nothing here ever touches the API: an old build keeps working against the server, it is only
/// asked (or, at level 2/3, required) to update.
///
///  * `update_url`           where the update button leads (https)
///  * `maintenance_message`  a notice shown to everyone while it is non-empty
@immutable
class RemoteAppConfig {
  const RemoteAppConfig({
    this.minVersion = '',
    this.latestVersion = '',
    this.updateDeadline = '',
    this.updateUrl = '',
    this.maintenanceMessage = '',
  });

  final String minVersion;
  final String latestVersion;
  final String updateDeadline;
  final String updateUrl;
  final String maintenanceMessage;

  @override
  bool operator ==(Object other) =>
      other is RemoteAppConfig &&
      other.minVersion == minVersion &&
      other.latestVersion == latestVersion &&
      other.updateDeadline == updateDeadline &&
      other.updateUrl == updateUrl &&
      other.maintenanceMessage == maintenanceMessage;

  @override
  int get hashCode => Object.hash(
    minVersion,
    latestVersion,
    updateDeadline,
    updateUrl,
    maintenanceMessage,
  );
}

/// True when [current] (e.g. `1.0.6`) is older than [minimum]. An empty or unreadable minimum
/// never blocks anyone: a typo in the console must not lock every user out.
bool isVersionBelow(String current, String minimum) {
  List<int>? parse(String v) {
    final parts = v.trim().split('+').first.split('.');
    if (parts.isEmpty || parts.length > 4) return null;
    final numbers = <int>[];
    for (final part in parts) {
      final n = int.tryParse(part);
      if (n == null || n < 0) return null;
      numbers.add(n);
    }
    return numbers;
  }

  final have = parse(current);
  final need = parse(minimum);
  if (have == null || need == null) return false;
  final length = have.length > need.length ? have.length : need.length;
  for (var i = 0; i < length; i++) {
    final a = i < have.length ? have[i] : 0;
    final b = i < need.length ? need[i] : 0;
    if (a != b) return a < b;
  }
  return false;
}

enum UpdateLevel { none, recommended, requiredSoon, required }

/// What this build should be told about updating. Pure, so every combination is testable.
UpdateLevel evaluateUpdate({
  required String current,
  required RemoteAppConfig config,
  required DateTime now,
}) {
  if (isVersionBelow(current, config.minVersion)) {
    final deadline = DateTime.tryParse(config.updateDeadline);
    // No deadline, or an unreadable one, means "now": a security fix must never wait on a typo.
    if (deadline != null && now.isBefore(deadline)) {
      return UpdateLevel.requiredSoon;
    }
    return UpdateLevel.required;
  }
  if (isVersionBelow(current, config.latestVersion)) {
    return UpdateLevel.recommended;
  }
  return UpdateLevel.none;
}

class RemoteAppConfigService {
  RemoteAppConfigService._();
  static final instance = RemoteAppConfigService._();

  final ValueNotifier<RemoteAppConfig> config = ValueNotifier(
    const RemoteAppConfig(),
  );
  String currentVersion = '';

  /// Bumped when a deadline passes, so a "required by DATE" card turns into the blocking screen
  /// even if the app stays open across it.
  final ValueNotifier<int> clock = ValueNotifier(0);
  Timer? _deadlineTimer;

  UpdateLevel get updateLevel => evaluateUpdate(
    current: currentVersion,
    config: config.value,
    now: DateTime.now(),
  );

  /// Never throws; the app keeps its defaults (nothing blocked, no banner) when it cannot reach
  /// Firebase. Fetching is throttled to once every 3 hours, which also keeps it inside the
  /// free quota.
  Future<void> initialize() async {
    try {
      currentVersion = (await PackageInfo.fromPlatform()).version;
      await Firebase.initializeApp();
      final remote = FirebaseRemoteConfig.instance;
      await remote.setConfigSettings(
        RemoteConfigSettings(
          fetchTimeout: const Duration(seconds: 8),
          minimumFetchInterval: const Duration(hours: 3),
        ),
      );
      await remote.setDefaults(const {
        'min_app_version': '',
        'latest_app_version': '',
        'update_deadline': '',
        'update_url': '',
        'maintenance_message': '',
      });
      _apply(remote);
      await remote.fetchAndActivate();
      _apply(remote);
      remote.onConfigUpdated.listen((_) async {
        await remote.activate();
        _apply(remote);
      });
    } catch (error) {
      debugPrint('Remote config unavailable: $error');
    }
  }

  void _apply(FirebaseRemoteConfig remote) {
    config.value = RemoteAppConfig(
      minVersion: remote.getString('min_app_version').trim(),
      latestVersion: remote.getString('latest_app_version').trim(),
      updateDeadline: remote.getString('update_deadline').trim(),
      updateUrl: remote.getString('update_url').trim(),
      maintenanceMessage: remote.getString('maintenance_message').trim(),
    );
    _scheduleDeadline();
  }

  void _scheduleDeadline() {
    _deadlineTimer?.cancel();
    final deadline = DateTime.tryParse(config.value.updateDeadline);
    if (deadline == null) return;
    final wait = deadline.difference(DateTime.now());
    if (wait.isNegative) return;
    _deadlineTimer = Timer(wait, () => clock.value++);
  }
}
