import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Settings the team can change from the Firebase console without shipping a new APK.
///
///  * `min_app_version`      older builds see a blocking "update the app" screen ("" = off)
///  * `update_url`           where that screen sends people
///  * `maintenance_message`  a banner shown to everyone while it is non-empty
@immutable
class RemoteAppConfig {
  const RemoteAppConfig({
    this.minVersion = '',
    this.updateUrl = '',
    this.maintenanceMessage = '',
  });

  final String minVersion;
  final String updateUrl;
  final String maintenanceMessage;

  @override
  bool operator ==(Object other) =>
      other is RemoteAppConfig &&
      other.minVersion == minVersion &&
      other.updateUrl == updateUrl &&
      other.maintenanceMessage == maintenanceMessage;

  @override
  int get hashCode => Object.hash(minVersion, updateUrl, maintenanceMessage);
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

class RemoteAppConfigService {
  RemoteAppConfigService._();
  static final instance = RemoteAppConfigService._();

  final ValueNotifier<RemoteAppConfig> config = ValueNotifier(
    const RemoteAppConfig(),
  );
  String currentVersion = '';

  bool get updateRequired =>
      isVersionBelow(currentVersion, config.value.minVersion);

  /// Never throws; the app keeps its defaults (nothing blocked, no banner) when it cannot reach
  /// Firebase. Fetching is throttled to once an hour by Firebase, which also keeps it inside the
  /// free quota.
  Future<void> initialize() async {
    try {
      currentVersion = (await PackageInfo.fromPlatform()).version;
      await Firebase.initializeApp();
      final remote = FirebaseRemoteConfig.instance;
      await remote.setConfigSettings(
        RemoteConfigSettings(
          fetchTimeout: const Duration(seconds: 8),
          minimumFetchInterval: const Duration(hours: 1),
        ),
      );
      await remote.setDefaults(const {
        'min_app_version': '',
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
      updateUrl: remote.getString('update_url').trim(),
      maintenanceMessage: remote.getString('maintenance_message').trim(),
    );
  }
}
