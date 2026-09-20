import type { MulticastMessage } from "firebase-admin/messaging";

/**
 * One notification channel per part of the product. The app creates a matching Android channel
 * for each, so a person can silence the feed without silencing their orders.
 */
export const PUSH_CATEGORIES = ["orders", "gallery", "cargo", "support", "chat", "feed"] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export interface PushMessage {
  category: PushCategory;
  title: string;
  body: string;
  /** In-app route opened on tap, e.g. `/home/orders/detail/<id>`. Must start with a single `/`. */
  route: string;
  /** Absolute https URL of the picture shown as the round icon (service logo, avatar, product). */
  imageUrl?: string;
  /** Notifications sharing a tag replace each other instead of piling up (one per conversation). */
  tag?: string;
  /** Extra string values delivered with the message. */
  data?: Record<string, string>;
}

/**
 * Builds the FCM payload. Android receives a data-only message on purpose: with a `notification`
 * block the system draws the notification itself whenever the app is not in the foreground, and
 * that cannot show a round contact-style picture. Data-only hands the message to the app, which
 * draws it (see push_service.dart). iOS has no such handler, so it gets a normal alert with
 * `mutable-content` so a notification service extension can attach the picture.
 */
export function toFcmMessage(message: PushMessage): Omit<MulticastMessage, "tokens"> {
  const data: Record<string, string> = {
    ...(message.data ?? {}),
    category: message.category,
    title: message.title,
    body: message.body,
    route: message.route,
  };
  if (message.imageUrl) data.imageUrl = message.imageUrl;
  if (message.tag) data.tag = message.tag;

  return {
    data,
    android: { priority: "high", ttl: 24 * 60 * 60 * 1000 },
    apns: {
      headers: { "apns-priority": "10" },
      payload: {
        aps: {
          alert: { title: message.title, body: message.body },
          sound: "default",
          mutableContent: true,
          threadId: message.tag ?? message.category,
        },
      },
      ...(message.imageUrl ? { fcmOptions: { imageUrl: message.imageUrl } } : {}),
    },
  };
}
