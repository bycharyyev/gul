/**
 * The part of a section's public address that a person reads.
 *
 * Derived from the name rather than asked for. The people naming these run flower shops, not
 * websites, and "slug" is a word from our side of the screen -- a form field asking for one gets
 * either a copy of the name with spaces in it or nothing at all.
 *
 * Cyrillic is transliterated rather than dropped, because most of these names are Russian and a
 * section called "Свадебные" must not become an empty string.
 */
const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
  // Turkmen letters the Latin alphabet does not already cover.
  ä: "a", ç: "ch", ž: "zh", ň: "n", ö: "o", ş: "sh", ü: "u", ý: "y",
};

export const SLUG_MAX = 60;

export function slugify(value: string): string {
  const lower = value.trim().toLowerCase();
  let out = "";
  for (const char of lower) {
    if (char in CYRILLIC) out += CYRILLIC[char];
    else if (/[a-z0-9]/.test(char)) out += char;
    else out += "-";
  }
  // Collapse the runs the substitution above leaves behind, and never end on a separator.
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, SLUG_MAX).replace(/-$/, "");
}

/**
 * A slug this shop is not already using.
 *
 * Suffixed rather than rejected: two sections called "Новинки" is a thing somebody may genuinely
 * want, and an error telling them the word is taken -- by themselves -- would be a puzzle.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = base || "section";
  if (!taken.has(root)) return root;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = root.slice(0, SLUG_MAX - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
  // A shop with a thousand sections of the same name is not a case worth a nicer answer.
  return `${root.slice(0, SLUG_MAX - 14)}-${Date.now().toString(36)}`;
}
