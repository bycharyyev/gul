"use client";

import { useEffect, useRef, useState } from "react";
import type { SupportMessageDto, SupportThreadWithMessagesDto, SupportThreadWithUnreadDto } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POLL_MS = 4000;

export default function SellerChatPage() {
  const { t } = useTranslation();
  const [threads, setThreads] = useState<SupportThreadWithUnreadDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportThreadWithMessagesDto | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function refresh() {
      api.listSellerInboxThreads().then(setThreads).catch(() => {});
    }
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    function refresh() {
      if (!selectedId) return;
      api.getSellerInboxThread(selectedId).then(setDetail).catch(() => {});
    }
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [selectedId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [detail?.messages.length]);

  async function send() {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      const message = await api.sendSellerInboxMessage(selectedId, { body: draft.trim() });
      setDetail((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev));
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid h-[70vh] grid-cols-[280px_1fr] gap-6">
      <Card className="flex flex-col overflow-hidden p-0">
        <div className="border-b border-white/30 px-4 py-3 text-sm font-semibold dark:border-white/10">
          {t("sellerCabinet.chat.inboxTitle")}
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setSelectedId(thread.id)}
              className={`flex w-full items-center justify-between border-b border-white/20 px-4 py-3 text-left text-sm dark:border-white/5 ${
                selectedId === thread.id ? "bg-gradient-brand-soft" : "hover:bg-white/50 dark:hover:bg-white/5"
              }`}
            >
              <span className="truncate">{thread.user.fullName || thread.user.phone}</span>
              {thread.unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-semibold text-white">
                  {thread.unreadCount}
                </span>
              )}
            </button>
          ))}
          {threads.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-slate-400">{t("sellerCabinet.chat.noThreads")}</p>
          )}
        </div>
      </Card>

      <Card className="flex flex-col overflow-hidden p-0">
        {!detail && (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            {t("sellerCabinet.chat.selectThreadPrompt")}
          </div>
        )}
        {detail && (
          <>
            <div className="border-b border-white/30 px-5 py-3 text-sm font-semibold dark:border-white/10">
              {detail.thread.user.fullName || detail.thread.user.phone}
            </div>
            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {detail.messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {detail.messages.length === 0 && (
                <p className="text-center text-xs text-slate-400">{t("sellerCabinet.chat.noMessagesYet")}</p>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2 border-t border-white/30 p-3 dark:border-white/10"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={t("sellerCabinet.chat.replyPlaceholder")}
                className="flex-1 resize-none rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5"
              />
              <Button type="submit" disabled={sending || !draft.trim()}>
                {t("sellerCabinet.chat.send")}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}

function MessageBubble({ message }: { message: SupportMessageDto }) {
  const isSeller = message.senderRole === "SELLER";
  return (
    <div className={cn("flex", isSeller ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-xl2 px-3 py-2 text-sm",
          isSeller ? "bg-gradient-brand text-white" : "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-slate-100",
        )}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
      </div>
    </div>
  );
}
