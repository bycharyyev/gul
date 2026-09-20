import 'dart:async';
import 'dart:developer' as developer;
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'push_repository.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class PushService {
  PushService({
    required PushRepository repository,
    required void Function(String route) onRoute,
  }) : _repository = repository,
       _onRoute = onRoute;

  static const _channel = AndroidNotificationChannel(
    'gulyaly_general',
    'Gulyaly notifications',
    description: 'Orders, messages and account notifications',
    importance: Importance.high,
  );

  final PushRepository _repository;
  final void Function(String route) _onRoute;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  StreamSubscription<String>? _refreshSubscription;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  String? _registeredToken;
  bool _ready = false;

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
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    await _local.initialize(
      settings: const InitializationSettings(android: android, iOS: ios),
      onDidReceiveNotificationResponse: (response) {
        final route = response.payload;
        if (route != null) _openRoute(route);
      },
    );
    await _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(_channel);

    final messaging = FirebaseMessaging.instance;
    _refreshSubscription = messaging.onTokenRefresh.listen(_register);
    _foregroundSubscription = FirebaseMessaging.onMessage.listen(
      _showForeground,
    );
    _openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen(
      _openMessage,
    );
    final initial = await messaging.getInitialMessage();
    if (initial != null) _openMessage(initial);
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
    } catch (error) {
      developer.log('Push sync failed: ${error.runtimeType}', name: 'push');
    }
  }

  Future<void> unregister() async {
    final token = _registeredToken;
    _registeredToken = null;
    if (token == null) return;
    try {
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
    final notification = message.notification;
    if (notification == null) return;
    await _local.show(
      id: message.hashCode,
      title: notification.title,
      body: notification.body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'gulyaly_general',
          'Gulyaly notifications',
          channelDescription: 'Orders, messages and account notifications',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: message.data['route'],
    );
  }

  void _openMessage(RemoteMessage message) {
    final route = message.data['route'];
    if (route != null) _openRoute(route);
  }

  void _openRoute(String route) {
    if (route.startsWith('/') && !route.startsWith('//')) _onRoute(route);
  }

  Future<void> dispose() async {
    await _refreshSubscription?.cancel();
    await _foregroundSubscription?.cancel();
    await _openedSubscription?.cancel();
  }
}
