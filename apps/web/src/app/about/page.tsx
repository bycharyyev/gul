import type { Metadata } from "next";
import { AboutContent } from "@/components/about-content";

export const metadata: Metadata = {
  title: "О компании",
  description:
    "Gulyaly — сервис пополнения мобильных операторов и цифровых сервисов, маркетплейс продавцов и доставка карго. Ашхабад, Туркменистан.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return <AboutContent />;
}
