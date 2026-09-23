import { useEffect, useMemo, useState } from "react";
import {
  Check,
  EyeOff,
  Flag,
  Image as ImageIcon,
  MessageSquareText,
  MoreHorizontal,
  RotateCcw,
  ShieldAlert,
  X,
} from "lucide-react";
import { useTranslation } from "@topup-hub/i18n";
import type { SocialFeedPostDto } from "@topup-hub/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type ModerationPost = {
  id: string;
  author: string;
  body: string;
  kind: "VIDEO" | "IMAGE" | "TEXT";
  product?: string;
  reports: number;
  created: string;
  state: "PENDING" | "PUBLISHED" | "REJECTED" | "HIDDEN";
  image?: string;
};

function formatCreated(value: string) {
  return new Intl.RelativeTimeFormat("ru", { numeric: "auto" }).format(
    Math.round((new Date(value).getTime() - Date.now()) / 60_000),
    "minute",
  );
}

function toModerationPost(
  post: SocialFeedPostDto,
  reportCounts: Map<string, number>,
): ModerationPost {
  const product = post.products[0];
  return {
    id: post.id,
    author: `@${post.author.username}`,
    body: post.body || "",
    kind: post.mediaType,
    product: product
      ? `${product.name} · ${product.priceTmt} TMT · ${product.sku}`
      : undefined,
    reports: reportCounts.get(post.id) ?? 0,
    created: formatCreated(post.createdAt),
    state: post.status ?? "PENDING",
    image: post.thumbnailUrl || post.mediaUrl || product?.imageUrl || undefined,
  };
}

export default function FeedModerationPage() {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<ModerationPost[]>([]);
  const [tab, setTab] = useState<"queue" | "reports">("queue");
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadQueue(activeTab = tab) {
    setLoading(true);
    setError(null);
    try {
      const reports = await api.listSocialReportQueue();
      const reportCounts = new Map(
        reports.map((item) => [item.postId, item._count.id] as const),
      );
      const status = activeTab === "queue" ? "PENDING" : undefined;
      const apiPosts = await api.listSocialPostsAdmin(status);
      const mapped = apiPosts.map((post) =>
        toModerationPost(post, reportCounts),
      );
      const filtered =
        activeTab === "reports"
          ? mapped.filter((post) => post.reports > 0)
          : mapped;
      setPosts(mapped);
      setSelectedId((current) =>
        filtered.some((post) => post.id === current)
          ? current
          : (filtered[0]?.id ?? ""),
      );
    } catch {
      setError("Не удалось загрузить очередь модерации.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue(tab);
  }, [tab]);

  const visible = useMemo(
    () =>
      posts.filter((p) =>
        tab === "queue" ? p.state === "PENDING" : p.reports > 0,
      ),
    [posts, tab],
  );
  const selected = posts.find((p) => p.id === selectedId) ?? visible[0] ?? null;

  async function decide(state: ModerationPost["state"]) {
    if (!selected) return;
    try {
      const updated = await api.moderateSocialPost(selected.id, {
        status: state,
        note: reason.trim() || undefined,
      });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selected.id
            ? toModerationPost(
                updated,
                new Map([[selected.id, selected.reports]]),
              )
            : p,
        ),
      );
      setNotice(
        state === "PUBLISHED"
          ? t("admin.feed.visible")
          : state === "HIDDEN"
            ? t("admin.feed.hidden")
            : state === "REJECTED"
              ? t("admin.feed.rejected")
              : t("admin.feed.pending"),
      );
      setReason("");
      void loadQueue(tab);
    } catch {
      setError("Не удалось сохранить решение модератора.");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-[1.5rem] border border-cyan-100 bg-gradient-to-br from-white via-cyan-50 to-slate-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-[#0d4661] p-3 text-white">
            <ShieldAlert size={24} />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#12384d]">
              {t("admin.feed.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {t("admin.feed.subtitle")}
            </p>
          </div>
        </div>
      </header>
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="overflow-hidden border-slate-200 p-0">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setTab("queue")}
              className={`flex-1 px-3 py-3 text-sm font-bold ${tab === "queue" ? "border-b-2 border-cyan-600 text-cyan-800" : "text-slate-500"}`}
            >
              {t("admin.feed.queue")}
            </button>
            <button
              onClick={() => setTab("reports")}
              className={`flex-1 px-3 py-3 text-sm font-bold ${tab === "reports" ? "border-b-2 border-cyan-600 text-cyan-800" : "text-slate-500"}`}
            >
              {t("admin.feed.reports")}
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {loading && (
              <p className="p-6 text-center text-sm text-slate-400">
                Загрузка очереди...
              </p>
            )}
            {!loading &&
              visible.map((post) => (
                <button
                  key={post.id}
                  onClick={() => setSelectedId(post.id)}
                  className={`w-full p-4 text-left transition hover:bg-cyan-50/60 ${selected?.id === post.id ? "bg-cyan-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-800">
                      {post.author}
                    </span>
                    <span className="text-[10px] font-bold tracking-wide text-slate-400">
                      {post.kind}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                    {post.body}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                    {post.reports > 0 && (
                      <span className="inline-flex items-center gap-1 text-rose-600">
                        <Flag size={12} />
                        {t("admin.feed.reportCount", { count: post.reports })}
                      </span>
                    )}
                    <span>{post.created}</span>
                  </div>
                </button>
              ))}
            {!loading && visible.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-400">
                {t("admin.feed.noItems")}
              </p>
            )}
          </div>
        </Card>
        <Card className="min-h-[510px] p-0">
          {selected ? (
            <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_260px]">
              <article className="p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-[#12384d]">
                      {selected.author}
                    </p>
                    <p className="text-xs text-slate-500">
                      {selected.created} · {selected.kind} · {selected.state}
                    </p>
                  </div>
                  <button
                    aria-label="Дополнительные действия"
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                  >
                    <MoreHorizontal size={20} />
                  </button>
                </div>
                {selected.image ? (
                  <div className="relative mb-5 overflow-hidden rounded-2xl bg-slate-100">
                    <img
                      src={selected.image}
                      alt="Медиа публикации"
                      className="aspect-video w-full object-cover"
                    />
                    {selected.kind === "VIDEO" && (
                      <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[10px] font-bold text-white">
                        VIDEO
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mb-5 flex aspect-video items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <ImageIcon size={36} />
                  </div>
                )}
                <p className="max-w-xl text-sm leading-7 text-slate-700">
                  {selected.body}
                </p>
                {selected.product && (
                  <div className="mt-5 border-l-4 border-cyan-400 bg-cyan-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-700">
                      Прикреплённый товар
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#12384d]">
                      {selected.product}
                    </p>
                  </div>
                )}
              </article>
              <aside className="border-l border-slate-100 bg-slate-50/70 p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Решение
                </p>
                <label className="mt-4 block text-xs font-medium text-slate-600">
                  {t("admin.feed.reason")}
                </label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1"
                  placeholder="Необязательно для одобрения"
                />
                <div className="mt-4 space-y-2">
                  <Button
                    className="w-full"
                    onClick={() => void decide("PUBLISHED")}
                  >
                    <Check size={16} />
                    {t("admin.feed.approve")}
                  </Button>
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => void decide("HIDDEN")}
                  >
                    <EyeOff size={16} />
                    {selected.state === "HIDDEN"
                      ? t("admin.feed.restore")
                      : t("admin.feed.hide")}
                  </Button>
                  <Button
                    className="w-full"
                    variant="danger"
                    onClick={() => void decide("REJECTED")}
                  >
                    <X size={16} />
                    {t("admin.feed.reject")}
                  </Button>
                  {selected.state === "HIDDEN" && (
                    <Button
                      className="w-full"
                      variant="ghost"
                      onClick={() => void decide("PUBLISHED")}
                    >
                      <RotateCcw size={16} />
                      {t("admin.feed.restore")}
                    </Button>
                  )}
                </div>
                <div className="mt-7 border-t border-slate-200 pt-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <MessageSquareText size={16} />{" "}
                    {t("admin.feed.reportCount", { count: selected.reports })}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Жалобы агрегируются без раскрытия личности автора жалобы.
                    Пост можно опубликовать, скрыть или отклонить одним
                    решением.
                  </p>
                </div>
              </aside>
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-slate-400">
              {t("admin.feed.noItems")}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
