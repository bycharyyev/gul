"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { setStoredReferral } from "@/lib/referral";
import { isAuthenticated } from "@/lib/api";

/**
 * The /r/<code> landing link. No screen of its own on purpose: the person who tapped this came
 * from a share message that already made the pitch, and the fastest path to converting them is
 * straight into the registration form with their code already sitting in it -- not a second page
 * asking them to confirm they want to continue.
 *
 * A signed-in visitor can't register again, so this sends them home instead of into a form that
 * would just reject them.
 */
export default function ReferralRedirectPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/");
      return;
    }

    if (params.code) {
      setStoredReferral({
        code: params.code,
        utmSource: searchParams.get("utm_source") ?? undefined,
        utmMedium: searchParams.get("utm_medium") ?? undefined,
        utmCampaign: searchParams.get("utm_campaign") ?? undefined,
        // The host that sent this visitor here (an Instagram bio link, a Telegram in-app browser,
        // a search engine) -- captured once, at the moment it's still available. `document.referrer`
        // is empty for a link opened from a native share sheet or typed directly, which is a real
        // and common case, not a data-quality problem.
        referrerUrl: document.referrer || undefined,
      });
    }
    router.replace("/register");
    // Only ever runs once per landing -- re-running on a searchParams identity change would
    // re-fire the redirect after it already happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
