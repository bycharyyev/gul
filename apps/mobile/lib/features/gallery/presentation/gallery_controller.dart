import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_exception.dart';
import '../../orders/domain/order.dart';
import '../data/gallery_repository.dart';

class GalleryOrderState {
  const GalleryOrderState({this.busy = false, this.error});

  final bool busy;
  final AppException? error;

  @override
  bool operator ==(Object other) =>
      other is GalleryOrderState && other.busy == busy && other.error == error;

  @override
  int get hashCode => Object.hash(busy, error);
}

class GalleryOrderController extends StateNotifier<GalleryOrderState> {
  GalleryOrderController(this._repository) : super(const GalleryOrderState());

  final GalleryRepository _repository;

  /// Returns the created order, or null on failure. Refuses to start while one is in flight — a
  /// double-tap here would send two bouquets to the same address and bill for both.
  Future<OrderSummary?> submit({
    required String productId,
    required String recipientName,
    required String recipientPhone,
    required String deliveryCity,
    required String deliveryAddress,
    String? cardMessage,
  }) async {
    if (state.busy) return null;
    state = const GalleryOrderState(busy: true);

    try {
      final order = await _repository.createOrder(
        productId: productId,
        recipientName: recipientName,
        recipientPhone: recipientPhone,
        deliveryCity: deliveryCity,
        deliveryAddress: deliveryAddress,
        cardMessage: cardMessage,
      );
      state = const GalleryOrderState();
      return order;
    } on AppException catch (e) {
      state = GalleryOrderState(error: e);
      return null;
    }
  }
}
