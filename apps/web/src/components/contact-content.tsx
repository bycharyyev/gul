"use client";

import type { SocialLinkDto } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { InfoArticle, SectionTitle } from "@/components/info-article";

export function ContactContent({ links }: { links: SocialLinkDto[] }) {
  const { t } = useTranslation();

  return (
    <InfoArticle title={t("web.contact.title")}>
      <p>{t("web.contact.intro")}</p>

      <SectionTitle>{t("web.contact.supportTitle")}</SectionTitle>
      <p>
        {t("web.contact.emailLabel")}{" "}
        <a href="mailto:support@gulyaly.com" className="text-brand-600 underline dark:text-brand-300">
          support@gulyaly.com
        </a>
      </p>

      {links.length > 0 && (
        <>
          <SectionTitle>{t("web.contact.socialTitle")}</SectionTitle>
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

      <SectionTitle>{t("web.contact.partnerTitle")}</SectionTitle>
      <p>{t("web.contact.partner")}</p>
    </InfoArticle>
  );
}
