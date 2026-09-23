import type { Metadata } from "next";
import { InfoArticle, fetchContentPage, renderBody } from "@/components/info-article";

export const metadata: Metadata = {
  title: "Условия использования и оферта",
  description: "Публичная оферта и условия использования сервиса Gulyaly.",
  alternates: { canonical: "/terms" },
};

// The terms of service are the published offer (edited in the admin Content Pages editor under
// the "offer" slug) -- one source of truth, no second copy to keep in sync.
export default async function TermsPage() {
  const page = await fetchContentPage("offer");
  return (
    <InfoArticle title={page?.title ?? "Условия использования"}>
      {page ? (
        renderBody(page.body)
      ) : (
        <p>Текст условий временно недоступен. Напишите нам на support@gulyaly.com, и мы пришлём его вручную.</p>
      )}
    </InfoArticle>
  );
}
