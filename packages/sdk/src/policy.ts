/**
 * Counterparty verdict: pure function from collected signals to allow / warn / block.
 * Rule of thumb: a signal that could not be read is reported as "unavailable" and never
 * counts as risk or as safety.
 */
export type Level = "info" | "warn" | "block";
export type Verdict = "allow" | "warn" | "block";

export interface Signals {
  receiver: string;
  /** null = could not be read */
  exists: boolean | null;
  implicit: boolean;
  ageDays: number | null;
  isContract: boolean | null;
  codeChangedRecently: boolean | null;
  priorPayments: number | null;
  reportCount: number | null;
  reportEvidence: string[];
  blockedForOwner: boolean | null;
  /** In the rein's merchant allowlist. */
  allowlisted: boolean;
  /** Accounts the owner is known to pay; used for look-alike detection. */
  known: string[];
}

export interface Reason {
  signal: string;
  level: Level;
  detail: string;
}

export interface Assessment {
  receiver: string;
  verdict: Verdict;
  reasons: Reason[];
}

export const YOUNG_ACCOUNT_DAYS = 7;

/** Normalise characters attackers swap in look-alike names. */
export function skeleton(name: string): string {
  return name
    .toLowerCase()
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/[0]/g, "o")
    .replace(/[1|]/g, "l")
    .replace(/[5]/g, "s")
    .replace(/[3]/g, "e")
    .replace(/[-_]/g, "");
}

export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** The known account `receiver` imitates, if any (close but not identical). */
export function lookalikeOf(receiver: string, known: string[]): string | null {
  const r = skeleton(receiver);
  for (const k of known) {
    if (k === receiver) continue;
    const s = skeleton(k);
    if (s === r || editDistance(s, r) <= 2) return k;
  }
  return null;
}

export function assess(s: Signals): Assessment {
  const reasons: Reason[] = [];
  const add = (signal: string, level: Level, detail: string) => reasons.push({ signal, level, detail });

  if (s.blockedForOwner === true) {
    add("blocklist", "block", `on the Reins shared blocklist with ${s.reportCount ?? "?"} bonded report(s)` +
      (s.reportEvidence.length ? `; evidence: ${s.reportEvidence.join(", ")}` : ""));
  } else if (s.blockedForOwner === null) {
    add("blocklist", "info", "blocklist unavailable");
  } else if ((s.reportCount ?? 0) > 0) {
    add("blocklist", "info", `has ${s.reportCount} report(s), but the owner allowed this account`);
  }

  if (s.exists === false && !s.implicit) {
    add("existence", "block", "named account does not exist");
  } else if (s.exists === false && s.implicit) {
    add("existence", "warn", "implicit account has never been used");
  } else if (s.exists === null) {
    add("existence", "info", "account lookup unavailable");
  }

  const twin = lookalikeOf(s.receiver, s.known);
  if (twin && !s.allowlisted) {
    add("lookalike", "block", `name imitates ${twin}`);
  }

  if (s.ageDays === null) {
    add("age", "info", "account age unavailable");
  } else if (s.ageDays < YOUNG_ACCOUNT_DAYS) {
    // An owner who put the account on the rein's merchant list already vouched for it.
    add("age", s.allowlisted ? "info" : "warn", `account is ${s.ageDays.toFixed(1)} days old`);
  } else {
    add("age", "info", `account is ${Math.floor(s.ageDays)} days old`);
  }

  if (s.isContract === true) {
    if (s.codeChangedRecently === true) add("code", "warn", "contract code changed in the last 7 days");
    else if (s.codeChangedRecently === null) add("code", "info", "is a contract; code history unavailable");
    else add("code", "info", "is a contract; code unchanged for 7 days");
  }

  if (s.priorPayments === null) add("history", "info", "payment history unavailable");
  else if (s.priorPayments === 0 && !s.allowlisted) add("history", "warn", "first payment from this owner to this account");
  else add("history", "info", `${s.priorPayments} prior payment(s) from this owner`);

  if (s.allowlisted) add("allowlist", "info", "in the rein's merchant allowlist");

  const verdict: Verdict = reasons.some((r) => r.level === "block")
    ? "block"
    : reasons.some((r) => r.level === "warn")
      ? "warn"
      : "allow";
  return { receiver: s.receiver, verdict, reasons };
}
