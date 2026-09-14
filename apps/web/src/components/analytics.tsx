"use client";

import Script from "next/script";

// Baked in at build time via Docker build-args (see Dockerfile + deploy.yml), same pattern as
// NEXT_PUBLIC_API_URL -- not secrets, but also not committed, since they're specific to whichever
// GA4 property / Yandex Metrika counter this deployment actually reports to.
const GOOGLE_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID;
const YANDEX_METRIKA_ID = process.env.NEXT_PUBLIC_YM_ID;

export function Analytics() {
  return (
    <>
      {GOOGLE_MEASUREMENT_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GOOGLE_MEASUREMENT_ID}');
            `}
          </Script>
        </>
      )}
      {YANDEX_METRIKA_ID && (
        <Script id="yandex-metrika" strategy="afterInteractive">
          {`
            (function(m,e,t,r,i,k,a){
              m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
              m[i].l=1*new Date();
              for (var j=0;j<document.scripts.length;j++) {
                if (document.scripts[j].src===r) return;
              }
              k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a);
            })(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}','ym');

            ym(${YANDEX_METRIKA_ID}, 'init', {
              ssr: true,
              webvisor: true,
              clickmap: true,
              ecommerce: 'dataLayer',
              referrer: document.referrer,
              url: location.href,
              accurateTrackBounce: true,
              trackLinks: true
            });
          `}
        </Script>
      )}
    </>
  );
}
