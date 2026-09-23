import { Suspense } from "react";
import { PaymentReturnClient } from "./payment-return-client";

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-slate-500">Проверяем статус оплаты…</p>}>
      <PaymentReturnClient />
    </Suspense>
  );
}
