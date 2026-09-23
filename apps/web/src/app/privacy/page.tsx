import type { Metadata } from "next";
import { InfoArticle, fetchContentPage, renderBody } from "@/components/info-article";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
  description: "Какие данные Gulyaly собирает, зачем они нужны и как мы их защищаем.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const page = await fetchContentPage("privacy");
  return (
    <InfoArticle title={page?.title ?? "Политика конфиденциальности"}>
      {page ? (
        renderBody(page.body)
      ) : (
        <p>Текст политики временно недоступен. Напишите нам на support@gulyaly.com, и мы пришлём его вручную.</p>
      )}
    </InfoArticle>
  );
}
