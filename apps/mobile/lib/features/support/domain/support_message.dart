import '../../../core/format/dates.dart';

/// Who wrote a message. The backend's `SupportSenderRole` is `CUSTOMER | STAFF | SELLER`.
enum SupportSender { customer, staff, seller, unknown }

class SupportMessage {
  const SupportMessage({
    required this.id,
    required this.sender,
    required this.body,
    required this.createdAt,
  });

  final String id;
  final SupportSender sender;
  final String body;
  final DateTime? createdAt;

  bool get isMine => sender == SupportSender.customer;

  factory SupportMessage.fromJson(Map<String, dynamic> json) => SupportMessage(
    id: json['id'] as String,
    sender: switch (json['senderRole']) {
      'CUSTOMER' => SupportSender.customer,
      'STAFF' => SupportSender.staff,
      'SELLER' => SupportSender.seller,
      // A role this build has not been taught about is rendered as *not* the customer's, so
      // an unknown message can never be mistaken for something the user wrote themselves.
      _ => SupportSender.unknown,
    },
    body: json['body'] as String? ?? '',
    createdAt: Dates.tryParse(json['createdAt']),
  );

  @override
  bool operator ==(Object other) => other is SupportMessage && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

/// The conversation. One per customer, created on demand by the server.
class SupportThread {
  const SupportThread({required this.status, required this.messages});

  /// `OPEN` | `PENDING` | `CLOSED` — the server's `SupportThreadStatus`. Kept as a string so a
  /// new value cannot break the screen.
  final String status;

  final List<SupportMessage> messages;

  bool get isEmpty => messages.isEmpty;

  factory SupportThread.fromJson(Map<String, dynamic> json) {
    final thread = json['thread'] as Map<String, dynamic>?;
    final raw = json['messages'];

    return SupportThread(
      status: thread?['status'] as String? ?? 'OPEN',
      messages: raw is List
          ? raw
                .whereType<Map<String, dynamic>>()
                .map(SupportMessage.fromJson)
                .toList()
          : const [],
    );
  }
}
