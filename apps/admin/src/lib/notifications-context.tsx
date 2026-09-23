import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { playChatChime, playOrderChime, unlockAudio } from "@/lib/chime";

const POLL_MS = 7000;
const TOAST_MS = 6000;

interface ToastItem {
  id: string;
  kind: "order" | "chat";
  title: string;
  body: string;
  href: string;
}

interface NotificationState {
  pendingOrdersCount: number;
  unreadChatCount: number;
}

const NotificationContext = createContext<NotificationState>({ pendingOrdersCount: 0, unreadChatCount: 0 });

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastOrderIdRef = useRef<string | null>(null);
  const haveBaselineRef = useRef(false);
  const lastUnreadRef = useRef<number | null>(null);

  function pushToast(toast: Omit<ToastItem, "id">) {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_MS);
  }

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  useEffect(() => {
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const orders = await api.listAllOrders();
        if (!cancelled) {
          setPendingOrdersCount(orders.filter((o) => o.status === "PENDING_PAYMENT").length);
          const newest = orders[0];
          if (newest) {
            if (haveBaselineRef.current && newest.id !== lastOrderIdRef.current) {
              playOrderChime();
              pushToast({
                kind: "order",
                title: "Новый заказ",
                body: `${newest.recipientIdentifier} · ${newest.amountTmt} TMT`,
                href: `/orders/${newest.id}`,
              });
            }
            lastOrderIdRef.current = newest.id;
          }
          haveBaselineRef.current = true;
        }
      } catch {
        // transient error (e.g. token refresh in flight) — try again next tick
      }

      try {
        const threads = await api.listSupportThreads();
        if (!cancelled) {
          const total = threads.reduce((sum, t) => sum + t.unreadCount, 0);
          setUnreadChatCount(total);
          if (lastUnreadRef.current !== null && total > lastUnreadRef.current) {
            const withNewMessage = threads.find((t) => t.unreadCount > 0);
            playChatChime();
            pushToast({
              kind: "chat",
              title: "Новое сообщение в поддержке",
              body: withNewMessage ? withNewMessage.user.fullName || withNewMessage.user.phone : "",
              href: "/support",
            });
          }
          lastUnreadRef.current = total;
        }
      } catch {
        // transient error — try again next tick
      }
    }

    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ pendingOrdersCount, unreadChatCount }}>
      {children}
      <div className="pointer-events-none fixed right-5 top-5 z-[100] flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-2 rounded-xl2 border border-slate-200 bg-white p-3 shadow-soft"
          >
            <button
              onClick={() => {
                navigate(t.href);
                dismiss(t.id);
              }}
              className="flex flex-1 items-start gap-3 text-left"
            >
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.kind === "order" ? "bg-emerald-500" : "bg-brand-500"}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{t.title}</span>
                <span className="block truncate text-xs text-slate-500">{t.body}</span>
              </span>
            </button>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Скрыть уведомление"
              className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}
