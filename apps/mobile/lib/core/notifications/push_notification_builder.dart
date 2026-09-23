import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// One Android notification channel per part of the product, so a person can silence the feed
/// without silencing their orders. The ids match the `category` the server sends.
class PushCategory {
  const PushCategory(this.id, this.name, this.description);

  final String id;
  final String name;
  final String description;

  String get channelId => 'gulyaly_$id';

  static const orders = PushCategory(
    'orders',
    'Заказы',
    'Статус заказов на пополнение',
  );
  static const gallery = PushCategory(
    'gallery',
    'Букеты',
    'Заказы и новости магазинов',
  );
  static const cargo = PushCategory('cargo', 'Карго', 'Статус доставки');
  static const support = PushCategory(
    'support',
    'Поддержка',
    'Ответы службы поддержки',
  );
  static const chat = PushCategory(
    'chat',
    'Чаты',
    'Сообщения, группы и каналы',
  );
  static const feed = PushCategory(
    'feed',
    'Лента',
    'Комментарии и отметки «нравится»',
  );

  static const all = [orders, gallery, cargo, support, chat, feed];

  static PushCategory byId(String? id) =>
      all.firstWhere((c) => c.id == id, orElse: () => orders);
}

/// Icon shown in the status bar: the Gulyaly mark as a white silhouette.
const _smallIcon = 'ic_stat_notification';
const _accent = ui.Color(0xFF6C47FF);
const _maxImageBytes = 2 * 1024 * 1024;
const _iconPixels = 192;

Future<void> createPushChannels(FlutterLocalNotificationsPlugin plugin) async {
  final android = plugin
      .resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin
      >();
  if (android == null) return;
  for (final c in PushCategory.all) {
    await android.createNotificationChannel(
      AndroidNotificationChannel(
        c.channelId,
        c.name,
        description: c.description,
        importance: Importance.high,
      ),
    );
  }
}

/// Draws a notification from an FCM data payload (`category`, `title`, `body`, `route`, and
/// optionally `imageUrl` and `tag`). The same function serves the foreground, the background
/// isolate and the terminated state, so a notification looks identical in all three.
///
/// The picture becomes the round large icon, like a contact photo in a messenger: a service logo
/// for a top-up order, a person's avatar for a chat message. If it cannot be fetched or decoded
/// the notification is still shown, with the app icon instead.
Future<void> showPushNotification(
  FlutterLocalNotificationsPlugin plugin,
  Map<String, dynamic> data,
) async {
  final title = data['title'] as String?;
  final body = data['body'] as String?;
  if (title == null && body == null) return;

  final category = PushCategory.byId(data['category'] as String?);
  final tag = data['tag'] as String?;
  final imageUrl = data['imageUrl'] as String?;

  final bytes = imageUrl == null ? null : await _fetchRoundIcon(imageUrl);
  final AndroidBitmap<Object> largeIcon = bytes != null
      ? ByteArrayAndroidBitmap(bytes)
      : const DrawableResourceAndroidBitmap('@mipmap/ic_launcher');

  final details = NotificationDetails(
    android: AndroidNotificationDetails(
      category.channelId,
      category.name,
      channelDescription: category.description,
      importance: Importance.high,
      priority: Priority.high,
      icon: _smallIcon,
      color: _accent,
      largeIcon: largeIcon,
      styleInformation: BigTextStyleInformation(body ?? ''),
      tag: tag,
      groupKey: 'gulyaly_${category.id}',
      category: category == PushCategory.chat
          ? AndroidNotificationCategory.message
          : null,
    ),
    iOS: const DarwinNotificationDetails(),
  );

  // Same tag, same id: a newer message in the same conversation or order replaces the previous
  // one instead of stacking a second notification.
  final id = tag != null
      ? tag.hashCode & 0x7fffffff
      : DateTime.now().millisecondsSinceEpoch & 0x7fffffff;
  await plugin.show(
    id: id,
    title: title,
    body: body,
    notificationDetails: details,
    payload: encodePushPayload(
      route: data['route'] as String?,
      deliveryId: data['deliveryId'] as String?,
    ),
  );
}

/// What a tap on a notification carries back into the app: where to go, and which push it was
/// (so the server can count it as opened).
String? encodePushPayload({String? route, String? deliveryId}) {
  if (route == null && deliveryId == null) return null;
  return jsonEncode({
    if (route != null) 'route': route,
    if (deliveryId != null) 'deliveryId': deliveryId,
  });
}

({String? route, String? deliveryId}) decodePushPayload(String? payload) {
  if (payload == null || payload.isEmpty) {
    return (route: null, deliveryId: null);
  }
  // Notifications drawn by an older build carry the bare route.
  if (!payload.startsWith('{')) return (route: payload, deliveryId: null);
  try {
    final map = jsonDecode(payload) as Map<String, dynamic>;
    return (
      route: map['route'] as String?,
      deliveryId: map['deliveryId'] as String?,
    );
  } catch (_) {
    return (route: null, deliveryId: null);
  }
}

Future<Uint8List?> _fetchRoundIcon(String url) async {
  try {
    final raw = await _download(url);
    if (raw == null) return null;
    return await _circularCrop(raw);
  } catch (error) {
    developer.log(
      'Notification picture skipped: ${error.runtimeType}',
      name: 'push',
    );
    return null;
  }
}

Future<Uint8List?> _download(String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https') return null;
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 6);
  try {
    final request = await client
        .getUrl(uri)
        .timeout(const Duration(seconds: 6));
    final response = await request.close().timeout(const Duration(seconds: 8));
    if (response.statusCode != 200) return null;
    if (response.contentLength > _maxImageBytes) return null;
    final buffer = BytesBuilder(copy: false);
    await for (final chunk in response.timeout(const Duration(seconds: 8))) {
      buffer.add(chunk);
      if (buffer.length > _maxImageBytes) return null;
    }
    return buffer.takeBytes();
  } finally {
    client.close(force: true);
  }
}

/// Centre-crops to a square and masks it to a circle.
Future<Uint8List?> _circularCrop(Uint8List bytes) async {
  final codec = await ui.instantiateImageCodec(bytes, targetWidth: 384);
  final frame = await codec.getNextFrame();
  final source = frame.image;
  final side = source.width < source.height ? source.width : source.height;
  final src = ui.Rect.fromLTWH(
    (source.width - side) / 2,
    (source.height - side) / 2,
    side.toDouble(),
    side.toDouble(),
  );
  final dst = ui.Rect.fromLTWH(
    0,
    0,
    _iconPixels.toDouble(),
    _iconPixels.toDouble(),
  );

  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder)..clipPath(ui.Path()..addOval(dst));
  canvas.drawImageRect(
    source,
    src,
    dst,
    ui.Paint()..filterQuality = ui.FilterQuality.medium,
  );
  final rounded = await recorder.endRecording().toImage(
    _iconPixels,
    _iconPixels,
  );
  final png = await rounded.toByteData(format: ui.ImageByteFormat.png);
  return png?.buffer.asUint8List();
}
