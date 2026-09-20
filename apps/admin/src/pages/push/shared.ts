import { ApiError } from "@topup-hub/api-client";
import type { PushCampaignStatus, PushCategory, PushContentInput } from "@topup-hub/types";

export const CATEGORY_LABELS: Record<PushCategory, string> = {
  orders: "Заказы",
  gallery: "Букеты",
  cargo: "Карго",
  support: "Поддержка",
  chat: "Чаты",
  feed: "Лента",
};

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
  value: value as PushCategory,
  label,
}));

export const STATUS_LABELS: Record<PushCampaignStatus, { label: string; className: string }> = {
  DRAFT: { label: "Черновик", className: "bg-slate-100 text-slate-600" },
  SCHEDULED: { label: "Запланирована", className: "bg-sky-100 text-sky-700" },
  SENDING: { label: "Отправляется", className: "bg-amber-100 text-amber-700" },
  SENT: { label: "Отправлена", className: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "Отменена", className: "bg-slate-200 text-slate-600" },
  FAILED: { label: "Ошибка", className: "bg-rose-100 text-rose-700" },
};

/** Screens of the mobile app a push can open. Only paths the app's router actually has. */
export const ROUTE_OPTIONS = [
  { value: "/home", label: "Главная" },
  { value: "/home/orders", label: "Мои заказы" },
  { value: "/gallery", label: "Букеты (галерея)" },
  { value: "/feed", label: "Лента" },
  { value: "/chats", label: "Чаты" },
  { value: "/home/cargo", label: "Карго" },
  { value: "/profile", label: "Профиль" },
];

export const LOCALE_OPTIONS = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "tkm", label: "Türkmen" },
];

export const ROLE_OPTIONS = [
  { value: "CUSTOMER", label: "Покупатели" },
  { value: "SELLER", label: "Продавцы" },
  { value: "SUPPORT", label: "Поддержка" },
  { value: "MANAGER", label: "Менеджеры" },
  { value: "ADMIN", label: "Админы" },
];

export interface ContentDraft {
  category: PushCategory;
  titleRu: string;
  bodyRu: string;
  titleEn: string;
  bodyEn: string;
  titleTkm: string;
  bodyTkm: string;
  imageUrl: string;
  route: string;
}

export const emptyDraft: ContentDraft = {
  category: "feed",
  titleRu: "",
  bodyRu: "",
  titleEn: "",
  bodyEn: "",
  titleTkm: "",
  bodyTkm: "",
  imageUrl: "",
  route: "/home",
};

/** Blank optional fields are left out, so the server stores null rather than empty text. */
export function draftToInput(draft: ContentDraft): PushContentInput {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    category: draft.category,
    titleRu: draft.titleRu.trim(),
    bodyRu: draft.bodyRu.trim(),
    titleEn: optional(draft.titleEn),
    bodyEn: optional(draft.bodyEn),
    titleTkm: optional(draft.titleTkm),
    bodyTkm: optional(draft.bodyTkm),
    imageUrl: optional(draft.imageUrl),
    route: draft.route,
  };
}

export function draftFrom(source: Partial<Record<keyof ContentDraft, string | null>> & { category?: PushCategory }): ContentDraft {
  return {
    category: source.category ?? "feed",
    titleRu: source.titleRu ?? "",
    bodyRu: source.bodyRu ?? "",
    titleEn: source.titleEn ?? "",
    bodyEn: source.bodyEn ?? "",
    titleTkm: source.titleTkm ?? "",
    bodyTkm: source.bodyTkm ?? "",
    imageUrl: source.imageUrl ?? "",
    route: source.route ?? "/home",
  };
}

export function draftIsValid(draft: ContentDraft): boolean {
  return draft.titleRu.trim().length > 0 && draft.bodyRu.trim().length > 0;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : "Что-то пошло не так";
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function countryName(code: string, names: Map<string, string>): string {
  return code === "—" ? "Не определена" : (names.get(code) ?? code);
}
