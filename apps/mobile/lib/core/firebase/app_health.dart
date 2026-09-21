import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_performance/firebase_performance.dart';
import 'package:flutter/foundation.dart';

/// Crash reports (Crashlytics) and speed measurements (Performance Monitoring).
///
/// Both are collected from release builds only: a developer's debug session is full of deliberate
/// errors that would drown the real ones. Never throws — a build without the Firebase config file
/// (CI, a contributor's machine) simply runs without reporting.
class AppHealth {
  static Future<void> initialize() async {
    try {
      await Firebase.initializeApp();
      const collect = kReleaseMode;
      await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(
        collect,
      );
      await FirebasePerformance.instance.setPerformanceCollectionEnabled(
        collect,
      );
      FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
      PlatformDispatcher.instance.onError = (error, stack) {
        FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
        return true;
      };
    } catch (error) {
      debugPrint('AppHealth unavailable: $error');
    }
  }

  /// Ties reports to an account id (never a phone or name) so a crash can be traced to who hit it.
  static Future<void> identify(String? userId) async {
    try {
      await FirebaseCrashlytics.instance.setUserIdentifier(userId ?? '');
    } catch (_) {}
  }
}
