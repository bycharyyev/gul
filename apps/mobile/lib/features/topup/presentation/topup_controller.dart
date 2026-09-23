import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_exception.dart';
import '../data/topup_repository.dart';

class TopupSubmitState {
  const TopupSubmitState({this.busy = false, this.error});

  final bool busy;
  final AppException? error;

  @override
  bool operator ==(Object other) =>
      other is TopupSubmitState && other.busy == busy && other.error == error;

  @override
  int get hashCode => Object.hash(busy, error);
}

/// Owns only the submission — the form's own fields live in the screen's controllers, so there is
/// one copy of the typed text rather than two that can drift.
class TopupController extends StateNotifier<TopupSubmitState> {
  TopupController(this._repository) : super(const TopupSubmitState());

  final TopupRepository _repository;

  /// Returns the created order, or null if it failed. Refuses to start while a request is in
  /// flight: a double-tap here would create two orders and charge for two top-ups.
  Future<TopupSubmission?> submit({
    required String serviceId,
    required String serviceName,
    required String paymentMethodId,
    required String recipientIdentifier,
    required double amountTmt,
    required String currency,
  }) async {
    if (state.busy) return null;
    state = const TopupSubmitState(busy: true);

    try {
      final submission = await _repository.createOrder(
        serviceId: serviceId,
        serviceName: serviceName,
        paymentMethodId: paymentMethodId,
        recipientIdentifier: recipientIdentifier,
        amountTmt: amountTmt,
        currency: currency,
      );
      state = const TopupSubmitState();
      return submission;
    } on AppException catch (e) {
      state = TopupSubmitState(error: e);
      return null;
    }
  }

  void clearError() => state = TopupSubmitState(busy: state.busy);
}
