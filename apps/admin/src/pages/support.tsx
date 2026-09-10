import { useEffect, useRef, useState } from "react";
import type { SupportMessageDto, SupportThreadWithMessagesDto, SupportThreadWithUnreadDto } from "@topup-hub/types";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const POLL_MS = 4000;

export default function SupportPage() {
  const { t, locale } = useTranslation();
  const [threads, setThreads] = useState<SupportThreadWithUnreadDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportThreadWithMessagesDto | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function refreshList() {
      api.listSupportThreads().then(setThreads).catch(() => {});
    }
    refreshList();
    const id = window.setInterval(refreshList, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    function refreshDetail() {
      if (!selectedId) return;
      api.getSupportThread(selectedId).then(setDetail).catch(() => {});
    }
    refreshDetail();
    const id = window.setInterval(refreshDetail, POLL_MS);
    return () => window.clearInterval(id);
  }, [selectedId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [detail?.messages.length]);

  async function send() {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      const message = await api.sendStaffSupportMessage(selectedId, { body: draft.trim() });
      setDetail((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev));
      setDraft("");
      api.listSupportThreads().then(setThreads).catch(() => {});
    } finally {
      setSending(false);
    }
  }

  async function toggleStatus() {
    if (!selectedId || !detail) return;
    const nextStatus = detail.thread.status === "OPEN" ? "CLOSED" : "OPEN";
    await api.updateSupportThreadStatus(selectedId, { status: nextStatus });
    setDetail((prev) => (prev ? { ...prev, thread: { ...prev.thread, status: nextStatus } } : prev));
    api.listSupportThreads().then(setThreads).catch(() => {});
  }

  return (
    <div className="grid h-[calc(100vh-4rem)] grid-cols-[300px_1fr] gap-6">
      <Card className="flex flex-col overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">{t("admin.support.threadsHeader")}</div>
        <div className="flex-1 overflow-y-auto">
          {threads.map((th) => (
            <button
              key={th.id}
              onClick={() => setSelectedId(th.id)}
              className={`flex w-full flex-col gap-0.5 border-b border-slate-50 px-4 py-3 text-left text-sm ${
                selectedId === th.id ? "bg-gradient-brand-soft" : "hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{th.user.fullName || th.user.phone}</span>
                {th.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-semibold text-white">
                    {th.unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{new Date(th.lastMessageAt).toLocaleString(LOCALE_BCP47[locale])}</span>
                {th.status === "CLOSED" && <span className="text-slate-400">{t("admin.support.closedLabel")}</span>}
              </div>
            </button>
          ))}
          {threads.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-slate-400">{t("admin.support.noThreads")}</p>
          )}
        </div>
      </Card>

      <Card className="flex flex-col overflow-hidden p-0">
        {!detail && (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            {t("admin.support.selectThreadPrompt")}
          </div>
        )}
        {detail && (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div>
                <div className="text-sm font-semibold">{detail.thread.user.fullName || detail.thread.user.phone}</div>
                <div className="text-xs text-slate-400">{detail.thread.user.phone}</div>
              </div>
              <Button variant="secondary" size="sm" onClick={toggleStatus}>
                {detail.thread.status === "OPEN" ? t("admin.support.closeThread") : t("admin.support.reopenThread")}
              </Button>
            </div>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {detail.messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {detail.messages.length === 0 && (
                <p className="text-center text-xs text-slate-400">{t("admin.support.noMessages")}</p>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2 border-t border-slate-100 p-3"
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
                rows={2}
                placeholder={t("admin.support.replyPlaceholder")}
                className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <Button type="submit" disabled={sending || !draft.trim()}>
                {t("admin.support.send")}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}

function MessageBubble({ message }: { message: SupportMessageDto }) {
  const { locale } = useTranslation();
  const isStaff = message.senderRole === "STAFF";
  return (
    <div className={`flex ${isStaff ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[70%] rounded-xl2 px-3 py-2 text-sm ${
          isStaff ? "bg-gradient-brand text-white" : "bg-slate-100 text-slate-900"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
        <p className={`mt-1 text-[10px] ${isStaff ? "text-white/70" : "text-slate-400"}`}>
          {new Date(message.createdAt).toLocaleTimeString(LOCALE_BCP47[locale], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
