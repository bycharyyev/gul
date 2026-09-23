import '../network/api_client.dart';

class PushRepository {
  PushRepository(this._api);

  final ApiClient _api;

  Future<void> register({required String token, required String platform}) =>
      _api.post<void>(
        '/notifications/devices',
        body: {'token': token, 'platform': platform},
      );

  /// The person tapped a push. Best effort: a statistics call must never get in the way.
  Future<void> markOpened(String deliveryId) => _api.post<void>(
    '/notifications/opened',
    body: {'deliveryId': deliveryId},
  );

  Future<void> remove(String token) =>
      _api.delete<void>('/notifications/devices/${Uri.encodeComponent(token)}');
}
