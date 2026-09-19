import type { ReactNode } from "react";
import type { ContentPageDto } from "@topup-hub/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.gulyaly.com/api";

// Server-side on purpose: legal and info pages are the ones search engines and AI assistants
// read verbatim, so the text has to be in the first HTML response rather than filled in by the
// browser after load. Best-effort like the other server fetches -- null lets the page show its
// own fallback instead of failing the request.
export async function fetchContentPage(slug: string): Promise<ContentPageDto | null> {
  try {
    const res = await fetch(`${API_URL}/content-pages/${slug}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as ContentPageDto;
  } catch {
    return null;
  }
}

export function InfoArticle({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <article>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
      </article>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="pt-2 text-lg font-semibold text-slate-900 dark:text-white">{children}</h2>;
}

// Same tiny format the admin Content Pages editor produces: blank-line separated blocks, "## "
// for a heading.
export function renderBody(body: string) {
  return body.split(/\n\n+/).map((block, i) => {
    if (block.startsWith("## ")) {
      const [heading, ...rest] = block.split("\n");
      return (
        <div key={i} className="space-y-2">
          <SectionTitle>{(heading ?? "").slice(3)}</SectionTitle>
          {rest.length > 0 && <p>{rest.join(" ")}</p>}
        </div>
      );
    }
    return <p key={i}>{block}</p>;
  });
}
