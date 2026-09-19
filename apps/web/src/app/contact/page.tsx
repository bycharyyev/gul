import type { Metadata } from "next";
import type { SocialLinkDto } from "@topup-hub/types";
import { InfoArticle, SectionTitle } from "@/components/info-article";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.gulyaly.com/api";

export const metadata: Metadata = {
  title: "Контакты",
  description: "Как связаться с поддержкой Gulyaly: почта и социальные сети.",
  alternates: { canonical: "/contact" },
};

async function fetchSocialLinks(): Promise<SocialLinkDto[]> {
  try {
    const res = await fetch(`${API_URL}/social-links`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const links = (await res.json()) as SocialLinkDto[];
    return links.filter((link) => link.isEnabled && /^https?:\/\//i.test(link.url));
  } catch {
    return [];
  }
}

export default async function ContactPage() {
  const links = await fetchSocialLinks();

  return (
    <InfoArticle title="Контакты">
      <p>Мы отвечаем на письма и сообщения в рабочее время. Если вопрос про заказ, сразу укажите его номер.</p>

      <SectionTitle>Поддержка</SectionTitle>
      <p>
        Почта:{" "}
        <a href="mailto:support@gulyaly.com" className="text-brand-600 underline dark:text-brand-300">
          support@gulyaly.com
        </a>
      </p>

      {links.length > 0 && (
        <>
          <SectionTitle>Мы в социальных сетях</SectionTitle>
          <ul className="space-y-1">
            {links.map((link) => (
              <li key={link.id}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 underline dark:text-brand-300"
                >
                  {link.label || link.platform}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Стать продавцом или партнёром</SectionTitle>
      <p>
        Хотите продавать в галерее или предложить сотрудничество — оставьте заявку на странице «Стать продавцом» или
        напишите нам на ту же почту.
      </p>
    </InfoArticle>
  );
}
