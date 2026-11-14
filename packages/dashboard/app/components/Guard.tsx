"use client";

// The Guard console: what stands between an agent and the money.
//
// Reins decides what may be spent, and this pane shows how. It follows the
// console's house rules:
//
//   1. A refusal is not a failure. A payment the contract reverted is the guard
//      working; it renders muted, not red.
//   2. Unknown is not zero. A signal that could not be read says "unavailable",
//      never "safe".
//   3. Every hash is a link. A transaction the reader cannot open on an explorer is
//      decoration.

import { useCallback, useEffect, useState } from "react";
import { fromYocto, type Assessment, type Report, type Stats } from "@reins/sdk";
import { api, recordedTxs, reins, type TxView } from "@/lib/api";
import { CHAIN_NAME, CONTRACT_ID, RPC_URL, txUrl } from "@/lib/chain";
import { shortHex } from "./ui";

// ---------------------------------------------------------------------------
// The contract's rules, as flows. Each is exactly what the code checks, in order.
// ---------------------------------------------------------------------------

type Rule = { name: string; who: string; desc: string; nodes: string[] };
const RULES: Rule[] = [
  {
    name: "pay",
    who: "agent key",
    desc: "The rein is found from the signing key; then every rule along the rein and its ancestors, the shared blocklist and the vault. A failed transfer rolls the budget back in the callback.",
    nodes: ["signer = owner", "key → rein", "active", "not expired", "uses left", "merchant lock", "per-payment cap", "budget (whole chain)", "blocklist", "vault", "approval threshold", "transfer", "on_paid"],
  },
  {
    name: "request_approval",
    who: "agent key",
    desc: "Only for a payment that fails nothing but the approval threshold. Capped at 4 open requests per rein; each expires after 24 hours.",
    nodes: ["key → rein", "every pay rule", "needs_approval?", "request (24h)"],
  },
  {
    name: "approve_request",
    who: "owner · full-access key",
    desc: "Needs 1 yoctoNEAR attached, which a function-call key can never do. Every other rule is checked again before the money moves.",
    nodes: ["1 yocto attached", "owner", "pending, not expired", "every pay rule", "transfer"],
  },
  {
    name: "issue_subrein",
    who: "agent key",
    desc: "An agent splits its own allowance: budget and cap may only narrow. The sub-agent's key works once the owner adds it to the account.",
    nodes: ["key → rein", "depth ≤ 3", "≤ 8 children", "budget ≤ parent", "cap ≤ parent", "owner adds key"],
  },
  {
    name: "report",
    who: "anyone · 0.1 NEAR bond",
    desc: "A bonded report with the sha256 of the evidence and a link to it. Every owner's reins refuse the account unless that owner allows it.",
    nodes: ["bond ≥ 0.1 NEAR", "sha256 evidence", "one per reporter", "blocked for all owners"],
  },
  {
    name: "revoke · revoke_all",
    who: "owner · full-access key",
    desc: "The rein and its whole subtree die, and the key leaves the contract's index: a revoked key is simply unknown.",
    nodes: ["1 yocto attached", "owner", "subtree → Revoked", "key forgotten"],
  },
];

function ago(unix: number): string {
  if (!unix) return "·";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unix));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------------------------------------------------------------------------

export default function Guard({ owner }: { owner: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [txs, setTxs] = useState<TxView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([reins.stats(), reins.version()]);
      setStats(s);
      setVersion(v);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    recordedTxs().then(setTxs).catch(() => setTxs([]));
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) {
    return (
      <div className="khwrap panel khpad">
        <div className="khbad">Could not reach NEAR RPC: {error}</div>
      </div>
    );
  }
  if (!stats) return <div className="khwrap panel khpad muted">Reading the Reins contract…</div>;

  return (
    <div className="khwrap">
      <Status stats={stats} version={version} />
      <Check owner={owner} />
      <Rules />
      <Timeline txs={txs} open={open} onOpen={(h) => setOpen((cur) => (cur === h ? null : h))} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Status({ stats, version }: { stats: Stats; version: string | null }) {
  return (
    <section className="panel khpad">
      <div className="khhead">
        <h2 className="khh">The contract</h2>
        <span className="pill live">
          <b />
          {CHAIN_NAME}
        </span>
      </div>
      <p className="khnote">
        Reins decides what an agent may spend, and the contract checks it on every payment. Agents hold function-call keys:
        they can call three methods and can never attach a deposit, so no agent can withdraw, approve or raise its own limits.
      </p>

      <div className="khgrid">
        <Field label="Contract" value={CONTRACT_ID} mono />
        <Field label="Version" value={version ?? "unknown"} mono />
        <Field label="RPC" value={RPC_URL.replace(/^https?:\/\//, "")} mono />
        <Field label="Events" value="NEP-297 · standard reins" />
      </div>

      <div className="khstats">
        <Stat n={stats.reins} label="reins" />
        <Stat n={stats.payments} label="payments settled" />
        <Stat n={stats.requests} label="approval requests" />
        <span className="khstat">
          <b>Ⓝ{fromYocto(stats.volume)}</b> moved
        </span>
        <span className="khstatsnote">all time</span>
      </div>
    </section>
  );
}

function Field({ label, value, title, mono }: { label: string; value: string; title?: string; mono?: boolean }) {
  return (
    <div className="khfield">
      <span className="khlabel">{label}</span>
      <span className={mono ? "mono" : "khvalue"} title={title}>
        {value}
      </span>
    </div>
  );
}

function Stat({ n, label, bad }: { n: number; label: string; bad?: boolean }) {
  return (
    <span className={`khstat${bad ? " bad" : ""}`}>
      <b>{n}</b> {label}
    </span>
  );
}

// ---------------------------------------------------------------------------

function Check({ owner }: { owner: string }) {
  const [account, setAccount] = useState("reins-demo-drain.testnet");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ a: Assessment; reports: Report[]; blocked: boolean; prior: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(
    async (acc: string) => {
      if (!acc) return;
      setBusy(true);
      setErr(null);
      try {
        const [a, reports, blocked, prior] = await Promise.all([
          api.check(owner, acc),
          api.reports(acc),
          api.isBlocked(owner, acc),
          api.pairCount(owner, acc),
        ]);
        setRes({ a, reports, blocked, prior });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [owner],
  );
  useEffect(() => {
    void run("reins-demo-drain.testnet");
  }, [run]);

  const dot = (l: string) => (l === "block" ? "bad" : l === "warn" ? "wait" : "ok");

  return (
    <section className="panel khpad">
      <div className="khhead">
        <h2 className="khh">Counterparty check</h2>
        {res ? <span className={`khtag ${res.a.verdict === "block" ? "bad" : res.a.verdict === "warn" ? "muted" : "ok"}`}>{res.a.verdict}</span> : null}
      </div>
      <p className="khnote">
        What an agent asks before it pays {owner}&apos;s money: allow, warn (ask the human) or block (refuse to sign). The
        blocklist part is also enforced by the contract, so bypassing the check does not help.
      </p>
      <form
        className="khflow"
        onSubmit={(e) => {
          e.preventDefault();
          void run(account);
        }}
      >
        <input value={account} onChange={(e) => setAccount(e.target.value.trim())} aria-label="Account to check" style={{ minWidth: 260 }} />
        <button className="dbtn quiet" disabled={!account || busy}>
          {busy ? "Checking…" : "Check"}
        </button>
      </form>
      {err ? <p className="khbad">{err}</p> : null}
      {res ? (
        <>
          <div className="khgrid">
            <Field label="Contract verdict" value={res.blocked ? "blocked for this owner" : "not blocked"} />
            <Field label="Prior payments" value={String(res.prior)} />
            <Field label="Bonded reports" value={String(res.reports.length)} />
          </div>
          <ol className="khlogs">
            {res.a.reasons.map((r, i) => (
              <li key={i} className="khlog">
                <span className={`khdot ${dot(r.level)}`} />
                <span className="khlogname">{r.signal}</span>
                <span className="khlogtype mono">{r.level}</span>
                <span className="khlogms">{r.detail}</span>
              </li>
            ))}
          </ol>
          {res.reports.map((r) => (
            <p key={r.reporter} className="khnote">
              Reported by <span className="mono">{r.reporter}</span> with a Ⓝ{fromYocto(r.bond)} bond · evidence sha256{" "}
              <span className="mono">{shortHex(r.evidence_hash, 12, 0)}</span> ·{" "}
              <a className="khlink" href={r.evidence_uri} target="_blank" rel="noreferrer">
                read it ↗
              </a>
            </p>
          ))}
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Rules() {
  return (
    <section className="panel khpad">
      <div className="khhead">
        <h2 className="khh">Rules</h2>
        <span className="khstatsnote">{RULES.length} entry points</span>
      </div>
      <p className="khnote">
        What the contract checks, in the order it checks it. The same check backs the free <span className="mono">preview_pay</span>{" "}
        view, so a dry run can never disagree with the real payment.
      </p>
      <ul className="khlist">
        {RULES.map((w) => (
          <li key={w.name} className="khwf">
            <div className="khwfhead">
              <span className="khwfname mono">{w.name}</span>
              <span className="khtag">{w.who}</span>
              <span className="khtag ok">enforced</span>
            </div>
            <p className="khwfdesc">{w.desc}</p>
            <div className="khflow">
              {w.nodes.map((n, i) => (
                <span key={n} className="khnode">
                  {i > 0 ? <i className="kharrow">→</i> : null}
                  <span className="khnodebox">{n}</span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------

const EVENT_LABEL: Record<string, string> = {
  payment: "Payment settled",
  payment_failed: "Transfer failed · rolled back",
  approval_requested: "Approval requested",
  rein_created: "Rein created",
};

function Timeline({ txs, open, onOpen }: { txs: TxView[] | null; open: string | null; onOpen: (h: string) => void }) {
  return (
    <section className="panel khpad">
      <div className="khhead">
        <h2 className="khh">Recorded transactions</h2>
        {txs ? <span className="khstatsnote">{txs.length} from the demo and attack runs</span> : null}
      </div>
      <p className="khnote">
        Re-read from the chain on every load. A reverted payment is the guard working: it renders muted, with the reason the
        contract gave.
      </p>
      {txs === null ? (
        <p className="khnote">Reading from RPC…</p>
      ) : !txs.length ? (
        <p className="khnote">No recorded transactions in this build.</p>
      ) : (
        <ul className="khruns">
          {[...txs].sort((a, b) => b.at - a.at).map((x) => (
            <Run key={x.txHash} x={x} open={open === x.txHash} onOpen={() => onOpen(x.txHash)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Run({ x, open, onOpen }: { x: TxView; open: boolean; onOpen: () => void }) {
  // a failed transfer inside a settled call is a rollback (payment_failed), not a refusal
  const reverted = !!x.panic && x.panic !== "unavailable" && x.events.length === 0;
  const main = x.events.find((e) => EVENT_LABEL[e.event]);
  const status = reverted ? `Refused · ${x.panic}` : main ? EVENT_LABEL[main.event] : x.panic === "unavailable" ? "Unavailable" : "Settled";
  const tone = reverted ? "muted" : main?.event === "payment_failed" ? "wait" : x.panic === "unavailable" ? "muted" : "ok";
  const amount = main?.data?.amount ? `Ⓝ${fromYocto(main.data.amount)}` : null;

  return (
    <li className="khrun">
      <button type="button" className="khrunhead" onClick={onOpen} aria-expanded={open}>
        <span className={`khdot ${tone}`} />
        <span className="khrunwhat">
          <span className="khrunaction">{x.label}</span>
          {amount ? <span className="khrunwf mono">{amount}</span> : null}
        </span>
        <span className="khrunstatus">{status}</span>
        <span className="khrunwhen">{ago(x.at)}</span>
      </button>

      {!open ? (
        <div className="khruntx">
          <a className="mono khlink" href={txUrl(x.txHash)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            {shortHex(x.txHash, 10, 8)} ↗
          </a>
        </div>
      ) : (
        <div className="khrunbody">
          <div className="khgrid">
            <div className="khfield">
              <span className="khlabel">Transaction</span>
              <a className="mono khlink" href={txUrl(x.txHash)} target="_blank" rel="noreferrer">
                {shortHex(x.txHash, 10, 8)} ↗
              </a>
            </div>
            <Field label="Signer" value={x.signer} mono />
            <Field label="Expected" value={x.expect === "panic" ? `revert: ${x.code}` : x.expect} mono />
          </div>
          {reverted ? <p className="khnote">The contract refused this payment with {x.panic}; nothing moved.</p> : null}
          {x.events.length ? (
            <ol className="khlogs">
              {x.events.map((e, i) => (
                <li key={`${e.event}-${i}`} className="khlog">
                  <span className={`khdot ${e.event === "payment_failed" ? "wait" : "ok"}`} />
                  <span className="khlogname">{e.event}</span>
                  {e.data?.rein_id ? <span className="khlogtype mono">rein #{e.data.rein_id}</span> : null}
                  {e.data?.receiver ? <span className="khlogms">→ {e.data.receiver}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )}
    </li>
  );
}
