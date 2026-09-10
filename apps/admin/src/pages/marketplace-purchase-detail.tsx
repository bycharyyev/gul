import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  adminPurchaseApi,
  type AdminPurchaseOrder,
} from "@/lib/marketplace-purchase-api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
const statuses = [
  "MANUAL_REVIEW",
  "QUOTED",
  "AUTHORIZATION_PENDING",
  "AUTHORIZED",
  "PURCHASING",
  "PURCHASED",
  "AT_WAREHOUSE",
  "FINAL_PAYMENT_DUE",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
];
type Review = {
  title: string;
  externalId: string;
  imageUrl: string;
  unitPriceTmt: string;
  estimatedWeightKg: string;
};
export default function MarketplacePurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<AdminPurchaseOrder | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [actualWeight, setActualWeight] = useState("");
  const [next, setNext] = useState("");
  const [reason, setReason] = useState("");
  const [fundingRef, setFundingRef] = useState("");
  const [refundRef, setRefundRef] = useState("");
  const [error, setError] = useState("");
  const load = () =>
    id
      ? adminPurchaseApi
          .one(id)
          .then((v) => {
            setOrder(v);
            setReviews(
              Object.fromEntries(
                v.items.map((i) => [
                  i.id,
                  {
                    title: i.titleSnapshot ?? "",
                    externalId: "",
                    imageUrl: i.imageUrlSnapshot ?? "",
                    unitPriceTmt: String(i.unitPriceSnapshot ?? ""),
                    estimatedWeightKg: String(i.estimatedWeightKg ?? ""),
                  },
                ]),
              ),
            );
          })
          .catch((e) => setError(e.message))
      : Promise.resolve();
  useEffect(() => {
    void load();
  }, [id]);
  const quote = useMemo(() => order?.quotes.at(-1), [order]);
  if (!order)
    return <p className="text-sm text-slate-400">{error || "Загрузка…"}</p>;
  const authorizationRemainder = Math.max(
    0,
    Number(order.maxAuthorizedTmt ?? 0) - Number(order.authorizedTmt ?? 0),
  );
  const change = (itemId: string, key: keyof Review, value: string) =>
    setReviews((all) => ({
      ...all,
      [itemId]: { ...all[itemId]!, [key]: value },
    }));
  async function review() {
    if (!order) return;
    try {
      await adminPurchaseApi.review(order.id, {
        items: order.items.map((i) => ({
          itemId: i.id,
          title: reviews[i.id]!.title,
          externalId: reviews[i.id]!.externalId || undefined,
          imageUrl: reviews[i.id]!.imageUrl || undefined,
          unitPriceTmt: Number(reviews[i.id]!.unitPriceTmt),
          estimatedWeightKg: Number(reviews[i.id]!.estimatedWeightKg),
        })),
        reason: reason || undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/cargo/purchases/orders")}
        className="text-xs font-semibold text-brand-600"
      >
        ← Заказы на выкуп
      </button>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-slate-400">{order.id}</p>
          <h1 className="mt-1 text-2xl font-bold">Карточка выкупа</h1>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
          {order.status}
        </span>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-bold">Снимки товаров</h2>
            <div className="mt-4 space-y-4">
              {order.items.map((item) => {
                const draft = reviews[item.id]!;
                return (
                  <article key={item.id} className="rounded-xl border p-4">
                    <div className="flex gap-3">
                      <div className="h-14 w-14 shrink-0 rounded-lg bg-slate-100">
                        {item.imageUrlSnapshot && (
                          <img
                            src={item.imageUrlSnapshot}
                            alt=""
                            className="h-full w-full rounded-lg object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {item.titleSnapshot || "Непроверенный товар"}
                        </p>
                        <a
                          className="block truncate text-xs text-brand-600"
                          href={item.canonicalUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть оригинал ↗
                        </a>
                        <p className="text-xs text-slate-500">
                          {item.variant || "Без варианта"} · {item.quantity} шт
                        </p>
                        {(item.reportedTitle || item.reportedPrice) && (
                          // Read in the customer's own browser, off the page they confirmed.
                          // Ozon and Yandex refuse a server-side read, so for those this is the
                          // only price that exists before someone opens the shop by hand. It is
                          // labelled rather than merged into the fields above, because nobody
                          // has checked it and the quote below is still entered by a person.
                          <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                            <span className="font-semibold">С сайта магазина</span>
                            {item.reportedPrice
                              ? ` · ${item.reportedPrice} ${item.reportedCurrency ?? ""}`
                              : ""}
                            {item.reportedTitle ? ` · ${item.reportedTitle}` : ""}
                            {item.reportedSource ? ` · читал ${item.reportedSource}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    {order.status === "MANUAL_REVIEW" && draft && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <Input
                          placeholder="Название"
                          value={draft.title}
                          onChange={(e) =>
                            change(item.id, "title", e.target.value)
                          }
                        />
                        <Input
                          placeholder="Внешний ID"
                          value={draft.externalId}
                          onChange={(e) =>
                            change(item.id, "externalId", e.target.value)
                          }
                        />
                        <Input
                          type="number"
                          placeholder="Цена за шт., TMT"
                          value={draft.unitPriceTmt}
                          onChange={(e) =>
                            change(item.id, "unitPriceTmt", e.target.value)
                          }
                        />
                        <Input
                          type="number"
                          placeholder="Вес за шт., кг"
                          value={draft.estimatedWeightKg}
                          onChange={(e) =>
                            change(item.id, "estimatedWeightKg", e.target.value)
                          }
                        />
                        <Input
                          className="sm:col-span-2"
                          placeholder="HTTPS изображения (необязательно)"
                          value={draft.imageUrl}
                          onChange={(e) =>
                            change(item.id, "imageUrl", e.target.value)
                          }
                        />
                      </div>
                    )}
                    {item.snapshotPayload && (
                      <details className="mt-3 text-xs">
                        <summary>Исходный снимок</summary>
                        <pre className="mt-2 overflow-auto rounded bg-slate-50 p-3">
                          {JSON.stringify(item.snapshotPayload, null, 2)}
                        </pre>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
            {order.status === "MANUAL_REVIEW" && (
              <>
                <Input
                  className="mt-3"
                  placeholder="Основание проверки"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Button className="mt-3" onClick={review}>
                  Создать котировку
                </Button>
              </>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="font-bold">Версии котировки</h2>
            <div className="mt-3 space-y-2">
              {order.quotes.map((q) => (
                <div
                  key={q.version}
                  className="grid grid-cols-4 gap-2 rounded-lg bg-slate-50 p-3 text-xs"
                >
                  <b>v{q.version}</b>
                  <span>{Number(q.productSubtotalTmt).toFixed(2)} товар</span>
                  <span>{Number(q.shippingTmt).toFixed(2)} доставка</span>
                  <strong>{Number(q.totalTmt).toFixed(2)} TMT</strong>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="bg-slate-950 p-5 text-white">
              <p className="text-xs uppercase tracking-widest text-slate-400">
                Денежный коридор
              </p>
              <p className="mt-3 text-2xl font-bold">
                {quote
                  ? `${Number(quote.totalTmt).toFixed(2)} TMT`
                  : "Нет котировки"}
              </p>
            </div>
            <dl className="space-y-2 p-5 text-sm">
              <div className="flex justify-between">
                <dt>Максимум</dt>
                <dd>
                  {order.maxAuthorizedTmt
                    ? Number(order.maxAuthorizedTmt).toFixed(2)
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Авторизовано</dt>
                <dd>{Number(order.authorizedTmt).toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Списано</dt>
                <dd>{Number(order.settledTmt).toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Возврат в ledger</dt>
                <dd>{Number(order.refundedTmt).toFixed(2)}</dd>
              </div>
            </dl>
          </Card>
          {order.status === "AUTHORIZATION_PENDING" && (
            <Card className="space-y-3 p-5">
              <h2 className="font-bold">Подтверждение резерва</h2>
              <p className="text-xs leading-5 text-slate-500">
                Нужно подтвердить только недостающую часть резерва:{" "}
                <b>{authorizationRemainder.toFixed(2)} TMT</b>. Уже удержано:{" "}
                {Number(order.authorizedTmt).toFixed(2)} TMT.
              </p>
              <Input
                placeholder="Reference платёжной системы"
                value={fundingRef}
                onChange={(e) => setFundingRef(e.target.value)}
              />
              <Button
                className="w-full"
                disabled={fundingRef.length < 8 || !order.maxAuthorizedTmt}
                onClick={() =>
                  adminPurchaseApi
                    .confirmAuthorization(order.id, {
                      externalReference: fundingRef,
                      amountTmt: authorizationRemainder,
                    })
                    .then(setOrder)
                    .catch((e) => setError(e.message))
                }
              >
                Подтвердить по платёжному факту
              </Button>
            </Card>
          )}
          {order.status === "REFUND_PENDING" && (
            <Card className="space-y-3 p-5">
              <h2 className="font-bold">Подтверждение возврата</h2>
              <Input
                placeholder="Reference возврата"
                value={refundRef}
                onChange={(e) => setRefundRef(e.target.value)}
              />
              <Button
                className="w-full"
                disabled={refundRef.length < 8}
                onClick={() =>
                  adminPurchaseApi
                    .confirmRefund(order.id, { externalReference: refundRef })
                    .then(setOrder)
                    .catch((e) => setError(e.message))
                }
              >
                Возврат выполнен
              </Button>
            </Card>
          )}
          {["PURCHASED", "AT_WAREHOUSE"].includes(order.status) && (
            <Card className="space-y-3 p-5">
              <h2 className="font-bold">Вес на складе</h2>
              <Input
                type="number"
                step="0.001"
                min="0.001"
                value={actualWeight}
                onChange={(e) => setActualWeight(e.target.value)}
              />
              <Button
                className="w-full"
                disabled={!actualWeight}
                onClick={() =>
                  adminPurchaseApi
                    .actualWeight(order.id, Number(actualWeight))
                    .then(load)
                    .catch((e) => setError(e.message))
                }
              >
                Зафиксировать и пересчитать
              </Button>
            </Card>
          )}
          <Card className="space-y-3 p-5">
            <h2 className="font-bold">Следующий этап</h2>
            <Select value={next} onChange={(e) => setNext(e.target.value)}>
              <option value="">Выберите статус</option>
              {statuses
                .filter((s) => s !== order.status)
                .map((s) => (
                  <option key={s}>{s}</option>
                ))}
            </Select>
            <Input
              placeholder="Основание изменения"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              className="w-full"
              disabled={!next || reason.trim().length < 5}
              onClick={() =>
                adminPurchaseApi
                  .status(order.id, next, reason)
                  .then(setOrder)
                  .catch((e) => setError(e.message))
              }
            >
              Применить переход
            </Button>
            {error && (
              <p role="alert" className="text-xs text-rose-600">
                {error}
              </p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
