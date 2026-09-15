"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ChatAttachmentInput,
  ChatChannelDto,
  ChatConversationDto,
  ChatGroupInfoDto,
  ChatInboxEntryDto,
  ChatMessageDto,
} from "@topup-hub/types";
import { api, isAuthenticated } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Mirrors MAX_UPLOAD_ATTACHMENT_SIZE_BYTES on the API -- checked here only to fail fast with a
 *  readable message instead of uploading 30MB to be refused. */
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;

function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(size / 1024))} КБ`;
}

/** A sent attachment, drawn inside the bubble: pictures inline, everything else as a file row. */
function Attachment({ message, mine }: { message: ChatMessageDto; mine: boolean }) {
  if (!message.attachmentUrl) return null;
  const isImage = (message.attachmentMime ?? "").startsWith("image/");
  const isVideo = (message.attachmentMime ?? "").startsWith("video/");
  if (isImage) {
    return (
      <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="mt-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element -- user upload, arbitrary host/size */}
        <img
          src={message.attachmentUrl}
          alt={message.attachmentName ?? "Вложение"}
          className="max-h-72 w-auto rounded-xl object-cover"
        />
      </a>
    );
  }
  if (isVideo) {
    return (
      <video
        src={message.attachmentUrl}
        controls
        preload="metadata"
        className="mt-1 max-h-72 w-full rounded-xl"
      />
    );
  }
  return (
    <a
      href={message.attachmentUrl}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm underline",
        mine ? "bg-white/15" : "bg-slate-100 dark:bg-white/10",
      )}
    >
      <span aria-hidden>📎</span>
      <span className="min-w-0 flex-1 truncate">{message.attachmentName ?? "Файл"}</span>
      {message.attachmentSize ? (
        <span className={cn("shrink-0 text-xs", mine ? "text-white/70" : "text-slate-500")}>
          {formatBytes(message.attachmentSize)}
        </span>
      ) : null}
    </a>
  );
}

const categories = {
  NEWS: "Новости сервиса",
  PROMOTIONS: "Акции",
  SECURITY: "Безопасность",
};
const control =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-white/15 dark:bg-slate-900";
const button =
  "rounded-xl px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 dark:hover:bg-white/10";
const primary =
  "rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50";
function titleOf(row: ChatInboxEntryDto) {
  return row.kind === "SUPPORT" ? "Поддержка" : row.title || "Диалог";
}

export default function ChatPage() {
  const router = useRouter();
  const [inbox, setInbox] = useState<ChatInboxEntryDto[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ChatConversationDto | null>(
    null,
  );
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Все");
  const [panel, setPanel] = useState<
    "channels" | "create" | "join" | "info" | null
  >(null);
  const [channels, setChannels] = useState<ChatChannelDto[]>([]);
  const [group, setGroup] = useState<ChatGroupInfoDto | null>(null);
  const [input, setInput] = useState("");
  // One pending attachment at a time, per conversation: picked, uploaded, then sent with the
  // next message. Kept per id so switching conversations does not carry somebody's file along.
  const [attachments, setAttachments] = useState<Record<string, ChatAttachmentInput>>({});
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof api.chatInvitePreview>
  > | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeRef = useRef(active);
  activeRef.current = active;
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const endRef = useRef<HTMLDivElement>(null);
  async function refresh() {
    setInbox(await api.chatInbox());
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    let alive = true;
    api
      .getMe()
      .then((user) => {
        if (alive) setUserId(user.id);
      })
      .catch(() => {});
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) {
      setInput(invite);
      setPanel("join");
    }
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const entries = await api.chatInbox();
        if (alive) setInbox(entries);
      } catch {
        if (alive)
          setError(
            "Не удалось обновить чаты. Проверьте соединение и повторите.",
          );
      } finally {
        running = false;
        if (alive) setLoading(false);
      }
    };
    void run();
    const timer = window.setInterval(() => {
      if (!document.hidden) void run();
    }, 8000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [router]);

  useEffect(() => {
    setConversation(null);
    setError("");
    setGroup(null);
    if (!active) return;
    let alive = true;
    let running = false;
    const run = async () => {
      if (running || document.hidden || panelRef.current) return;
      running = true;
      try {
        const data = await api.chatConversation(active);
        if (!alive || panelRef.current || document.hidden) return;
        setConversation(data);
        await api.markChatRead(active);
        if (alive)
          setInbox((rows) =>
            rows.map((row) =>
              row.id === active ? { ...row, unreadCount: 0 } : row,
            ),
          );
      } catch {
        if (alive)
          setError(
            "Не удалось загрузить сообщения. Повторим при восстановлении соединения.",
          );
      } finally {
        running = false;
      }
    };
    void run();
    const timer = window.setInterval(run, 4000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [active]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation?.messages.at(-1)?.id]);

  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch {
      setError(
        "Действие не выполнено. Проверьте соединение и попробуйте ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  }
  function open(id: string) {
    setActive(id);
    setPanel(null);
    setNotice("");
  }
  async function send() {
    const id = active;
    const body = id ? (drafts[id]?.trim() ?? "") : "";
    const attachment = id ? attachments[id] : undefined;
    // A file on its own is a message; an empty box with nothing attached is not.
    if (!id || (!body && !attachment) || sending || !conversation?.room.canPost) return;
    setSending(true);
    setError("");
    try {
      const message = await api.sendChatMessage(id, body, attachment);
      setDrafts((old) =>
        old[id]?.trim() === body ? { ...old, [id]: "" } : old,
      );
      setAttachments((old) => {
        const { [id]: _sent, ...rest } = old;
        return rest;
      });
      if (activeRef.current === id)
        setConversation((old) =>
          old
            ? {
                ...old,
                messages: [
                  ...old.messages.filter((m) => m.id !== message.id),
                  message,
                ],
              }
            : old,
        );
      void refresh().catch(() => {});
    } catch {
      setError("Сообщение не отправлено. Текст сохранён — попробуйте ещё раз.");
    } finally {
      setSending(false);
    }
  }
  async function pickAttachment(file: File | undefined) {
    const id = active;
    if (!file || !id) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("Файл больше 30 МБ. Выберите файл поменьше.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const uploaded = await api.uploadChatAttachment(file);
      setAttachments((old) => ({ ...old, [id]: uploaded }));
    } catch {
      setError("Не удалось загрузить файл. Попробуйте ещё раз.");
    } finally {
      setUploading(false);
    }
  }

  const selected = inbox.find((row) => row.id === active);
  const draft = active ? (drafts[active] ?? "") : "";
  const pendingAttachment = active ? attachments[active] : undefined;
  const visible = inbox.filter(
    (row) =>
      titleOf(row).toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (filter === "Все" ||
        (filter === "Непрочитанные"
          ? row.unreadCount > 0
          : filter === "Группы"
            ? row.kind === "GROUP"
            : row.kind === "CHANNEL")),
  );
  function inviteCode() {
    const raw = input.trim();
    try {
      return (
        new URL(raw).searchParams.get("invite")?.trim() ||
        raw.split("/").filter(Boolean).at(-1) ||
        raw
      );
    } catch {
      return raw;
    }
  }
  const inviteLink = group?.inviteCode
    ? `${typeof window === "undefined" ? "" : window.location.origin}/chat?invite=${group.inviteCode}`
    : "";

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-3 py-5 sm:px-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Чаты</h1>
          <p className="mt-1 text-sm text-slate-500">
            Люди, магазины и новости — рядом.
          </p>
        </div>
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void action(async () => {
              // The endpoint answers with { thread, messages }, not a bare thread. Reading
              // `.id` off the wrapper compiled to `undefined` and opened `thread:undefined`.
              const { thread } = await api.getMySupportThread();
              await refresh();
              open(`thread:${thread.id}`);
            })
          }
        >
          Поддержка
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="mb-3 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {notice}
        </p>
      )}
      <div className="flex h-[min(760px,75dvh)] min-h-[440px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950">
        <aside
          aria-label="Список чатов"
          className={cn(
            "w-full shrink-0 flex-col border-r border-slate-200 dark:border-white/10 md:flex md:w-80",
            active || panel ? "hidden" : "flex",
          )}
        >
          <div className="space-y-3 p-4">
            <input
              aria-label="Поиск чатов"
              placeholder="Найти чат"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(control, "w-full")}
            />
            <div className="flex flex-wrap gap-1">
              {["Все", "Непрочитанные", "Группы", "Каналы"].map((label) => (
                <button
                  key={label}
                  aria-pressed={filter === label}
                  onClick={() => setFilter(label)}
                  className={cn(
                    "rounded-full px-2.5 py-1.5 text-xs focus-visible:ring-2 focus-visible:ring-brand-400",
                    filter === label
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p role="status" className="p-5 text-sm text-slate-500">
                Загружаем чаты…
              </p>
            ) : visible.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">
                {search || filter !== "Все"
                  ? "Подходящих чатов нет."
                  : "Создайте группу для близких или выберите интересный канал."}
              </p>
            ) : (
              visible.map((row) => (
                <button
                  key={row.id}
                  onClick={() => open(row.id)}
                  className={cn(
                    "flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 dark:hover:bg-white/5",
                    active === row.id && "bg-brand-50 dark:bg-brand-950",
                  )}
                >
                  {row.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- user upload, arbitrary host */
                    <img
                      src={row.imageUrl}
                      alt=""
                      aria-hidden="true"
                      className="h-11 w-11 shrink-0 rounded-2xl object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-semibold",
                        row.officialCategory
                          ? "bg-teal-100 text-teal-800"
                          : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
                      )}
                    >
                      {row.officialCategory
                        ? "✓"
                        : row.kind === "SUPPORT"
                          ? "?"
                          : titleOf(row).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {titleOf(row)}
                      </span>
                      {row.isVerified && (
                        <span
                          title="Проверенный чат"
                          aria-label="Проверенный чат"
                          className="shrink-0 text-sm leading-none text-sky-500"
                        >
                          ✓
                        </span>
                      )}
                      {row.unreadCount > 0 && (
                        <span
                          aria-label={`${row.unreadCount} непрочитанных`}
                          className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-xs text-white"
                        >
                          {row.unreadCount}
                        </span>
                      )}
                    </span>
                    {row.officialCategory && (
                      <span className="text-[11px] text-teal-700 dark:text-teal-300">
                        Официальный · {categories[row.officialCategory]}
                      </span>
                    )}
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {row.lastMessage || "Пока нет сообщений"}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 border-t border-slate-200 p-2 dark:border-white/10">
            <button
              className={button}
              onClick={() => {
                setPanel("create");
                setInput("");
              }}
            >
              Создать группу
            </button>
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setChannels(await api.chatChannels());
                  setPanel("channels");
                })
              }
            >
              Найти каналы
            </button>
            <button
              className={cn(button, "col-span-2 text-slate-500")}
              onClick={() => {
                setPanel("join");
                setInput("");
                setPreview(null);
              }}
            >
              Вступить по приглашению
            </button>
          </div>
        </aside>
        <section
          aria-label="Переписка"
          className={cn(
            "min-w-0 flex-1 flex-col",
            active || panel ? "flex" : "hidden md:flex",
          )}
        >
          {panel ? (
            <div className="overflow-y-auto p-5 sm:p-7">
              <button
                className={cn(button, "mb-4")}
                onClick={() => setPanel(null)}
              >
                ← Назад
              </button>
              {panel === "channels" && (
                <>
                  <h2 className="text-xl font-semibold">Каналы</h2>
                  <p className="mb-5 mt-1 text-sm text-slate-500">
                    Подпишитесь на новости и предложения. Публикует только автор
                    канала.
                  </p>
                  {channels.length === 0 && (
                    <p className="text-sm text-slate-500">
                      Каналы появятся здесь после создания.
                    </p>
                  )}
                  <div className="space-y-3">
                    {channels.map((channel) => (
                      <article
                        key={channel.id}
                        className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"
                      >
                        <h3 className="font-semibold">
                          {channel.title}{" "}
                          {channel.officialCategory && (
                            <span className="text-sm text-teal-700 dark:text-teal-300">
                              ✓ Официальный
                            </span>
                          )}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {channel.description ||
                            channel.shopName ||
                            (channel.officialCategory
                              ? categories[channel.officialCategory]
                              : "Канал")}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500">
                            Подписчиков: {channel.subscriberCount}
                          </span>
                          <button
                            disabled={busy}
                            className={button}
                            onClick={() =>
                              void action(async () => {
                                if (!channel.subscribed)
                                  await api.subscribeChatChannel(channel.id);
                                await refresh();
                                open(`room:${channel.id}`);
                              })
                            }
                          >
                            {channel.subscribed ? "Открыть" : "Подписаться"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {panel === "create" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      const result = await api.createChatGroup(input.trim());
                      await refresh();
                      open(result.conversationId);
                      setNotice(
                        "Группа создана. Нажмите «О группе», чтобы пригласить участников.",
                      );
                    });
                  }}
                >
                  <h2 className="text-xl font-semibold">Новая группа</h2>
                  <p className="my-3 text-sm text-slate-500">
                    Общайтесь с друзьями и делитесь находками. Люди смогут
                    вступить по вашему приглашению.
                  </p>
                  <label className="block text-sm">
                    Название группы
                    <input
                      className={cn(control, "mb-4 mt-2 block w-full")}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      maxLength={120}
                      placeholder="Например, Покупки с друзьями"
                      required
                    />
                  </label>
                  <button disabled={busy || !input.trim()} className={primary}>
                    Создать группу
                  </button>
                </form>
              )}
              {panel === "join" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      setPreview(await api.chatInvitePreview(inviteCode()));
                    });
                  }}
                >
                  <h2 className="text-xl font-semibold">
                    Приглашение в группу
                  </h2>
                  <label className="mt-4 block text-sm">
                    Ссылка или код
                    <input
                      className={cn(control, "my-2 block w-full")}
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        setPreview(null);
                      }}
                      required
                    />
                  </label>
                  <button disabled={busy || !input.trim()} className={button}>
                    Проверить приглашение
                  </button>
                  {preview && (
                    <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
                      <h3 className="font-semibold">{preview.title}</h3>
                      <p className="my-2 text-sm text-slate-500">
                        Участников: {preview.memberCount}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        className={primary}
                        onClick={() =>
                          void action(async () => {
                            const result =
                              await api.joinChatInvite(inviteCode());
                            await refresh();
                            open(result.conversationId);
                          })
                        }
                      >
                        {preview.alreadyMember
                          ? "Открыть группу"
                          : "Вступить в группу"}
                      </button>
                    </div>
                  )}
                </form>
              )}
              {panel === "info" && group && (
                <>
                  <h2 className="text-xl font-semibold">{group.title}</h2>
                  <p className="my-3 text-sm text-slate-500">
                    Сообщения видны участникам группы. Приглашайте только тех,
                    кому доверяете.
                  </p>
                  {inviteLink && (
                    <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
                      {group.isOwner && (
                        <label className="mb-3 block text-xs text-slate-500">
                          Фото группы
                          <span className="mt-2 flex items-center gap-3">
                            {group.imageUrl ? (
                              /* eslint-disable-next-line @next/next/no-img-element -- user upload */
                              <img
                                src={group.imageUrl}
                                alt=""
                                className="h-14 w-14 rounded-2xl object-cover"
                              />
                            ) : (
                              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-lg font-semibold text-slate-600 dark:bg-white/10">
                                {group.title.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <span className={cn(button, "cursor-pointer border border-slate-200 dark:border-white/15")}>
                              {uploading ? "Загрузка…" : "Изменить"}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={uploading || busy}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (!file) return;
                                  void action(async () => {
                                    setUploading(true);
                                    try {
                                      const { url } = await api.uploadImage(file);
                                      const updated = await api.setChatRoomImage(group.id, url);
                                      setGroup((old) => (old ? { ...old, imageUrl: updated.imageUrl } : old));
                                      setNotice("Фото обновлено.");
                                      void refresh().catch(() => {});
                                    } finally {
                                      setUploading(false);
                                    }
                                  });
                                }}
                              />
                            </span>
                            {group.imageUrl && (
                              <button
                                type="button"
                                disabled={busy || uploading}
                                className={button}
                                onClick={() =>
                                  void action(async () => {
                                    await api.setChatRoomImage(group.id, null);
                                    setGroup((old) => (old ? { ...old, imageUrl: null } : old));
                                    setNotice("Фото убрано.");
                                    void refresh().catch(() => {});
                                  })
                                }
                              >
                                Убрать
                              </button>
                            )}
                          </span>
                        </label>
                      )}
                      <label className="text-xs text-slate-500">
                        Ссылка для приглашения
                        <input
                          readOnly
                          className={cn(control, "my-2 w-full")}
                          value={inviteLink}
                        />
                      </label>
                      <button
                        className={button}
                        onClick={() =>
                          void action(async () => {
                            await navigator.clipboard.writeText(inviteLink);
                            setNotice("Ссылка скопирована.");
                          })
                        }
                      >
                        Скопировать ссылку
                      </button>
                      {group.isOwner && (
                        <button
                          disabled={busy}
                          className={button}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Заменить приглашение? Старая ссылка перестанет работать.",
                              )
                            )
                              void action(async () => {
                                const result = await api.rotateChatInvite(
                                  group.id,
                                );
                                setGroup({
                                  ...group,
                                  inviteCode: result.inviteCode,
                                });
                              });
                          }}
                        >
                          Заменить ссылку
                        </button>
                      )}
                    </div>
                  )}
                  <h3 className="mb-2 mt-5 text-sm font-semibold">
                    Участники · {group.members.length}
                  </h3>
                  <ul className="divide-y divide-slate-100 dark:divide-white/10">
                    {group.members.map((member) => (
                      <li className="py-2 text-sm" key={member.id}>
                        {member.name || "Участник"}
                        {member.isOwner && (
                          <span className="ml-2 text-xs text-slate-500">
                            Создатель
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button
                    disabled={busy}
                    className={cn(button, "mt-5 text-red-600")}
                    onClick={() => {
                      if (
                        window.confirm(
                          group.isOwner
                            ? "Удалить группу и все сообщения для всех участников? Это нельзя отменить."
                            : "Выйти из группы? Вернуться можно по приглашению.",
                        )
                      )
                        void action(async () => {
                          if (group.isOwner)
                            await api.deleteMyChatGroup(group.id);
                          else await api.leaveChatGroup(group.id);
                          setActive(null);
                          setPanel(null);
                          await refresh();
                        });
                    }}
                  >
                    {group.isOwner ? "Удалить группу" : "Выйти из группы"}
                  </button>
                </>
              )}
            </div>
          ) : active ? (
            <>
              <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-3 dark:border-white/10">
                <button
                  aria-label="К списку чатов"
                  className={cn(button, "md:hidden")}
                  onClick={() => setActive(null)}
                >
                  ←
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold">
                    {selected
                      ? titleOf(selected)
                      : conversation?.room.title || "Диалог"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {conversation?.room.officialCategory ||
                    selected?.officialCategory
                      ? "✓ Официальный канал сервиса"
                      : conversation?.room.kind === "GROUP"
                        ? "Группа"
                        : conversation?.room.kind === "CHANNEL"
                          ? "Канал"
                          : "Личная переписка"}
                  </p>
                </div>
                {conversation?.room.kind === "GROUP" && (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        setGroup(await api.chatGroupInfo(conversation.room.id));
                        setPanel("info");
                      })
                    }
                  >
                    О группе
                  </button>
                )}
                {conversation?.room.kind === "CHANNEL" &&
                  !conversation.room.canPost && (
                    <button
                      disabled={busy}
                      className={button}
                      onClick={() => {
                        if (window.confirm("Отписаться от канала?"))
                          void action(async () => {
                            await api.unsubscribeChatChannel(
                              conversation.room.id,
                            );
                            setActive(null);
                            await refresh();
                          });
                      }}
                    >
                      Отписаться
                    </button>
                  )}
              </header>
              <div
                className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4 dark:bg-white/[0.02]"
                aria-live="polite"
                aria-relevant="additions"
              >
                {conversation && conversation.messages.length >= 200 && (
                  <p className="text-center text-xs text-slate-500">
                    Показаны последние 200 сообщений.
                  </p>
                )}
                {!conversation && (
                  <p className="text-center text-sm text-slate-500">
                    Загружаем сообщения…
                  </p>
                )}
                {conversation?.messages.length === 0 && (
                  <p className="py-12 text-center text-sm text-slate-500">
                    {conversation.room.canPost
                      ? "Напишите первое сообщение."
                      : "Публикации появятся здесь."}
                  </p>
                )}
                {conversation?.messages.map((message) => {
                  const mine = !!userId && message.authorId === userId;
                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        mine ? "justify-end" : "justify-start",
                      )}
                    >
                      <article
                        className={cn(
                          "max-w-[90%] rounded-2xl px-4 py-2.5 sm:max-w-[75%]",
                          mine
                            ? "bg-brand-600 text-white"
                            : "border border-slate-100 bg-white dark:border-white/10 dark:bg-slate-900",
                        )}
                      >
                        {!mine && conversation.room.kind === "GROUP" && (
                          <p className="mb-1 text-xs font-semibold text-brand-600 dark:text-brand-300">
                            {message.author?.fullName ||
                              message.author?.username ||
                              "Участник"}
                          </p>
                        )}
                        {message.body && (
                          <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                            {message.body}
                          </p>
                        )}
                        <Attachment message={message} mine={mine} />
                        <time
                          dateTime={message.createdAt}
                          title={new Date(message.createdAt).toLocaleString(
                            "ru",
                          )}
                          className={cn(
                            "mt-1 block text-right text-[10px]",
                            mine ? "text-white/70" : "text-slate-400",
                          )}
                        >
                          {new Date(message.createdAt).toLocaleTimeString(
                            "ru",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </time>
                      </article>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              {conversation?.room.canPost ? (
                <form
                  className="flex flex-wrap items-end gap-2 border-t border-slate-200 p-3 dark:border-white/10"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  {pendingAttachment && (
                    <div className="flex w-full items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm dark:bg-white/10">
                      <span aria-hidden>📎</span>
                      <span className="min-w-0 flex-1 truncate">{pendingAttachment.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {formatBytes(pendingAttachment.size)}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-xs text-slate-500 underline"
                        onClick={() =>
                          setAttachments((old) => {
                            if (!active) return old;
                            const { [active]: _removed, ...rest } = old;
                            return rest;
                          })
                        }
                      >
                        Убрать
                      </button>
                    </div>
                  )}
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Сообщение</span>
                    <textarea
                      value={draft}
                      maxLength={2000}
                      rows={2}
                      placeholder="Написать сообщение…"
                      className={cn(control, "block w-full resize-none")}
                      onChange={(e) =>
                        setDrafts((old) => ({
                          ...old,
                          [active]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                  </label>
                  <label
                    className={cn(button, "shrink-0 cursor-pointer border border-slate-200 dark:border-white/15")}
                    title="Фото, видео или документ, до 30 МБ"
                  >
                    {uploading ? "…" : "📎"}
                    <span className="sr-only">Прикрепить файл</span>
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploading || sending}
                      onChange={(e) => {
                        void pickAttachment(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    disabled={sending || uploading || (!draft.trim() && !pendingAttachment)}
                    className={primary}
                  >
                    {sending ? "Отправка…" : "Отправить"}
                  </button>
                </form>
              ) : (
                conversation && (
                  <p className="border-t border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-white/10">
                    Это канал. Сообщения публикует его команда.
                  </p>
                )
              )}
            </>
          ) : (
            <div className="m-auto max-w-sm p-8 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-3xl text-teal-700 dark:bg-teal-950">
                ↔
              </div>
              <h2 className="text-xl font-semibold">
                Разговор начинается здесь
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Выберите чат, соберите свою группу или подпишитесь на канал.
                Поддержка всегда доступна сверху.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
