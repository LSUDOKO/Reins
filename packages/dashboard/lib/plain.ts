// Plain-English helpers backed by the Reins API (a Cloudflare Worker that holds
// the language-model key server-side). Every call has a local fallback, so the
// console keeps working when the API is down: drafting falls back to the pattern
// parser in lib/draft, explaining to a template, screening to a keyword check.

import type { Terms } from "@reins/sdk";
import { draftFromText } from "./draft";
import { nearToYocto } from "./near";

export const API = (process.env.NEXT_PUBLIC_REINS_API ?? "https://reins-api.adoranto737.workers.dev").replace(/\/$/, "");

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as T;
}

const YOCTO = 10n ** 24n;
export function near(yocto: string | null | undefined): string {
  if (!yocto) return "0";
  const v = BigInt(yocto);
  const w = v / YOCTO;
  const f = (v % YOCTO).toString().padStart(24, "0").slice(0, 4).replace(/0+$/, "");
  return f ? `${w}.${f}` : `${w}`;
}

function windowWord(secs: number): string {
  if (!secs) return "in total";
  if (secs === 86400) return "per day";
  if (secs === 604800) return "per week";
  if (secs === 2592000) return "per 30 days";
  if (secs % 3600 === 0) return `every ${secs / 3600} hours`;
  return `every ${secs} seconds`;
}

/** The template explanation, used when the API is unreachable. */
export function explainLocally(t: Terms, label?: string): string {
  const who = label ? `The "${label}" agent` : "This agent";
  const parts = [
    `${who} can spend up to ${near(t.budget)} NEAR ${windowWord(Number(t.period_secs))} from your vault`,
    `never more than ${near(t.per_tx_cap)} NEAR in one payment`,
  ];
  if (t.approval_above) parts.push(`and must ask you before paying more than ${near(t.approval_above)} NEAR`);
  let s = parts.join(", ") + ".";
  if (t.merchants?.length) s += ` It can only pay ${t.merchants.join(", ")}.`;
  if (t.max_uses) s += ` It can make at most ${t.max_uses} payments.`;
  if (t.expires_at) s += ` It stops working on ${new Date(Number(t.expires_at) * 1000).toLocaleDateString()}.`;
  s += " It can't withdraw your money, change these limits or pay accounts on the shared blocklist.";
  return s;
}

export type Sourced<T> = T & { source: "api" | "local" };

export async function explain(terms: Terms, label?: string): Promise<Sourced<{ text: string }>> {
  try {
    const r = await post<{ text: string }>("/explain", { terms, label });
    if (r.text) return { text: r.text, source: "api" };
  } catch {
    /* fall through */
  }
  return { text: explainLocally(terms, label), source: "local" };
}

/** English -> terms, via the API or the local pattern parser. */
export async function draft(text: string): Promise<Sourced<{ terms: Terms; explanation: string }>> {
  try {
    const r = await post<{ terms: Terms; explanation: string }>("/draft", { text });
    if (r.terms?.budget && r.terms?.per_tx_cap) return { ...r, source: "api" };
  } catch {
    /* fall through */
  }
  const d = draftFromText(text);
  const budget = d.amount || d.lifetime || "0.5";
  const uses = parseInt(d.maxUses, 10);
  const terms: Terms = {
    budget: nearToYocto(budget).toString(),
    period_secs: String(d.amount ? d.period : 0),
    per_tx_cap: nearToYocto(d.perTx || budget).toString(),
    approval_above: d.approval ? nearToYocto(d.approval).toString() : null,
    expires_at: String(Math.floor(Date.now() / 1000) + d.expiryDays * 86400),
    max_uses: Number.isFinite(uses) && uses >= 1 ? uses : null,
    merchants: d.merchants ? d.merchants.split(/,\s*/).filter(Boolean) : null,
  };
  return { terms, explanation: explainLocally(terms), source: "local" };
}

const INJECTION_HINTS = [
  /ignore (all )?(previous|prior|above) (instructions|rules)/i,
  /system (notice|prompt|message)/i,
  /(send|pay|transfer|withdraw) .{0,40}(now|immediately|urgent)/i,
  /you are now/i,
  /disregard/i,
];

export async function screen(text: string): Promise<Sourced<{ injection: boolean; score: number; label: string }>> {
  try {
    const r = await post<{ injection: boolean; score: number; label: string }>("/screen", { text });
    if (typeof r.injection === "boolean") return { ...r, source: "api" };
  } catch {
    /* fall through */
  }
  const hits = INJECTION_HINTS.filter((re) => re.test(text)).length;
  return { injection: hits > 0, score: Math.min(1, hits / 2), label: hits ? "looks like an injected instruction" : "no injection pattern found", source: "local" };
}
