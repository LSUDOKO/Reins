/**
 * Turning model output into contract terms. The model only proposes numbers in NEAR; this
 * code validates them and builds the exact `Terms` the contract accepts, so a bad or
 * injected model answer can never produce terms the contract would reject or that exceed
 * what the user wrote.
 */
import { fromYocto, toYocto, type Terms } from "@reins/sdk";

export const PERIODS: Record<string, number> = { hour: 3600, day: 86400, week: 604800, month: 2592000, none: 0 };
const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export interface Draft {
  label?: string;
  budget_near?: string | number;
  period?: string;
  per_payment_near?: string | number | null;
  approval_above_near?: string | number | null;
  expires_in_days?: number | null;
  max_uses?: number | null;
  merchants?: string[] | null;
}

function near(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (!/^\d+(\.\d{1,24})?$/.test(s) || Number(s) <= 0) return null;
  return toYocto(s);
}

/** Build contract terms; throws with a human message when the draft is unusable. */
export function termsFromDraft(d: Draft, nowSecs = Math.floor(Date.now() / 1000)): { label: string; terms: Terms } {
  const budget = near(d.budget_near);
  if (!budget) throw new Error("I could not find a budget. Say how much NEAR the agent may spend, e.g. \"1 NEAR a day\".");
  const period = PERIODS[String(d.period ?? "day").toLowerCase()] ?? PERIODS.day;
  let cap = near(d.per_payment_near) ?? budget;
  if (BigInt(cap) > BigInt(budget)) cap = budget;
  let approval = near(d.approval_above_near);
  if (approval && BigInt(approval) >= BigInt(cap)) approval = null;
  const days = Number(d.expires_in_days);
  const uses = Number(d.max_uses);
  const merchants = (d.merchants ?? []).map((m) => String(m).trim().toLowerCase()).filter((m) => ACCOUNT.test(m) && m.length <= 64).slice(0, 16);
  const label = String(d.label ?? "agent").replace(/[^\w\- ]/g, "").trim().slice(0, 64) || "agent";
  return {
    label,
    terms: {
      budget,
      period_secs: String(period),
      per_tx_cap: cap,
      approval_above: approval,
      expires_at: Number.isFinite(days) && days > 0 ? String(nowSecs + Math.round(days * 86400)) : null,
      max_uses: Number.isInteger(uses) && uses > 0 ? uses : null,
      merchants: merchants.length ? merchants : null,
    },
  };
}

/** Deterministic plain-English summary; used as the fallback and to ground the model. */
export function describe(t: Terms, label = "This rein"): string {
  const per = Number(t.period_secs);
  const window = per === 0 ? "in total" : per === 3600 ? "per hour" : per === 86400 ? "per day" : per === 604800 ? "per week" : `every ${Math.round(per / 3600)} hours`;
  const parts = [
    `${label} lets the agent spend up to ${fromYocto(t.budget)} NEAR ${window} from your vault, at most ${fromYocto(t.per_tx_cap)} NEAR per payment.`,
  ];
  if (t.approval_above) parts.push(`Anything above ${fromYocto(t.approval_above)} NEAR waits for you to approve it.`);
  if (t.merchants?.length) parts.push(`It can only pay ${t.merchants.join(", ")}.`);
  if (t.max_uses) parts.push(`It stops after ${t.max_uses} payments.`);
  if (t.expires_at) parts.push(`It expires on ${new Date(Number(t.expires_at) * 1000).toISOString().slice(0, 10)}.`);
  parts.push("It can never withdraw your money, raise its own limits or pay a blocklisted account; you can freeze or revoke it at any time.");
  return parts.join(" ");
}
