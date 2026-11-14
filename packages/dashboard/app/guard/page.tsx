"use client";

// Guard: everything around the payments. Pending approvals the owner signs,
// the counterparty check an agent runs before paying, the shared blocklist,
// and the recorded transactions re-read from the chain. Same section language
// as the console's other utility pages.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fromYocto, type Assessment, type PayRequest, type Report } from "@reins/sdk";
import { api, recordedTxs, type TxView } from "@/lib/api";
import { DEMO_OWNER, txUrl } from "@/lib/chain";
import { useWallet, type Wallet } from "@/lib/near";
import { Cockpit } from "../components/Shell";
import { shortHex } from "../components/ui";

export default function GuardPage() {
  return (
    <Suspense>
      <GuardInner />
    </Suspense>
  );
}

function GuardInner() {
  const wallet = useWallet();
  const owner = useSearchParams().get("owner") ?? wallet.accountId ?? DEMO_OWNER;
  const canWrite = wallet.accountId === owner;
  const [msg, setMsg] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <Cockpit back={{ href: "/app", label: "Dashboard" }} wallet={wallet} refresh={refresh} onLogout={() => void wallet.signOut()} address={owner}>
      <div style={{ padding: "0 8px" }}>
        <h1 style={{ fontSize: 22, margin: "4px 0 14px" }}>Guard</h1>
        {msg && <p className="ok" style={{ margin: "0 0 10px" }}>{msg}</p>}
        <ApprovalsSection owner={owner} wallet={wallet} canWrite={canWrite} flash={flash} nonce={nonce} />
        <CheckSection owner={owner} wallet={wallet} canWrite={canWrite} flash={flash} />
        <ReceiptsSection />
      </div>
    </Cockpit>
  );
}

// ---------------------------------------------------------------------------

function ApprovalsSection({ owner, wallet, canWrite, flash, nonce }: { owner: string; wallet: Wallet; canWrite: boolean; flash: (m: string) => void; nonce: number }) {
  const [items, setItems] = useState<PayRequest[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setItems(await api.pending(owner));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [owner]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load, nonce]);

  const act = (method: "approve_request" | "reject_request", id: number) => async () => {
    try {
      await wallet.call(method, { id });
      flash(method === "approve_request" ? `Request ${id} approved · paid` : `Request ${id} rejected`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="setsec">
      <h2>Pending Approvals</h2>
      <p className="lede">
        Payments above a rein&apos;s approval threshold wait here for 24 hours. Approving re-checks every other rule and
        pays from the vault; only your full-access key can sign it.
      </p>
      {err && <p className="err">{err}</p>}
      {items.length === 0 && <p className="subnote">Nothing waiting.</p>}
      {items.map((r) => (
        <div key={r.id} className="setrow">
          <div className="main">
            Ⓝ{fromYocto(r.amount)} to {r.receiver}
            <div className="sub">
              request {r.id} · rein #{r.rein_id}
              {r.memo ? ` · ${r.memo}` : ""} · expires {new Date(Number(r.expires_at) / 1e6).toLocaleString()}
            </div>
          </div>
          <div className="acts">
            <button className="acretry" disabled={!canWrite} onClick={act("approve_request", r.id)} title={canWrite ? "" : "Sign in as the owner"}>
              approve
            </button>
            <button className="danger-ghost" disabled={!canWrite} onClick={act("reject_request", r.id)}>
              reject
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------

function CheckSection({ owner, wallet, canWrite, flash }: { owner: string; wallet: Wallet; canWrite: boolean; flash: (m: string) => void }) {
  const [account, setAccount] = useState("reins-demo-drain.testnet");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ a: Assessment; reports: Report[]; blocked: boolean; prior: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async (acc: string) => {
    if (!acc) return;
    setBusy(true);
    setErr(null);
    try {
      const [a, reports, blocked, prior] = await Promise.all([api.check(owner, acc), api.reports(acc), api.isBlocked(owner, acc), api.pairCount(owner, acc)]);
      setRes({ a, reports, blocked, prior });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [owner]);
  useEffect(() => {
    void run("reins-demo-drain.testnet");
  }, [run]);

  const allow = async (allowed: boolean) => {
    try {
      await wallet.call("set_allow", { receiver: account, allowed });
      flash(allowed ? `${account} allowed for your reins` : `${account} no longer allowed`);
      await run(account);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="setsec">
      <h2>Counterparty Check</h2>
      <p className="lede">
        What an agent asks before it pays. The verdict combines the shared blocklist (bonded reports, enforced by the
        contract), whether the account exists, its age, recent contract code changes, your payment history with it, and
        look-alike names. A signal that cannot be read says so; it never counts as safe.
      </p>
      <div className="crform">
        <label className="span2">
          Account
          <input value={account} onChange={(e) => setAccount(e.target.value.trim())} placeholder="merchant.testnet" />
        </label>
        <div className="cractions">
          <button className="primary" disabled={!account || busy} onClick={() => void run(account)}>
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      {res && (
        <>
          <div className="setrow">
            <div className="main">
              Verdict: <b>{res.a.verdict.toUpperCase()}</b>
              <div className="sub">
                {res.blocked ? "blocked for this owner by the contract" : "not blocked by the contract"} · {res.prior} prior payment(s) ·{" "}
                {res.reports.length} report(s)
              </div>
            </div>
            {res.reports.length > 0 && (
              <div className="acts">
                <button className="acretry" disabled={!canWrite} onClick={() => void allow(res.blocked)}>
                  {res.blocked ? "allow for my reins" : "stop allowing"}
                </button>
              </div>
            )}
          </div>
          {res.a.reasons.map((r, i) => (
            <div key={i} className="setrow">
              <div className="main">
                {r.signal}
                <div className="sub">
                  {r.level} · {r.detail}
                </div>
              </div>
            </div>
          ))}
          {res.reports.map((r) => (
            <div key={r.reporter} className="setrow">
              <div className="main">
                Reported by {r.reporter}
                <div className="sub">
                  bond Ⓝ{fromYocto(r.bond)} · sha256 {shortHex(r.evidence_hash, 12, 0)} ·{" "}
                  <a href={r.evidence_uri} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                    evidence
                  </a>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function ReceiptsSection() {
  const [items, setItems] = useState<TxView[] | null>(null);
  useEffect(() => {
    recordedTxs().then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <section className="setsec">
      <h2>Recorded Transactions</h2>
      <p className="lede">
        The demo and attack runs, re-read from the chain on page load: payments, approvals, sub-reins, and the payments the
        contract refused. Each also passes <code>bun run verify</code> without any keys.
      </p>
      {items === null && <p className="subnote">Reading from RPC…</p>}
      {items?.length === 0 && <p className="subnote">No recorded transactions in this build.</p>}
      {items?.map((t) => {
        const ok = t.expect === "panic" ? t.panic?.includes(t.code ?? "") : t.events.some((e) => e.event === t.expect);
        return (
          <div key={t.txHash} className="setrow">
            <div className="main">
              {t.label}
              <div className="sub">
                {t.panic && t.panic !== "unavailable" ? `reverted: ${t.panic}` : t.events.map((e) => e.event).join(", ") || "·"}
                {t.at ? ` · ${new Date(t.at * 1000).toLocaleString()}` : ""} · {ok ? "matches" : "does not match"} the record
              </div>
            </div>
            <div className="acts">
              <a className="acretry" href={txUrl(t.txHash)} target="_blank" rel="noreferrer">
                {shortHex(t.txHash, 8, 0)}
              </a>
            </div>
          </div>
        );
      })}
    </section>
  );
}
