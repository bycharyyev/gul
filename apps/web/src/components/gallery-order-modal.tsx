"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GalleryProductDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api, isAuthenticated } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function GalleryOrderModal({ product, onClose }: { product: GalleryProductDto; onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [cardMessage, setCardMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createGalleryOrder({
        productId: product.id,
        recipientName,
        recipientPhone,
        deliveryCity,
        deliveryAddress,
        cardMessage: cardMessage || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.galleryOrderModal.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("web.galleryOrderModal.dialogAriaLabel", { name: product.name })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto bg-white/90 p-6 backdrop-blur-xl dark:bg-black/70">
        {!done && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{product.name}</h2>
              <button
                onClick={onClose}
                aria-label={t("web.galleryOrderModal.closeAriaLabel")}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              >
                ×
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {t("web.galleryOrderModal.skuLabel", { sku: product.sku })}{" "}
              <span className="font-semibold text-slate-900 dark:text-white">{product.priceTmt} TMT</span>
            </p>

            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {t("web.galleryOrderModal.recipientNameLabel")}
                </label>
                <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {t("web.galleryOrderModal.recipientPhoneLabel")}
                </label>
                <Input
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="+993 6X XXX XXX"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {t("web.galleryOrderModal.deliveryCityLabel")}
                </label>
                <Input value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {t("web.galleryOrderModal.deliveryAddressLabel")}
                </label>
                <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {t("web.galleryOrderModal.cardMessageLabel")}
                </label>
                <Input value={cardMessage} onChange={(e) => setCardMessage(e.target.value)} />
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <Button className="w-full" type="submit" disabled={submitting}>
                {submitting
                  ? t("web.galleryOrderModal.submitting")
                  : t("web.galleryOrderModal.payButton", { price: product.priceTmt })}
              </Button>
            </form>
          </>
        )}

        {done && (
          <div className="py-6 text-center">
            <p className="text-lg font-semibold">{t("web.galleryOrderModal.successTitle")}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t("web.galleryOrderModal.successBody", { name: product.name })}
            </p>
            <Button className="mt-6" onClick={onClose}>
              {t("web.galleryOrderModal.doneButton")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
