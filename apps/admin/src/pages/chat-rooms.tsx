import { useEffect, useState } from "react";
import {
  Link2,
  Megaphone,
  MessageSquare,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import type { ChatRoomAdminDto } from "@topup-hub/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

/**
 * Every room on the platform, and who answers for it.
 *
 * Three kinds arrive in one list because moderation reads them the same way -- a room, its size,
 * and the account behind it. What differs is who that account is: a staff group is ours, a
 * channel belongs to a shop, and a group somebody made for their own friends is theirs, and the
 * console says which rather than making staff infer it from the name.
 *
 * Creating from here still exists and still adds people by account id. That is a staff-only
 * power: it puts somebody in a room they never asked to join, which is why the ordinary way in
 * is an invite link the person chooses to follow.
 */
export default function ChatRoomsPage() {
  const [rooms, setRooms] = useState<ChatRoomAdminDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [memberIds, setMemberIds] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newMembers, setNewMembers] = useState("");
  const [removeId, setRemoveId] = useState("");
  const [kind, setKind] = useState<"ALL" | "GROUP" | "CHANNEL">("ALL");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRooms(await api.listChatRoomsAdmin());
    } catch {
      setError("Не удалось загрузить чаты. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  /** Ids pasted as a list: one per line, or separated by commas or spaces. */
  function parseIds(value: string): string[] {
    return [...new Set(value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean))];
  }

  async function create() {
    const ids = parseIds(memberIds);
    if (!title.trim() || ids.length === 0) {
      setError("Нужны название и хотя бы один участник.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createChatRoom({ title: title.trim(), memberIds: ids });
      setTitle("");
      setMemberIds("");
      await load();
    } catch {
      setError("Не удалось создать чат. Проверьте, что все ID существуют.");
    } finally {
      setBusy(false);
    }
  }

  async function addMembers(roomId: string) {
    const ids = parseIds(newMembers);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await api.addChatRoomMembers(roomId, ids);
      setNewMembers("");
      setAddingTo(null);
      await load();
    } catch {
      setError("Не удалось добавить участников. Проверьте ID.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(room: ChatRoomAdminDto) {
    // Deleting takes the messages with it, and there is no undo — so the confirmation names the
    // room and says what goes, rather than asking "are you sure".
    const ok = window.confirm(
      `Удалить чат «${room.title}» и все ${room._count.messages} сообщений в нём? Это необратимо.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteChatRoom(room.id);
      await load();
    } catch {
      setError("Не удалось удалить чат.");
    } finally {
      setBusy(false);
    }
  }

  const totalMessages = rooms.reduce((sum, room) => sum + room._count.messages, 0);
  const totalMembers = rooms.reduce((sum, room) => sum + room._count.members, 0);
  const groups = rooms.filter((room) => room.kind === "GROUP");
  const channels = rooms.filter((room) => room.kind === "CHANNEL");
  const visible = kind === "ALL" ? rooms : rooms.filter((room) => room.kind === kind);

  function personName(room: ChatRoomAdminDto) {
    const person = room.createdBy;
    if (!person) return room.createdById;
    return person.fullName?.trim() || person.username || person.id;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Чаты</h1>
        <p className="mt-1 text-sm text-slate-500">
          Группы и каналы платформы: кто их создал, сколько в них людей и сообщений. Переписки
          с продавцами и поддержкой — в разделе обращений.
        </p>
      </div>

      <OfficialChannels rooms={rooms} onChanged={load} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <MessageSquare className="h-4 w-4" /> Групп
          </div>
          <p className="mt-2 text-2xl font-bold">{groups.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Megaphone className="h-4 w-4" /> Каналов
          </div>
          <p className="mt-2 text-2xl font-bold">{channels.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Users className="h-4 w-4" /> Участников
          </div>
          <p className="mt-2 text-2xl font-bold">{totalMembers}</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Сообщений
          </div>
          <p className="mt-2 text-2xl font-bold">{totalMessages}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["ALL", `Все · ${rooms.length}`],
            ["GROUP", `Группы · ${groups.length}`],
            ["CHANNEL", `Каналы · ${channels.length}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={
              kind === value
                ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-900"
                : "rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Создать чат</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            aria-label="Название группы"
            maxLength={120}
            placeholder="Название"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            aria-label="ID участников группы"
            placeholder="ID участников через запятую"
            value={memberIds}
            onChange={(e) => setMemberIds(e.target.value)}
          />
        </div>
        <Button onClick={() => void create()} disabled={busy}>
          <Plus className="mr-2 h-4 w-4" /> Создать
        </Button>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => void load()}>Обновить список</button>
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Загружаем…</p>
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          {rooms.length === 0
            ? "Чатов пока нет. Создайте первый — участники увидят его во вкладке «Чаты»."
            : "В этой категории пока пусто."}
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((room) => (
            <Card key={room.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{room.title}</p>
                    <span
                      className={
                        room.kind === "CHANNEL"
                          ? "rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                          : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300"
                      }
                    >
                      {room.officialCategory ? "Официальный канал" : room.kind === "CHANNEL" ? "Канал магазина" : "Группа"}
                    </span>
                    {/* A live link is what makes a group something people can still be added to.
                        The code itself is not shown — see ChatRoomAdminDto. */}
                    {room.hasInvite && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <Link2 className="h-3 w-3" /> ссылка активна
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {room.seller ? `Магазин ${room.seller.shopName}` : `Создал ${personName(room)}`} ·{" "}
                    {room._count.members} участников · {room._count.messages} сообщений ·
                    последнее {new Date(room.lastMessageAt).toLocaleString("ru")}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-400">{room.id}</p>
                </div>
                <div className="flex gap-2">
                  {!room.officialCategory && <Button
                    variant="secondary"
                    onClick={() => setAddingTo(addingTo === room.id ? null : room.id)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" /> Участники
                  </Button>}
                  {!room.officialCategory && <Button aria-label={`Удалить чат ${room.title}`} variant="secondary" onClick={() => void remove(room)} disabled={busy}>
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>}
                </div>
              </div>

              {!room.officialCategory && addingTo === room.id && (
                <div className="mt-3 space-y-2 border-t border-slate-200/70 pt-3 dark:border-white/10">
                  <div className="flex gap-2">
                    <Input
                      placeholder="ID через запятую"
                      value={newMembers}
                      onChange={(e) => setNewMembers(e.target.value)}
                    />
                    <Button onClick={() => void addMembers(room.id)} disabled={busy}>
                      Добавить
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="ID участника, которого убрать"
                      value={removeId}
                      onChange={(e) => setRemoveId(e.target.value)}
                    />
                    <Button
                      variant="secondary"
                      disabled={busy || !removeId.trim()}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api.removeChatRoomMember(room.id, removeId.trim());
                          setRemoveId("");
                          await load();
                        } catch {
                          setError("Не удалось убрать участника.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <UserMinus className="mr-2 h-4 w-4" /> Убрать
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const officialCategories = [
  { category: "NEWS", title: "Новости сервиса", description: "Изменения в работе и важные объявления." },
  { category: "PROMOTIONS", title: "Акции", description: "Предложения, скидки и сроки их действия." },
  { category: "SECURITY", title: "Безопасность", description: "Как защитить аккаунт и распознать мошенников." },
] as const;

function OfficialChannels({ rooms, onChanged }: { rooms: ChatRoomAdminDto[]; onChanged: () => Promise<void> }) {
  const [selected, setSelected] = useState<(typeof officialCategories)[number] | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ id: string; body: string; createdAt: string }[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function open(item: (typeof officialCategories)[number]) {
    if (body.trim() && !window.confirm("Перейти в другой канал? Неопубликованный текст будет потерян.")) return;
    setBusy(true);
    setSelected(item);
    setRoomId(null);
    setMessages([]);
    setBody("");
    setError(null);
    setNotice(null);
    try {
      const existing = rooms.find((room) => room.officialCategory === item.category);
      const room = existing ?? await api.ensureOfficialChatChannel(item.category);
      const result = await api.getOfficialChatMessagesAdmin(room.id);
      setRoomId(room.id);
      setMessages(result.messages);
      if (!existing) await onChanged();
    } catch {
      setError("Не удалось открыть канал. Выберите его ещё раз, чтобы повторить.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!roomId || !body.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await api.postOfficialChatMessageAdmin(roomId, body.trim());
      setMessages((current) => [...current, message]);
      setBody("");
      setNotice("Опубликовано. Сообщение доступно в канале.");
      await onChanged();
    } catch {
      setError("Не удалось подтвердить публикацию. Обновите историю перед повторной отправкой, чтобы не создать дубликат. Текст сохранён.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-3" aria-label="Официальные объявления">
    <div>
      <h2 className="text-lg font-semibold">Официальные объявления</h2>
      <p className="mt-1 text-sm text-slate-500">Каналы сервиса для всех пользователей. Публикуют только администраторы и менеджеры.</p>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      {officialCategories.map((item) => <button key={item.category} type="button" disabled={busy}
        aria-pressed={selected?.category === item.category} onClick={() => void open(item)}
        className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 ${selected?.category === item.category ? "border-brand-400 bg-brand-50 dark:bg-brand-950" : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900"}`}>
        <span className="font-semibold">{item.title}</span>
        <span className="mt-1 block text-sm text-slate-500">{item.description}</span>
        <span className="mt-3 block text-xs font-semibold text-brand-600">{rooms.some((room) => room.officialCategory === item.category) ? "Открыть публикации" : "Создать канал"}</span>
      </button>)}
    </div>
    {selected && <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{selected.title}</h3>
        <Button variant="secondary" size="sm" disabled={busy || !roomId} onClick={async () => {
          if (!roomId) return;
          setBusy(true); setError(null);
          try { setMessages((await api.getOfficialChatMessagesAdmin(roomId)).messages); }
          catch { setError("Не удалось обновить историю. Попробуйте ещё раз."); }
          finally { setBusy(false); }
        }}>Обновить историю</Button>
      </div>
      <div className="max-h-80 space-y-3 overflow-y-auto" aria-label="Последние публикации">
        {messages.length === 0 && <p className="text-sm text-slate-500">{busy ? "Загружаем…" : "Публикаций пока нет. Напишите первое объявление ниже."}</p>}
        {[...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((message) => <article key={message.id} className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
          <time className="mt-2 block text-xs text-slate-500" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("ru")}</time>
        </article>)}
      </div>
      <div>
        <label htmlFor="official-message" className="mb-2 block text-sm font-medium">Новое объявление</label>
        <textarea id="official-message" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={4} disabled={busy || !roomId}
          placeholder="Напишите коротко: что изменилось, кого это касается и что нужно сделать."
          className="w-full rounded-lg border border-slate-200 bg-transparent p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:border-white/10" />
        <p className="text-right text-xs text-slate-500">{body.length} / 2000</p>
      </div>
      {body.trim() && <div className="border-l-2 border-brand-400 pl-3"><p className="mb-1 text-xs text-slate-500">Так увидит пользователь · {selected.title}</p><p className="whitespace-pre-wrap break-words text-sm">{body.trim()}</p></div>}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
      <Button disabled={busy || !roomId || !body.trim()} onClick={() => void publish()}>{busy ? "Подождите…" : "Опубликовать"}</Button>
    </Card>}
  </section>;
}
