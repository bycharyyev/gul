/**
 * Deciding, without a person, whether a post can go straight to the feed.
 *
 * The lever here is not a machine reading every post -- it is not moderating people who have
 * already been moderated. An author with a few approved posts and no upheld complaints has been
 * checked by a human three times already; checking them a fourth time spends the reviewer's
 * attention on the safest content in the queue while genuinely new authors wait behind them.
 *
 * What this deliberately does NOT do is judge pictures. Free automatic image checking means a
 * local model on a 3.8 GiB server: slow, inaccurate, and -- worst of all -- silently wrong. So a
 * new author's media goes to a person, and a trusted author's does not. That is a real limit,
 * stated rather than papered over: nothing here has looked at a single pixel.
 */

/** Approved posts an author needs before their next one publishes without review. */
export const TRUST_THRESHOLD = 3;

/**
 * Approvals before this moment do not count towards trust.
 *
 * Without it, turning this feature on would hand automatic publication to every existing author
 * at once, retroactively -- their posts were approved under a rule that said a person would read
 * the next one too, and that is not consent to skip the next one. Everybody starts at zero and
 * earns the threshold under the rule that is actually in force.
 *
 * Offences are deliberately NOT reset with it. A fresh start applies to trust, not to a record:
 * an author whose post was hidden last week is still an author whose post was hidden.
 */
export const TRUST_EPOCH = new Date("2026-09-09T09:00:00Z");

/** Distinct people who must report a published post before it hides itself pending re-review. */
export const REPORT_HIDE_THRESHOLD = 3;

export type AutoModerationVerdict = {
  /** PENDING sends it to a person; PUBLISHED puts it in the feed now. */
  status: "PENDING" | "PUBLISHED";
  /** Why, in a form the moderation queue can show. Null when nothing needed saying. */
  reason: string | null;
};

export type AuthorStanding = {
  /** How many of this author's posts a person has approved. */
  approvedPosts: number;
  /** Complaints a moderator upheld: any post of theirs currently rejected or hidden. */
  upheldReports: number;
};

/**
 * Text a post may not carry.
 *
 * Contact details and foreign shop links are the real target, not rudeness: the whole point of a
 * post here is to sell through the shop, and a phone number in the caption is an invitation to
 * step around it. Held as patterns rather than a word list because that is what the spam actually
 * looks like -- a list of insults would catch far less and offend far more.
 */
const RULES: ReadonlyArray<{
  id: string;
  pattern: RegExp;
  /** Strip the punctuation people write inside the thing before matching. */
  normalise?: boolean;
}> = [
  // A phone number with its spacing removed. Separators that people put inside numbers -- spaces,
  // brackets, dashes -- are stripped first; dots deliberately are not, because "09.09.2026" is a
  // date and stripping them would turn every caption mentioning one into a suspected phone
  // number. Eight digits is the shortest local number here.
  { id: "contact-number", pattern: /\+?\d{8,}/, normalise: true },
  // A link to anywhere that is not us.
  {
    id: "external-link",
    pattern:
      /\b(?:https?:\/\/|www\.)(?!(?:[a-z0-9-]+\.)*gulyaly\.pro\b)[a-z0-9-]+\.[a-z]{2,}/i,
  },
  // Messenger handles, the other way a sale walks out of the door.
  { id: "messenger-handle", pattern: /(?:^|\s)@[a-z0-9_]{4,}/i },
  // The same character fifteen times over is not a caption.
  { id: "character-spam", pattern: /(.)\1{14,}/ },
];

/** Shouting: most of a long caption in capitals. */
function isShouting(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < 30) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  return upper / letters.length > 0.7;
}

/** Which rule a caption breaks, or null when it breaks none. */
export function textVerdict(body: string | null | undefined): string | null {
  const text = (body ?? "").trim();
  if (!text) return null;
  const compact = text.replace(/[\s()\-–—]/g, "");
  const broken = RULES.find((rule) =>
    rule.pattern.test(rule.normalise ? compact : text),
  );
  if (broken) return broken.id;
  return isShouting(text) ? "shouting" : null;
}

/**
 * @param hasMedia whether the post carries a picture or a video. Media from an author nobody has
 *   vouched for goes to a person regardless of how clean the caption is, because nothing in this
 *   file can see it.
 */
export function autoModerate(input: {
  body: string | null | undefined;
  hasMedia: boolean;
  author: AuthorStanding;
}): AutoModerationVerdict {
  const broken = textVerdict(input.body);
  if (broken) {
    // Never auto-rejected. A phone number in a caption is as often a person not knowing the rules
    // as it is a spammer, and telling them "no" with no way back would lose a real seller. It
    // goes to a person with the reason attached.
    return { status: "PENDING", reason: `text:${broken}` };
  }

  if (input.author.upheldReports > 0) {
    return { status: "PENDING", reason: "author:under-review" };
  }

  if (input.author.approvedPosts < TRUST_THRESHOLD) {
    return { status: "PENDING", reason: "author:new" };
  }

  return { status: "PUBLISHED", reason: null };
}
