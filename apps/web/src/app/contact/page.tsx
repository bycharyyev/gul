import type { Metadata } from "next";
import type { SocialLinkDto } from "@topup-hub/types";
import { ContactContent } from "@/components/contact-content";

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
  return <ContactContent links={await fetchSocialLinks()} />;
}
