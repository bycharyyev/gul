"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { OrderStatus } from "@topup-hub/types";
import { api, isAuthenticated } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "gulyaly.pendingPaymentOrderId";
const FINISHED = new Set<OrderStatus>(["PAID", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED", "CANCELLED"]);

export function PaymentReturnClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [message, setMessage] = useState("Проверяем статус оплаты…");

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login?next=/payment/return");
      return;
    }

    // A query value is useful for explicitly configured provider return URLs; the session value
    // is the normal browser flow. It is only a locator: GET /orders/:id checks ownership.
    const orderId = searchParams.get("orderId") ?? window.sessionStorage.getItem(STORAGE_KEY);
    if (!orderId) {
      setMessage("Не удалось определить заказ. Откройте историю заказов в личном кабинете.");
      return;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const poll = async () => {
      try {
        const order = await api.getOrder(orderId);
        if (stopped) return;
        const next = order.status as OrderStatus;
        setStatus(next);
        if (FINISHED.has(next)) {
          window.sessionStorage.removeItem(STORAGE_KEY);
          setMessage(
            next === "PAID" || next === "PROCESSING" || next === "COMPLETED"
              ? "Оплата подтверждена. Заказ принят в обработку."
              : next === "FAILED"
                ? "Оплата не завершена. Заказ требует проверки."
                : "Оплата не была завершена.",
          );
          return;
        }
        attempts += 1;
        if (attempts >= 40) {
          setMessage("Подтверждение ещё не поступило. Статус можно проверить в личном кабинете.");
          return;
        }
        timer = setTimeout(poll, 3000);
      } catch {
        if (!stopped) setMessage("Не удалось проверить оплату. Откройте заказ в личном кабинете.");
      }
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [router, searchParams]);

  return (
    <Card className="mx-auto mt-16 max-w-lg space-y-5 p-8 text-center">
      <h1 className="text-2xl font-bold">Возврат после оплаты</h1>
      <p className="text-sm text-slate-600" role="status">{message}</p>
      {status && <p className="font-mono text-xs text-slate-400">{status}</p>}
      <Button className="w-full" onClick={() => router.push("/account")}>Открыть мои заказы</Button>
    </Card>
  );
}
