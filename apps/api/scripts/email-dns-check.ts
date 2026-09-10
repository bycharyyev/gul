/**
 * Checks that the DNS a mail domain needs is actually published and says what we think it says.
 *
 * Run: `pnpm --filter @topup-hub/api email:dns-check [domain]`
 *
 * Queries public DNS rather than the Timeweb API on purpose -- what matters is what a receiving
 * mail server resolves, not what our provider's control panel believes. Exits non-zero if any
 * required check fails, so it can gate a deploy or run from CI.
 */
import { promises as dns } from "dns";

const DOMAIN = process.argv[2] ?? process.env.MAIL_SENDER_DOMAIN ?? "gulyaly.pro";

/** DKIM selector REG.RU generated for this domain in ISPmanager. */
const DKIM_SELECTOR = process.env.MAIL_DKIM_SELECTOR ?? "dkim";

/** Hosts REG.RU documents for inbound mail on their hosting. */
const EXPECTED_MX = ["mx1.hosting.reg.ru", "mx2.hosting.reg.ru"];

/** The include that authorises REG.RU's outbound relay to send as us. */
const REQUIRED_SPF_INCLUDE = "include:_spf.hosting.reg.ru";

type Level = "required" | "optional";
type Result = { name: string; ok: boolean; level: Level; detail: string };

const results: Result[] = [];

function record(name: string, ok: boolean, level: Level, detail: string) {
  results.push({ name, ok, level, detail });
}

/**
 * Ordinary DNS is the right thing to query -- it is what a receiving mail server does. But plenty
 * of networks (corporate, some ISPs, this project's dev machines) block outbound UDP/53, and a
 * blocked resolver returns ENODATA, which is indistinguishable from "the record genuinely does
 * not exist". Reporting a missing DKIM key when the key is fine would be worse than useless.
 *
 * So: probe a domain that certainly has MX records. If even that fails, the resolver is unusable
 * and every lookup goes over DNS-over-HTTPS instead, with a note saying so.
 */
let useDoh = false;

async function detectResolver() {
  try {
    const probe = await dns.resolveMx("gmail.com");
    if (probe.length > 0) return;
  } catch {
    // fall through
  }
  useDoh = true;
  console.log("Local DNS resolver is unusable (UDP/53 likely blocked) -- falling back to DNS-over-HTTPS.\n");
}

async function doh(host: string, type: "MX" | "TXT" | "A"): Promise<string[]> {
  const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) throw new Error(`DoH lookup failed: HTTP ${res.status}`);
  const body = (await res.json()) as { Answer?: { data: string }[] };
  // DoH returns TXT data wrapped in quotes, and a long record as several quoted chunks.
  return (body.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, "").replace(/" "/g, ""));
}

/**
 * One lookup per (host, type) for the whole run.
 *
 * The checks run concurrently and several read the same record, and a record that was just
 * changed can be mid-propagation: two independent queries genuinely returned different SPF
 * values seconds apart, producing a report that contradicted itself. Memoising makes every check
 * reason about the same snapshot, which is what a report is for.
 */
const lookupCache = new Map<string, Promise<string[]>>();

function cached(host: string, type: "TXT" | "A", fetcher: () => Promise<string[]>): Promise<string[]> {
  const key = `${type}:${host}`;
  const hit = lookupCache.get(key);
  if (hit) return hit;
  const promise = fetcher().catch(() => [] as string[]);
  lookupCache.set(key, promise);
  return promise;
}

/** TXT records arrive as arrays of chunks (a long record is split at 255 bytes); rejoin them. */
async function txt(host: string): Promise<string[]> {
  return cached(host, "TXT", async () => {
    if (useDoh) return await doh(host, "TXT");
    return (await dns.resolveTxt(host)).map((chunks) => chunks.join(""));
  });
}

/** MX hosts, lowercased with the trailing root dot stripped, however they were resolved. */
async function mx(host: string): Promise<string[]> {
  const raw = useDoh
    ? // DoH gives "10 mx1.hosting.reg.ru." -- drop the preference number.
      (await doh(host, "MX")).map((d) => d.split(/\s+/).pop() ?? "")
    : (await dns.resolveMx(host)).map((r) => r.exchange);
  return raw.map((h) => h.toLowerCase().replace(/\.$/, "")).filter(Boolean);
}

async function checkMx() {
  try {
    const hosts = await mx(DOMAIN);
    const missing = EXPECTED_MX.filter((h) => !hosts.includes(h));
    // Anything beyond the expected pair means mail is also being offered somewhere else, which
    // is how a half-finished migration silently keeps delivering to the old provider.
    const unexpected = hosts.filter((h) => !EXPECTED_MX.includes(h));
    record(
      "MX",
      missing.length === 0 && unexpected.length === 0,
      "required",
      hosts.length === 0
        ? "no MX records"
        : `${hosts.join(", ")}${missing.length ? ` | missing: ${missing.join(", ")}` : ""}${
            unexpected.length ? ` | unexpected: ${unexpected.join(", ")}` : ""
          }`,
    );
  } catch (err) {
    record("MX", false, "required", `lookup failed: ${(err as Error).message}`);
  }
}

async function checkSpf() {
  const spfRecords = (await txt(DOMAIN)).filter((v) => v.toLowerCase().startsWith("v=spf1"));

  if (spfRecords.length === 0) {
    record("SPF", false, "required", "no v=spf1 record");
    return;
  }
  // More than one SPF record is a hard failure per RFC 7208 -- receivers treat it as permerror
  // and the check fails entirely, which is worse than having no SPF at all.
  if (spfRecords.length > 1) {
    record("SPF", false, "required", `${spfRecords.length} SPF records (RFC 7208 allows exactly one)`);
    return;
  }

  const spf = spfRecords[0];
  const hasInclude = spf.includes(REQUIRED_SPF_INCLUDE);
  // "+all" would authorise the entire internet to send as us.
  const wideOpen = /\s\+all\s*$/.test(spf) || spf.trim().endsWith(" all");
  record(
    "SPF",
    hasInclude && !wideOpen,
    "required",
    `${spf}${hasInclude ? "" : ` | missing ${REQUIRED_SPF_INCLUDE}`}${wideOpen ? " | ends with +all" : ""}`,
  );
}

/**
 * The host REG.RU actually relays our mail out through. Taken from a real delivery's Received
 * chain, not from their documentation -- the two disagreed, which is what this check exists for.
 */
const SENDING_HOST = process.env.MAIL_SENDING_HOST ?? "sm41.hosting.reg.ru";

async function ips(host: string): Promise<string[]> {
  return cached(host, "A", async () => {
    if (useDoh) return await doh(host, "A");
    return await dns.resolve4(host);
  });
}

/**
 * Checks that the host our mail actually leaves through is authorised by our own SPF record.
 *
 * This is the check that would have caught a real softfail: `_spf.hosting.reg.ru` turned out to
 * be a fixed list of REG.RU's central relay IPs which does *not* include a customer's own
 * hosting server, so mail left from an IP the record never authorised. Gmail reported
 * `spf=softfail` while DMARC still passed on DKIM alone -- deliverable, but one broken DKIM key
 * away from failing outright, and invisible without reading a real message's headers.
 *
 * Deliberately a one-level expansion of `include:` and `a:` rather than a full RFC 7208
 * evaluator: no `exists`, `ptr`, `mx` or nested includes. That covers our record and stays
 * honest about what it does not cover, instead of implying a completeness it lacks.
 */
async function checkSpfCoversSendingHost() {
  const label = `SPF covers ${SENDING_HOST}`;
  const spf = (await txt(DOMAIN)).find((v) => v.toLowerCase().startsWith("v=spf1"));
  if (!spf) {
    record(label, false, "required", "no SPF record to evaluate");
    return;
  }

  const sendingIps = await ips(SENDING_HOST);
  if (sendingIps.length === 0) {
    record(label, false, "required", `could not resolve ${SENDING_HOST}`);
    return;
  }

  const authorised = new Set<string>();
  const unexpanded: string[] = [];

  for (const mechanism of spf.split(/\s+/).slice(1)) {
    if (mechanism.startsWith("ip4:")) {
      authorised.add(mechanism.slice(4).split("/")[0]);
    } else if (mechanism.startsWith("a:")) {
      for (const ip of await ips(mechanism.slice(2))) authorised.add(ip);
    } else if (mechanism.startsWith("include:")) {
      const included = (await txt(mechanism.slice(8))).find((v) => v.toLowerCase().startsWith("v=spf1"));
      if (!included) continue;
      for (const inner of included.split(/\s+/).slice(1)) {
        if (inner.startsWith("ip4:")) authorised.add(inner.slice(4).split("/")[0]);
        else if (inner.startsWith("a:")) for (const ip of await ips(inner.slice(2))) authorised.add(ip);
        else if (inner.startsWith("include:")) unexpanded.push(inner);
      }
    }
  }

  const covered = sendingIps.filter((ip) => authorised.has(ip));
  const missing = sendingIps.filter((ip) => !authorised.has(ip));
  const caveat = unexpanded.length > 0 ? ` (nested includes not expanded: ${unexpanded.join(", ")})` : "";

  record(
    label,
    missing.length === 0,
    "required",
    missing.length === 0
      ? `${covered.join(", ")} authorised${caveat}`
      : `NOT authorised: ${missing.join(", ")} — mail from this host will softfail SPF${caveat}`,
  );
}

async function checkDkim() {
  const host = `${DKIM_SELECTOR}._domainkey.${DOMAIN}`;
  const records = await txt(host);
  const dkim = records.find((v) => v.toLowerCase().includes("v=dkim1"));
  if (!dkim) {
    record(`DKIM (${DKIM_SELECTOR})`, false, "required", `no v=DKIM1 record at ${host}`);
    return;
  }
  const keyMatch = /p=([A-Za-z0-9+/=]*)/.exec(dkim);
  const key = keyMatch?.[1] ?? "";
  // An empty p= is the documented way to *revoke* a key, so publishing one by accident silently
  // tells receivers to fail every signature.
  record(
    `DKIM (${DKIM_SELECTOR})`,
    key.length > 0,
    "required",
    key.length > 0 ? `public key present (${key.length} chars)` : "p= is empty (revoked key)",
  );
}

async function checkDmarc() {
  const host = `_dmarc.${DOMAIN}`;
  const records = await txt(host);
  const dmarc = records.find((v) => v.toLowerCase().startsWith("v=dmarc1"));
  if (!dmarc) {
    record("DMARC", false, "required", `no v=DMARC1 record at ${host}`);
    return;
  }
  const policy = /\bp=([a-z]+)/i.exec(dmarc)?.[1]?.toLowerCase() ?? "none";
  // p=none publishes DMARC without asking receivers to act on a failure -- fine as a starting
  // posture, but it is monitoring, not enforcement, so flag it rather than calling it a pass.
  record("DMARC", policy !== "none", policy === "none" ? "optional" : "required", `${dmarc} | p=${policy}`);
}

async function checkBimi() {
  const host = `default._bimi.${DOMAIN}`;
  const records = await txt(host);
  const bimi = records.find((v) => v.toLowerCase().startsWith("v=bimi1"));
  record("BIMI", !!bimi, "optional", bimi ?? "not configured (optional; needs DMARC enforcement first)");
}

async function main() {
  console.log(`Checking mail DNS for ${DOMAIN}\n`);
  await detectResolver();

  await Promise.all([
    checkMx(),
    checkSpf(),
    checkSpfCoversSendingHost(),
    checkDkim(),
    checkDmarc(),
    checkBimi(),
  ]);

  // Sorted for a stable report -- the checks run concurrently, so completion order varies run to
  // run, which makes two runs annoying to diff.
  const order = ["MX", "SPF ", "SPF covers", "DKIM", "DMARC", "BIMI"];
  results.sort((a, b) => order.findIndex((o) => a.name.startsWith(o)) - order.findIndex((o) => b.name.startsWith(o)));

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const status = r.ok ? "PASS" : r.level === "optional" ? "WARN" : "FAIL";
    console.log(`${r.name.padEnd(width)}  ${status.padEnd(4)}  ${r.detail}`);
  }

  const failures = results.filter((r) => !r.ok && r.level === "required");
  console.log();
  if (failures.length > 0) {
    console.error(`${failures.length} required check(s) failed.`);
    process.exit(1);
  }
  console.log("All required checks passed.");
}

main().catch((err) => {
  console.error("dns-check crashed:", err);
  process.exit(1);
});
