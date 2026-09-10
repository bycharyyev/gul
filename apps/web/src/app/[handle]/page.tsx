"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import type { GalleryProductDto, SellerDto, SupportMessageDto } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api, isAuthenticated } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { GalleryOrderModal } from "@/components/gallery-order-modal";
import { cn } from "@/lib/utils";

const POLL_MS = 4000;

export default function SellerStorefrontPage() {
  const { t } = useTranslation();
  const params = useParams<{ handle: string }>();
  const rawHandle = params.handle ? decodeURIComponent(params.handle) : params.handle;

  if (!rawHandle || !rawHandle.startsWith("@")) {
    notFound();
  }

  const handle = rawHandle.slice(1);
  const [seller, setSeller] = useState<SellerDto | null>(null);
  const [notFoundState, setNotFoundState] = useState(false);
  const [products, setProducts] = useState<GalleryProductDto[]>([]);
  const [orderingProduct, setOrderingProduct] = useState<GalleryProductDto | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  /** Null is "all products" — the shop as a whole, which is what a first visit should show. */
  const [sectionId, setSectionId] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSellerByHandle(handle)
      .then((s) => {
        setSeller(s);
        api.listGalleryProducts({ sellerId: s.id }).then(setProducts).catch(() => {});
      })
      .catch(() => setNotFoundState(true));
  }, [handle]);

  if (notFoundState) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-lg font-semibold">{t("web.shopPage.notFoundTitle")}</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("web.shopPage.notFoundBody")}</p>
      </div>
    );
  }

  if (!seller) {
    return <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-slate-400">{t("common.loading")}</div>;
  }

  // Filtered here rather than refetched per tab: a shop's whole catalogue is already loaded,
  // and a round trip between tapping a section and seeing it would be a wait for nothing.
  const visible = sectionId
    ? products.filter((product) => product.storefront?.id === sectionId)
    : products;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Card className="mb-8 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-brand text-xl font-bold text-white">
          {seller.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={seller.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            seller.shopName.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{seller.shopName}</h1>
          <p className="text-sm text-brand-600 dark:text-brand-300">@{seller.handle}</p>
          {seller.description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{seller.description}</p>
          )}
        </div>
        <button
          onClick={() => setChatOpen((v) => !v)}
          className="bg-gradient-brand shrink-0 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          {t("web.shopPage.messageSeller")}
        </button>
      </Card>

      {chatOpen && <SellerChatBox sellerId={seller.id} />}

      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase text-slate-500">{t("web.shopPage.productsHeading")}</h2>
      </div>

      {/* Sections come with the shop rather than after it, so this row does not appear late and
          push the products down once they are already being read. */}
      {(seller.storefronts?.length ?? 0) > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {[{ id: null as string | null, name: t("web.shopPage.allProducts") }, ...(seller.storefronts ?? [])].map(
            (section) => (
              <button
                key={section.id ?? "all"}
                onClick={() => setSectionId(section.id)}
                className={cn(
                  "cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium",
                  sectionId === section.id
                    ? "bg-gradient-brand text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-white/70 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10",
                )}
              >
                {section.name}
              </button>
            ),
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((product) => (
          <Card key={product.id} className="flex flex-col overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt={product.name} className="aspect-square w-full object-cover" />
            <div className="flex flex-1 flex-col p-3">
              <p className="text-sm font-semibold leading-snug">{product.name}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{t("web.shopPage.sku", { sku: product.sku })}</p>
              <div className="mt-auto flex items-center justify-between pt-3">
                <span className="text-sm font-bold">{product.priceTmt} TMT</span>
                <button
                  onClick={() => setOrderingProduct(product)}
                  className="bg-gradient-brand cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                >
                  {t("web.shopPage.orderButton")}
                </button>
              </div>
            </div>
          </Card>
        ))}
        {visible.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-slate-400">{t("web.shopPage.emptyProducts")}</p>
        )}
      </div>

      {orderingProduct && <GalleryOrderModal product={orderingProduct} onClose={() => setOrderingProduct(null)} />}
    </div>
  );
}

function SellerChatBox({ sellerId }: { sellerId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [messages, setMessages] = useState<SupportMessageDto[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    function refresh() {
      api
        .getMyThreadWithSeller(sellerId)
        .then(({ messages }) => setMessages(messages))
        .catch(() => {});
    }
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [sellerId, router]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    try {
      const message = await api.sendMessageToSeller(sellerId, { body });
      setMessages((prev) => [...prev, message]);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="mb-8 flex h-80 flex-col overflow-hidden">
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="mt-4 text-center text-xs text-slate-400">{t("web.shopPage.chatEmpty")}</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.senderRole === "CUSTOMER" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[75%] rounded-xl2 px-3 py-2 text-sm",
                m.senderRole === "CUSTOMER"
                  ? "bg-gradient-brand text-white"
                  : "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-slate-100",
              )}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 border-t border-slate-200/70 p-2 dark:border-white/10"
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
          placeholder={t("web.shopPage.messagePlaceholder")}
          className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="bg-gradient-brand flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white disabled:opacity-40"
          aria-label={t("web.shopPage.sendAriaLabel")}
        >
          →
        </button>
      </form>
    </Card>
  );
}
