"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChatsCircle, TextAa } from "@phosphor-icons/react/dist/ssr";
import { useTranslation } from "@topup-hub/i18n";
import { AuthChat } from "./auth-chat";

const VIEW_KEY = "th_auth_view";

/**
 * The chat is the default way in; the classic form stays one tap away, because password managers
 * and browser autofill work best on a plain form and some people simply prefer it. The choice is
 * remembered per browser -- a convenience only, so a blocked storage just means the chat again.
 */
export function AuthScreen({ start, classic }: { start: "ask" | "register"; classic: ReactNode }) {
  const { t } = useTranslation();
  const [view, setView] = useState<"chat" | "classic">("chat");

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "classic") setView("classic");
    } catch {
      // Storage unavailable: stay on the chat.
    }
  }, []);

  function switchTo(next: "chat" | "classic") {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered; harmless.
    }
  }

  return (
    <div className="crystal-bg min-h-[calc(100dvh-4rem)]">
      <div className="mx-auto max-w-md px-4 pb-24 pt-6 sm:py-10">
        {view === "chat" ? <AuthChat start={start} /> : classic}
        <p className="mt-4 text-center">
          <button
            type="button"
            onClick={() => switchTo(view === "chat" ? "classic" : "chat")}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm text-slate-500 transition hover:bg-white/70 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-brand-300"
          >
            {view === "chat" ? <TextAa size={16} aria-hidden="true" /> : <ChatsCircle size={16} aria-hidden="true" />}
            {view === "chat" ? t("authChat.classic") : t("authChat.chatMode")}
          </button>
        </p>
      </div>
    </div>
  );
}
