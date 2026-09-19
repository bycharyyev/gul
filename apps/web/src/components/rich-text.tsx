import type { ReactNode } from "react";

// Dictionary strings mark where a link goes with %name% (the wording and word order around a
// link differ per language, so the link cannot be glued on outside the sentence).
export function withSlots(text: string, slots: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(%\w+%)/).map((part, i) => {
    const match = /^%(\w+)%$/.exec(part);
    const key = match?.[1];
    return key && key in slots ? <span key={i}>{slots[key]}</span> : part;
  });
}
