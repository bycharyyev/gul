/**
 * True when `current` (e.g. `1.0.6`) is older than `minimum`. An empty or unreadable value never
 * counts as older: a typo in the Firebase console must not lock every user out.
 */
export function isVersionBelow(current: string, minimum: string): boolean {
  const have = parse(current);
  const need = parse(minimum);
  if (!have || !need) return false;
  const length = Math.max(have.length, need.length);
  for (let i = 0; i < length; i += 1) {
    const a = have[i] ?? 0;
    const b = need[i] ?? 0;
    if (a !== b) return a < b;
  }
  return false;
}

function parse(version: string): number[] | null {
  const parts = version.trim().split("+")[0]!.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    numbers.push(Number(part));
  }
  return numbers;
}
