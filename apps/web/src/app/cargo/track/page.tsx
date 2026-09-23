"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@topup-hub/i18n";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function TrackSearchPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    router.push(`/cargo/track/${encodeURIComponent(value.trim())}`);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-8">
        <h1 className="mb-4 text-xl font-bold">{t("web.cargo.trackTitle")}</h1>
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("web.cargo.trackPlaceholder")}
            className="flex-1"
          />
          <Button type="submit">{t("web.cargo.trackSubmit")}</Button>
        </form>
      </Card>
    </div>
  );
}
