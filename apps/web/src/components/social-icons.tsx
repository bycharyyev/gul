"use client";

import { useEffect, useState } from "react";
import {
  FacebookLogo,
  Globe,
  InstagramLogo,
  TelegramLogo,
  TiktokLogo,
  WhatsappLogo,
  X,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { SocialLinkDto, SocialPlatform } from "@topup-hub/types";
import { api } from "@/lib/api";

const PLATFORM_ICON: Record<SocialPlatform, typeof InstagramLogo> = {
  INSTAGRAM: InstagramLogo,
  TELEGRAM: TelegramLogo,
  FACEBOOK: FacebookLogo,
  TIKTOK: TiktokLogo,
  YOUTUBE: YoutubeLogo,
  WHATSAPP: WhatsappLogo,
  X: X,
  VK: Globe,
  OTHER: Globe,
};

export function SocialIcons() {
  const [links, setLinks] = useState<SocialLinkDto[]>([]);

  useEffect(() => {
    api.listSocialLinks().then(setLinks).catch(() => {});
  }, []);

  const safeLinks = links.filter((link) => /^https?:\/\//i.test(link.url));
  if (safeLinks.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {safeLinks.map((link) => {
        const Icon = PLATFORM_ICON[link.platform];
        return (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label || link.platform}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-gradient-brand hover:text-white dark:bg-white/10 dark:text-slate-300"
          >
            <Icon size={16} weight="fill" aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
}
