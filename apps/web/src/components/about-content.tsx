"use client";

import Link from "next/link";
import { useTranslation } from "@topup-hub/i18n";
import { InfoArticle, SectionTitle } from "@/components/info-article";
import { withSlots } from "@/components/rich-text";

const linkClass = "text-brand-600 underline dark:text-brand-300";

export function AboutContent() {
  const { t } = useTranslation();

  return (
    <InfoArticle title={t("web.about.title")}>
      <p>{t("web.about.intro")}</p>

      <SectionTitle>{t("web.about.whatTitle")}</SectionTitle>
      <p>
        <strong>{t("web.about.topupLead")}</strong>{" "}
        {withSlots(t("web.about.topup"), {
          link: (
            <Link href="/track" className={linkClass}>
              {t("web.about.topupLink")}
            </Link>
          ),
        })}
      </p>
      <p>
        <strong>{t("web.about.galleryLead")}</strong>{" "}
        {withSlots(t("web.about.gallery"), {
          link: (
            <Link href="/gallery" className={linkClass}>
              {t("web.about.galleryLink")}
            </Link>
          ),
        })}
      </p>
      <p>
        <strong>{t("web.about.cargoLead")}</strong>{" "}
        {withSlots(t("web.about.cargo"), {
          link: (
            <Link href="/cargo" className={linkClass}>
              {t("web.about.cargoLink")}
            </Link>
          ),
        })}
      </p>
      <p>
        <strong>{t("web.about.sellerLead")}</strong>{" "}
        {withSlots(t("web.about.seller"), {
          link: (
            <Link href="/become-seller" className={linkClass}>
              {t("web.about.sellerLink")}
            </Link>
          ),
        })}
      </p>

      <SectionTitle>{t("web.about.dataTitle")}</SectionTitle>
      <p>
        {withSlots(t("web.about.data"), {
          link: (
            <Link href="/privacy" className={linkClass}>
              {t("web.about.dataLink")}
            </Link>
          ),
          link2: (
            <Link href="/terms" className={linkClass}>
              {t("web.about.dataLink2")}
            </Link>
          ),
        })}
      </p>

      <SectionTitle>{t("web.about.contactTitle")}</SectionTitle>
      <p>
        {withSlots(t("web.about.contact"), {
          link: (
            <Link href="/contact" className={linkClass}>
              {t("web.about.contactLink")}
            </Link>
          ),
        })}
      </p>
    </InfoArticle>
  );
}
