/**
 * Opens a `https://t.me/<bot>?start=<code>` link, trying the native Telegram app first
 * (via the `tg://` custom scheme) and falling back to the regular t.me web flow if nothing
 * took over the page within a short window -- e.g. no Telegram app installed, or the OS
 * declined the scheme. Without this, a plain `<a href="https://t.me/...">` on desktop
 * either always goes through the browser (t.me's own interstitial, which some users get
 * stuck on) or always tries the app -- this tries the faster path first and self-corrects.
 */
export function openTelegramDeepLink(deepLink: string) {
  const tgUrl = deepLink.replace(/^https:\/\/t\.me\//, "tg://resolve?domain=").replace("?start=", "&start=");

  let handedOff = false;
  const onBlur = () => {
    handedOff = true;
  };
  window.addEventListener("blur", onBlur, { once: true });

  window.location.href = tgUrl;

  window.setTimeout(() => {
    window.removeEventListener("blur", onBlur);
    if (!handedOff) {
      window.open(deepLink, "_blank");
    }
  }, 1200);
}
