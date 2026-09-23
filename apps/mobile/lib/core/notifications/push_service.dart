import 'dart:async';
import 'dart:developer' as developer;
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'push_notification_builder.dart';
import 'push_repository.dart';

const _androidIcon = AndroidInitializationSettings('ic_stat_notification');

/// Runs in a background isolate when a data message arrives while the app is not in the
/// foreground (backgrounded or terminated). It has to set up everything itself, because none of
/// the main isolate's state exists here.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // A message that still carries a `notification` block was already drawn by the system.
  if (message.notification != null) return;
  final plugin = FlutterLocalNotificationsPlugin();
  await plugin.initialize(
    settings: const InitializationSettings(
      android: _androidIcon,
      iOS: DarwinInitializationSettings(),
    ),
  );
  await createPushChannels(plugin);
  await showPushNotification(plugin, message.data);
}

class PushService {
  PushService({
    required PushRepository repository,
    required void Function(String route) onRoute,
  }) : _repository = repository,
       _onRoute = onRoute;

  final PushRepository _repository;
  final void Function(String route) _onRoute;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  StreamSubscription<String>? _refreshSubscription;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  String? _registeredToken;
  bool _ready = false;
  bool _signedIn = false;

  /// Taps that happened before the session was restored (a cold start from a notification) are
  /// reported once the person is signed in, when the request can be authenticated.
  final List<String> _pendingOpened = [];

  /// Never throws: a build without the Firebase config files (CI, a contributor's machine) or a
  /// device without Google services must still start the app, just without push.
  Future<void> initialize() async {
    try {
      await _initialize();
    } catch (error) {
      _ready = false;
      developer.log('Push is unavailable: ${error.runtimeType}', name: 'push');
    }
  }

  Future<void> _initialize() async {
    await Firebase.initializeApp();

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await _local.initialize(
      settings: const InitializationSettings(
        android: _androidIcon,
        iOS: DarwinInitializationSettings(),
      ),
      onDidReceiveNotificationResponse: (response) =>
          _handleTap(decodePushPayload(response.payload)),
    );
    await createPushChannels(_local);

    final messaging = FirebaseMessaging.instance;
    // iOS draws the banner itself, also while the app is open; Android is drawn by us.
    await messaging.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );
    _refreshSubscription = messaging.onTokenRefresh.listen(_register);
    _foregroundSubscription = FirebaseMessaging.onMessage.listen(
      _showForeground,
    );
    _openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen(
      _openMessage,
    );

    // Terminated state: the app was started by tapping a notification.
    final initial = await messaging.getInitialMessage();
    if (initial != null) _openMessage(initial);
    final launch = await _local.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp == true) {
      _handleTap(decodePushPayload(launch?.notificationResponse?.payload));
    }
    _ready = true;
  }

  /// Called once a person is signed in. The permission prompt lives here rather than at launch so
  /// it appears after the person has seen what the app is, and never for someone who only browses.
  Future<void> syncForAuthenticatedUser() async {
    if (!_ready) return;
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;
      final token = await messaging.getToken();
      if (token != null) await _register(token);
      _signedIn = true;
      _flushPendingOpened();
    } catch (error) {
      developer.log('Push sync failed: ${error.runtimeType}', name: 'push');
    }
  }

  /// Detaches this device from the account that is signing out, so the next person to use the
  /// phone never receives the previous person's notifications. After an app restart the token is
  /// not remembered in memory, so it is read back from Firebase instead of being skipped.
  Future<void> unregister() async {
    _signedIn = false;
    if (!_ready) return;
    try {
      final token =
          _registeredToken ?? await FirebaseMessaging.instance.getToken();
      _registeredToken = null;
      if (token == null) return;
      await _repository.remove(token);
    } catch (_) {
      developer.log('Could not unregister push token', name: 'push');
    }
  }

  Future<void> _register(String token) async {
    try {
      await _repository.register(
        token: token,
        platform: Platform.isIOS ? 'IOS' : 'ANDROID',
      );
      _registeredToken = token;
    } catch (_) {
      developer.log('Could not register push token', name: 'push');
    }
  }

  Future<void> _showForeground(RemoteMessage message) async {
    // iOS already presented the banner (see the presentation options above).
    if (Platform.isIOS) return;
    try {
      final notification = message.notification;
      if (notification != null && message.data['title'] == null) {
        // A plain notification message (sent from the Firebase console, for instance).
        await showPushNotification(_local, {
          ...message.data,
          'title': notification.title,
          'body': notification.body,
        });
        return;
      }
      await showPushNotification(_local, message.data);
    } catch (error) {
      developer.log(
        'Foreground notification failed: ${error.runtimeType}',
        name: 'push',
      );
    }
  }

  void _openMessage(RemoteMessage message) => _handleTap((
    route: message.data['route'] as String?,
    deliveryId: message.data['deliveryId'] as String?,
  ));

  /// Opens the screen and, separately, tells the server the push was tapped. The two are
  /// independent: a failed report never delays or blocks the navigation.
  void _handleTap(({String? route, String? deliveryId}) tap) {
    final deliveryId = tap.deliveryId;
    if (deliveryId != null) {
      if (_signedIn) {
        _reportOpened(deliveryId);
      } else {
        _pendingOpened.add(deliveryId);
      }
    }
    final route = tap.route;
    if (route != null) _openRoute(route);
  }

  void _reportOpened(String deliveryId) {
    unawaited(
      _repository.markOpened(deliveryId).catchError((Object _) {
        developer.log('Could not report an opened push', name: 'push');
      }),
    );
  }

  void _flushPendingOpened() {
    final pending = List<String>.of(_pendingOpened);
    _pendingOpened.clear();
    pending.forEach(_reportOpened);
  }

  /// Only paths inside the app: the value arrives from the network, so a link to somewhere else
  /// must never be followed.
  void _openRoute(String route) {
    if (route.startsWith('/') && !route.startsWith('//')) _onRoute(route);
  }

  Future<void> dispose() async {
    await _refreshSubscription?.cancel();
    await _foregroundSubscription?.cancel();
    await _openedSubscription?.cancel();
  }
}
