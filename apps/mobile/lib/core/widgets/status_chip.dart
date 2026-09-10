import 'package:flutter/material.dart';

import '../l10n/strings.dart';

/// How an order status is presented: an icon, a word, and a colour — in that order of importance.
///
/// Colour is never the only carrier of meaning. Roughly one man in twelve cannot separate the
/// red from the green here, and a status pill is exactly where that matters.
enum StatusTone { pending, active, success, danger, neutral }

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status, this.dense = false});

  /// The raw backend value — `PENDING_PAYMENT`, `DELIVERED`, and so on. Unrecognised values are
  /// rendered rather than swallowed: a status the app has not been taught about must still show
  /// the user *something*, and it must not crash the list.
  final String status;

  final bool dense;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    final spec = statusSpec(status);
    final color = _color(spec.tone, scheme);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: dense ? 8 : 10,
        vertical: dense ? 4 : 6,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(spec.icon, size: dense ? 13 : 15, color: color),
          const SizedBox(width: 5),
          // Flexible: at the largest system text size a status word like "Ждёт оплаты" is wider
          // than the row it sits in, and an overflowing pill is how a status becomes unreadable
          // for exactly the person who enlarged the text to read it.
          Flexible(
            child: Text(
              strings.get('status.${status.toLowerCase()}', fallback: status),
              style: TextStyle(
                color: color,
                fontSize: dense ? 11.5 : 12.5,
                fontWeight: FontWeight.w600,
                height: 1.2,
              ),
            ),
          ),
        ],
      ),
    );
  }

  static Color _color(StatusTone tone, ColorScheme scheme) => switch (tone) {
    StatusTone.pending => const Color(
      0xFFB45309,
    ), // amber-700, readable on both grounds
    StatusTone.active => scheme.primary,
    StatusTone.success => const Color(0xFF0D9488), // accent-600
    StatusTone.danger => scheme.error,
    StatusTone.neutral => scheme.onSurfaceVariant,
  };
}

class StatusSpec {
  const StatusSpec(this.tone, this.icon);
  final StatusTone tone;
  final IconData icon;
}

/// Covers `OrderStatus` (top-ups), `GalleryOrderStatus` (gifts), and `ShipmentStatus` (cargo) --
/// they overlap on several values (`PENDING_PAYMENT`, `PAID`, `CANCELLED`), which is exactly why
/// this one function serves all three rather than each screen carrying its own copy.
StatusSpec statusSpec(String status) => switch (status.toUpperCase()) {
  'PENDING_PAYMENT' => const StatusSpec(
    StatusTone.pending,
    Icons.schedule_rounded,
  ),
  'PAID' => const StatusSpec(StatusTone.active, Icons.payments_outlined),
  'PROCESSING' => const StatusSpec(StatusTone.active, Icons.sync_rounded),
  'COMPLETED' => const StatusSpec(
    StatusTone.success,
    Icons.check_circle_outline_rounded,
  ),
  'DELIVERED' => const StatusSpec(
    StatusTone.success,
    Icons.local_shipping_outlined,
  ),
  'FAILED' => const StatusSpec(StatusTone.danger, Icons.error_outline_rounded),
  'CANCELLED' => const StatusSpec(StatusTone.neutral, Icons.cancel_outlined),
  'REFUNDED' => const StatusSpec(StatusTone.neutral, Icons.undo_rounded),
  // ---- Cargo-only statuses ----
  'DRAFT' => const StatusSpec(StatusTone.neutral, Icons.edit_note_rounded),
  'QUOTE_CREATED' => const StatusSpec(
    StatusTone.neutral,
    Icons.calculate_outlined,
  ),
  'PICKUP_REQUESTED' => const StatusSpec(
    StatusTone.pending,
    Icons.local_shipping_outlined,
  ),
  'PICKUP_CONFIRMED' => const StatusSpec(
    StatusTone.pending,
    Icons.event_available_outlined,
  ),
  'PICKED_UP' => const StatusSpec(
    StatusTone.active,
    Icons.inventory_2_outlined,
  ),
  'IN_TRANSIT' => const StatusSpec(
    StatusTone.active,
    Icons.local_shipping_rounded,
  ),
  'ARRIVED_DESTINATION' => const StatusSpec(
    StatusTone.active,
    Icons.flag_outlined,
  ),
  'READY_FOR_PICKUP' => const StatusSpec(
    StatusTone.success,
    Icons.storefront_outlined,
  ),
  'OUT_FOR_DELIVERY' => const StatusSpec(
    StatusTone.success,
    Icons.moped_outlined,
  ),
  'ON_HOLD' => const StatusSpec(
    StatusTone.pending,
    Icons.pause_circle_outline_rounded,
  ),
  'EXCEPTION' => const StatusSpec(
    StatusTone.danger,
    Icons.warning_amber_rounded,
  ),
  _ => const StatusSpec(StatusTone.neutral, Icons.help_outline_rounded),
};
