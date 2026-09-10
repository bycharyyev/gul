import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'marketplace_models.dart';

/// The basket a customer fills before there is an order to put it in.
///
/// Lives above both screens on purpose: adding starts on the Cargo screen, where the link field
/// is, and finishes on the checkout screen. Holding the list inside either one would mean the
/// items vanished on the way between them.
class MarketplaceCart extends StateNotifier<List<MarketplaceCartItem>> {
  MarketplaceCart() : super(const []);

  /// The same product added twice increases its quantity instead of appearing as a second line.
  /// `canonicalUrl` is what makes that work: the server has already stripped tracking parameters,
  /// so two shares of one product are the same string here.
  void add(
    MarketplaceLinkPreview preview, {
    int quantity = 1,
    String? variant,
  }) {
    final index = state.indexWhere(
      (item) =>
          item.preview.canonicalUrl == preview.canonicalUrl &&
          (item.variant ?? '') == (variant ?? ''),
    );
    if (index == -1) {
      state = [
        ...state,
        MarketplaceCartItem(
          preview: preview,
          quantity: quantity,
          variant: variant,
        ),
      ];
      return;
    }
    final existing = state[index];
    state = [
      ...state.sublist(0, index),
      existing.copyWith(quantity: (existing.quantity + quantity).clamp(1, 99)),
      ...state.sublist(index + 1),
    ];
  }

  void setQuantity(int index, int quantity) {
    if (index < 0 || index >= state.length) return;
    state = [
      ...state.sublist(0, index),
      state[index].copyWith(quantity: quantity.clamp(1, 99)),
      ...state.sublist(index + 1),
    ];
  }

  void removeAt(int index) {
    if (index < 0 || index >= state.length) return;
    state = [...state.sublist(0, index), ...state.sublist(index + 1)];
  }

  void clear() => state = const [];
}

final marketplaceCartProvider =
    StateNotifierProvider<MarketplaceCart, List<MarketplaceCartItem>>(
      (ref) => MarketplaceCart(),
    );
