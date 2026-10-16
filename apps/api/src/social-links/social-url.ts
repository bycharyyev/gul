import { BadRequestException } from "@nestjs/common";
import type { SocialPlatform } from "@topup-hub/types";

// Where a bare profile name goes for each platform. `at` platforms take the name after "@".
const PROFILE_BASE: Partial<Record<SocialPlatform, { base: string; at: boolean }>> = {
  INSTAGRAM: { base: "https://instagram.com/", at: false },
  TELEGRAM: { base: "https://t.me/", at: false },
  FACEBOOK: { base: "https://facebook.com/", at: false },
  TIKTOK: { base: "https://www.tiktok.com/", at: true },
  YOUTUBE: { base: "https://www.youtube.com/", at: true },
  X: { base: "https://x.com/", at: false },
  VK: { base: "https://vk.com/", at: false },
};

const KNOWN_HOST = /^(www\.)?(instagram\.com|t\.me|facebook\.com|fb\.com|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|vk\.com|wa\.me|whatsapp\.com)\//i;
const PROFILE_NAME = /^[A-Za-z0-9._]{1,60}$/;

function checkedHttpUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestException("Некорректная ссылка");
  }
  // Only http(s): the link is rendered as a plain <a href> on the storefront.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new BadRequestException("Ссылка должна начинаться с https://");
  }
  if (!parsed.hostname.includes(".")) throw new BadRequestException("Некорректная ссылка");
  return value;
}

/**
 * Turns what an admin typed into the link the footer shows. Accepts a full link, a host-prefixed
 * path ("instagram.com/name"), or a bare profile name for the platforms that have one. Anything
 * else is refused with a message the admin can act on, instead of a generic "fill in the fields".
 */
export function normalizeSocialUrl(platform: SocialPlatform, raw: string): string {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return checkedHttpUrl(value);

  if (platform === "OTHER") {
    if (!value.includes(".")) throw new BadRequestException("Укажите адрес сайта, например example.com");
    return checkedHttpUrl(`https://${value}`);
  }

  if (KNOWN_HOST.test(value) || value.includes("/")) {
    return checkedHttpUrl(`https://${value.replace(/^\/+/, "")}`);
  }

  if (platform === "WHATSAPP") {
    const digits = value.replace(/[\s()+-]/g, "");
    if (!/^\d{6,15}$/.test(digits)) throw new BadRequestException("Укажите номер WhatsApp или ссылку wa.me");
    return `https://wa.me/${digits}`;
  }

  const profile = PROFILE_BASE[platform];
  if (!profile) throw new BadRequestException("Укажите полную ссылку, начиная с https://");
  const name = value.replace(/^@/, "");
  if (!PROFILE_NAME.test(name)) throw new BadRequestException("Имя профиля может содержать только буквы, цифры, точку и _");
  return `${profile.base}${profile.at ? "@" : ""}${name}`;
}
