"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookmarkSimple,
  ChatCircle,
  DotsThree,
  Heart,
  ImageSquare,
  PaperPlaneTilt,
  PlayCircle,
  Plus,
  ShareNetwork,
  ShoppingBagOpen,
  Sparkle,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslation } from "@topup-hub/i18n";
import type { SocialFeedPostDto } from "@topup-hub/types";
import { API_ORIGIN, api, isAuthenticated } from "@/lib/api";

type FeedPost = {
  id: string;
  author: { name: string; handle: string; avatar: string; verified?: boolean };
  body: string;
  media: {
    type: "photo" | "video";
    url: string;
    poster?: string;
    alt: string;
  } | null;
  product?: {
    id: string;
    name: string;
    priceTmt: number;
    image: string;
    sku: string;
  };
  likes: number;
  comments: number;
  createdLabel: string;
  liked: boolean;
  saved: boolean;
};

function assetUrl(url: string | null | undefined) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

function toFeedPost(post: SocialFeedPostDto): FeedPost {
  const product = post.products[0];
  return {
    id: post.id,
    author: {
      name: post.author.fullName || post.author.username,
      handle: post.author.username,
      avatar: (post.author.fullName || post.author.username)
        .slice(0, 1)
        .toUpperCase(),
    },
    body: post.body || "",
    media: post.mediaUrl
      ? {
          type: post.mediaType === "VIDEO" ? "video" : "photo",
          url: assetUrl(post.mediaUrl),
          poster: assetUrl(post.thumbnailUrl) || undefined,
          alt: post.body || "Публикация",
        }
      : null,
    product: product
      ? {
          id: product.id,
          name: product.name,
          priceTmt: product.priceTmt,
          image: assetUrl(product.imageUrl),
          sku: product.sku,
        }
      : undefined,
    likes: post.likeCount,
    comments: post.commentCount,
    liked: post.viewer?.liked ?? false,
    saved: post.viewer?.saved ?? false,
    createdLabel: new Intl.RelativeTimeFormat("ru", { numeric: "auto" }).format(
      Math.round((new Date(post.createdAt).getTime() - Date.now()) / 60_000),
      "minute",
    ),
  };
}

function ActionButton({
  label,
  children,
  active,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${active ? "text-rose-500" : "text-slate-500 hover:bg-white/70 hover:text-slate-900"}`}
    >
      {children}
    </button>
  );
}

export function CommerceFeed() {
  const { t } = useTranslation();
  const [liked, setLiked] = useState<Set<string>>(() => new Set());
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [reported, setReported] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [mediaType, setMediaType] = useState<"TEXT" | "IMAGE" | "VIDEO">(
    "TEXT",
  );
  const [uploading, setUploading] = useState<"media" | "thumbnail" | null>(
    null,
  );
  const [showComposer, setShowComposer] = useState(false);
  const [published, setPublished] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  // The API pages this feed. Keeping the cursor is what lets the page continue past the first
  // twelve posts; without it the list simply ended and looked like the whole feed.
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function rememberFlags(nextPosts: FeedPost[]) {
    setLiked((current) => {
      const next = new Set(current);
      for (const post of nextPosts) if (post.liked) next.add(post.id);
      return next;
    });
    setSaved((current) => {
      const next = new Set(current);
      for (const post of nextPosts) if (post.saved) next.add(post.id);
      return next;
    });
  }

  async function loadFeed() {
    setLoading(true);
    setError(null);
    try {
      const page = isAuthenticated()
        ? await api.listMySocialFeed()
        : await api.listSocialFeed();
      const nextPosts = page.items.map(toFeedPost);
      setPosts(nextPosts);
      setCursor(page.nextCursor ?? null);
      setLiked(
        new Set(nextPosts.filter((post) => post.liked).map((post) => post.id)),
      );
      setSaved(
        new Set(nextPosts.filter((post) => post.saved).map((post) => post.id)),
      );
    } catch {
      setError("Не удалось загрузить ленту. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = isAuthenticated()
        ? await api.listMySocialFeed(cursor)
        : await api.listSocialFeed(cursor);
      const nextPosts = page.items.map(toFeedPost);
      // A post edited between two requests can come back on both pages, and the same article
      // appearing twice in a scrolling list reads as a bug.
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...nextPosts.filter((post) => !seen.has(post.id))];
      });
      rememberFlags(nextPosts);
      setCursor(page.nextCursor ?? null);
    } catch {
      // What is already on screen keeps working; the button stays and can be pressed again.
      setError("Не удалось загрузить ещё. Попробуйте ещё раз.");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void loadFeed();
  }, []);

  async function requireSession() {
    if (isAuthenticated()) return true;
    window.location.assign("/login");
    return false;
  }

  async function toggleLike(post: FeedPost) {
    if (!(await requireSession())) return;
    const active = !liked.has(post.id);
    setLiked((value) => {
      const next = new Set(value);
      active ? next.add(post.id) : next.delete(post.id);
      return next;
    });
    try {
      await api.likeSocialPost(post.id, active);
    } catch {
      await loadFeed();
      setError("Не удалось сохранить лайк.");
    }
  }

  async function toggleSave(post: FeedPost) {
    if (!(await requireSession())) return;
    const active = !saved.has(post.id);
    setSaved((value) => {
      const next = new Set(value);
      active ? next.add(post.id) : next.delete(post.id);
      return next;
    });
    try {
      await api.saveSocialPost(post.id, active);
    } catch {
      await loadFeed();
      setError("Не удалось сохранить публикацию.");
    }
  }

  async function report(post: FeedPost) {
    if (!(await requireSession())) return;
    try {
      await api.reportSocialPost(post.id, { reason: "Пожалоба из web-ленты" });
      setReported(post.id);
    } catch {
      setError("Не удалось отправить жалобу.");
    }
  }

  async function openProduct(post: FeedPost) {
    if (isAuthenticated()) {
      void api.recordSocialProductClick(post.id).catch(() => {});
    }
  }

  async function share(post: FeedPost) {
    const text = `${post.author.name}: ${post.body}`;
    try {
      await navigator.share?.({ title: "Gulyaly", text });
    } catch {
      await navigator.clipboard?.writeText(
        `${window.location.origin}/feed#${post.id}`,
      );
    }
  }

  async function uploadFeedMedia(file: File, target: "media" | "thumbnail") {
    if (!(await requireSession())) return;
    setUploading(target);
    setError(null);
    try {
      const result = await api.uploadMedia(file);
      if (target === "thumbnail") {
        if (result.mediaType !== "IMAGE") {
          setError("Обложка для видео должна быть картинкой.");
          return;
        }
        setThumbnailUrl(result.url);
        return;
      }
      setMediaUrl(result.url);
      setMediaType(result.mediaType);
      if (result.mediaType === "IMAGE") setThumbnailUrl("");
    } catch {
      setError("Не удалось загрузить файл.");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#edf5f7] pb-24 pt-5 dark:bg-[#07131d]">
      <section className="mx-auto max-w-6xl px-4">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
              Gulyaly / commerce
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#102f43] dark:text-[#e9f8ff] sm:text-3xl">
              {t("web.feed.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t("web.feed.subtitle")}
            </p>
          </div>
          <button
            onClick={() => setShowComposer((v) => !v)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#0d4661] px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_30px_-16px_#0d4661] transition hover:bg-[#0c5a7a] focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <Plus size={18} weight="bold" />
            {t("web.feed.create")}
          </button>
        </div>

        {showComposer && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!isAuthenticated()) {
                window.location.assign("/login");
                return;
              }
              void api
                .createSocialPost({
                  mediaType,
                  body: draft.trim() || undefined,
                  mediaUrl: mediaType === "TEXT" ? undefined : mediaUrl.trim(),
                  thumbnailUrl:
                    mediaType === "VIDEO" ? thumbnailUrl.trim() : undefined,
                  productIds: [],
                })
                .then(() => {
                  setPublished(true);
                  setDraft("");
                  setMediaUrl("");
                  setThumbnailUrl("");
                  setMediaType("TEXT");
                  setShowComposer(false);
                  void loadFeed();
                })
                .catch(() => setError("Не удалось отправить публикацию."));
            }}
            className="mb-5 rounded-[1.5rem] border border-white/80 bg-white/70 p-4 shadow-[0_18px_44px_-30px_rgba(8,48,71,.55)] backdrop-blur-xl dark:border-cyan-100/10 dark:bg-[#0a2130]/85"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1500}
              placeholder={t("web.feed.placeholder")}
              className="min-h-24 w-full resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3 dark:border-white/10">
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={uploading !== null}
                  onClick={() =>
                    document.getElementById("feed-media-input")?.click()
                  }
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50 dark:text-slate-300"
                >
                  <ImageSquare size={17} />
                  {uploading === "media"
                    ? "Загрузка..."
                    : t("web.feed.addMedia")}
                </button>
                <input
                  id="feed-media-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void uploadFeedMedia(file, "media");
                  }}
                />
                {mediaType === "VIDEO" && (
                  <>
                    <button
                      type="button"
                      disabled={uploading !== null}
                      onClick={() =>
                        document.getElementById("feed-thumbnail-input")?.click()
                      }
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50 dark:text-slate-300"
                    >
                      <ImageSquare size={17} />
                      {uploading === "thumbnail" ? "Загрузка..." : "Обложка"}
                    </button>
                    <input
                      id="feed-thumbnail-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void uploadFeedMedia(file, "thumbnail");
                      }}
                    />
                  </>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50 dark:text-slate-300"
                >
                  <ShoppingBagOpen size={17} />
                  {t("web.feed.tagProduct")}
                </button>
              </div>
              <button
                className="rounded-full bg-cyan-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                disabled={
                  uploading !== null ||
                  (mediaType === "TEXT" && !draft.trim()) ||
                  (mediaType !== "TEXT" && !mediaUrl) ||
                  (mediaType === "VIDEO" && !thumbnailUrl)
                }
              >
                {t("web.feed.publish")}
              </button>
            </div>
            {mediaUrl && (
              <p className="mt-2 truncate text-xs text-cyan-700 dark:text-cyan-300">
                Media: {mediaUrl}
              </p>
            )}
            {mediaType === "VIDEO" && !thumbnailUrl && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                Для видео нужна обложка перед публикацией.
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t("web.feed.draftNotice")} {t("web.feed.mediaHint")}
            </p>
          </form>
        )}
        {published && (
          <p
            role="status"
            className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900"
          >
            {t("web.feed.draftNotice")}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {error}
          </p>
        )}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,620px)_220px] lg:justify-center">
          <div className="max-h-[calc(100vh-9rem)] space-y-5 overflow-y-auto pr-1 snap-y snap-mandatory">
            {loading && (
              <p className="rounded-2xl border border-white/80 bg-white/70 px-4 py-8 text-center text-sm text-slate-500 dark:border-cyan-100/10 dark:bg-[#0a2130]/85 dark:text-slate-300">
                Лента загружается...
              </p>
            )}
            {!loading && posts.length === 0 && (
              <p className="rounded-2xl border border-white/80 bg-white/70 px-4 py-8 text-center text-sm text-slate-500 dark:border-cyan-100/10 dark:bg-[#0a2130]/85 dark:text-slate-300">
                Пока нет опубликованных постов. Создайте первый пост, и
                модератор выпустит его в ленту.
              </p>
            )}
            {posts.map((post) => (
              <article
                id={post.id}
                key={post.id}
                className="snap-start overflow-hidden rounded-[1.6rem] border border-white/90 bg-white/75 shadow-[0_22px_55px_-38px_rgba(8,48,71,.7)] backdrop-blur-xl dark:border-cyan-100/10 dark:bg-[#0a1c28]/90"
              >
                <header className="flex items-center gap-3 px-4 pb-3 pt-4">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-cyan-200 to-blue-200 text-sm font-extrabold text-[#0c4260]">
                    {post.author.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#143b51] dark:text-white">
                      {post.author.name}
                      {post.author.verified && (
                        <span
                          className="ml-1 text-cyan-500"
                          aria-label="Проверенный автор"
                        >
                          ✦
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      @{post.author.handle} · {post.createdLabel}
                    </p>
                  </div>
                  <button
                    aria-label="Открыть действия публикации"
                    className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                  >
                    <DotsThree size={21} weight="bold" />
                  </button>
                </header>
                <p className="px-4 pb-4 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  {post.body}
                </p>
                {post.media?.type === "photo" && (
                  <img
                    src={post.media.url}
                    alt={post.media.alt}
                    className="aspect-[4/5] w-full object-cover"
                  />
                )}
                {post.media?.type === "video" && (
                  <div className="relative aspect-[4/5] bg-[#102d3e]">
                    <video
                      className="h-full w-full object-cover"
                      controls
                      playsInline
                      preload="metadata"
                      poster={post.media.poster}
                    >
                      <source src={post.media.url} type="video/mp4" />
                    </video>
                    <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 text-[10px] font-bold text-white">
                      <PlayCircle size={14} weight="fill" />
                      video
                    </span>
                  </div>
                )}
                {post.product && (
                  <div className="relative mx-3 my-3 overflow-hidden rounded-2xl border border-cyan-100 bg-gradient-to-r from-white to-cyan-50 p-2.5 dark:border-cyan-100/10 dark:from-[#102a3a] dark:to-[#0b2130]">
                    <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-cyan-300 via-blue-500 to-violet-400" />
                    <div className="flex gap-3 pl-1">
                      <img
                        src={post.product.image}
                        alt=""
                        className="h-16 w-16 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                          {t("web.feed.product")}
                        </p>
                        <p className="truncate text-sm font-bold text-[#153f56] dark:text-white">
                          {post.product.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {post.product.sku}
                        </p>
                      </div>
                      <div className="flex flex-col items-end justify-between">
                        <span className="text-sm font-extrabold text-[#0d4661] dark:text-cyan-200">
                          {post.product.priceTmt} TMT
                        </span>
                        <Link
                          href={`/gallery?search=${encodeURIComponent(post.product.sku)}`}
                          onClick={() => void openProduct(post)}
                          className="rounded-full bg-[#0d4661] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0c5a7a]"
                        >
                          {t("web.feed.order")}
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
                <footer className="flex items-center gap-1 border-t border-slate-100 px-3 py-2 dark:border-white/10">
                  <ActionButton
                    label={t("web.feed.like")}
                    active={liked.has(post.id)}
                    onClick={() => void toggleLike(post)}
                  >
                    <Heart
                      size={18}
                      weight={liked.has(post.id) ? "fill" : "regular"}
                    />
                    {post.likes + (liked.has(post.id) ? 1 : 0)}
                  </ActionButton>
                  <ActionButton label={t("web.feed.comment")}>
                    <ChatCircle size={18} />
                    {post.comments}
                  </ActionButton>
                  <ActionButton
                    label={t("web.feed.save")}
                    active={saved.has(post.id)}
                    onClick={() => void toggleSave(post)}
                  >
                    <BookmarkSimple
                      size={18}
                      weight={saved.has(post.id) ? "fill" : "regular"}
                    />
                  </ActionButton>
                  <ActionButton
                    label={t("web.feed.share")}
                    onClick={() => share(post)}
                  >
                    <ShareNetwork size={18} />
                  </ActionButton>
                  <button
                    onClick={() => void report(post)}
                    className="ml-auto rounded-full px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:text-rose-500"
                  >
                    {reported === post.id
                      ? t("web.feed.reported")
                      : t("web.feed.report")}
                  </button>
                </footer>
              </article>
            ))}
            {cursor && (
              <button
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="mt-2 w-full rounded-full border border-cyan-200/80 bg-white/70 px-4 py-3 text-sm font-bold text-[#0d4661] transition hover:bg-white disabled:opacity-50 dark:border-cyan-100/10 dark:bg-[#0a2130]/85 dark:text-[#e9f8ff]"
              >
                {loadingMore ? "Загружаем…" : "Показать ещё"}
              </button>
            )}
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-[1.5rem] border border-white/90 bg-white/65 p-5 shadow-[0_18px_44px_-32px_rgba(8,48,71,.55)] backdrop-blur-xl dark:border-cyan-100/10 dark:bg-[#0a1c28]/90">
              <Sparkle size={22} className="mb-3 text-cyan-500" weight="fill" />
              <p className="text-sm font-bold text-[#143b51] dark:text-white">
                Спокойный шопинг
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                Лента подстраивается под сохранения, заказы и темы, которые вы
                выбираете. Реклама и рекомендации всегда отмечены.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
