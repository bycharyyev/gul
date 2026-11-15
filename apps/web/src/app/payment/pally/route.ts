import { NextResponse, type NextRequest } from "next/server";

/**
 * Pally sends the customer back from its payment page with a POST (success and failure alike),
 * which a page cannot receive. This turns it into a normal GET of /payment/return.
 *
 * Nothing in the request is trusted or read except the order locator we put in the URL ourselves
 * when the bill was created; /payment/return shows the status the API reports for that order, and
 * the API checks who owns it. The Location is relative, so this can never redirect off the site.
 */
function toReturnPage(request: NextRequest): NextResponse {
  const orderId = request.nextUrl.searchParams.get("orderId") ?? "";
  const target = /^[A-Za-z0-9_-]{1,64}$/.test(orderId)
    ? `/payment/return?orderId=${encodeURIComponent(orderId)}`
    : "/payment/return";
  // 303: the browser follows with GET whatever method brought it here.
  return new NextResponse(null, { status: 303, headers: { Location: target, "Cache-Control": "no-store" } });
}

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return toReturnPage(request);
}

export function POST(request: NextRequest) {
  return toReturnPage(request);
}
