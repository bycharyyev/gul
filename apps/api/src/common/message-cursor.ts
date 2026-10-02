/**
 * Incremental message reads: a client that already holds a conversation passes the id of the last
 * message it has (`?after=<id>`) and gets only what came later, instead of re-downloading the whole
 * conversation every few seconds while it polls.
 *
 * The cursor is a message id, resolved inside the conversation being read: an id from another
 * conversation (or garbage) resolves to nothing and the caller falls back to a full read, so the
 * parameter can never be used to learn anything about a conversation the caller cannot open.
 */

/** Ids are cuids; anything else is ignored rather than passed to a query. */
export function parseAfter(raw: unknown): string | undefined {
  return typeof raw === "string" && /^[a-z0-9]{10,40}$/i.test(raw) ? raw : undefined;
}

/** Messages strictly after the cursor, in the same (createdAt, id) order the full read uses. */
export function afterCursor(cursor: { id: string; createdAt: Date }) {
  return {
    OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }],
  };
}

/** Page size for an incremental read. A poll rarely brings more than a handful. */
export const INCREMENTAL_TAKE = 200;
