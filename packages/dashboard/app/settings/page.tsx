"use client";

// /settings: the owner's operating surface around the reins — the vault, the
// approvals waiting for you, blocklist overrides, agent keys on your account and
// the panic button. Same shell; every write is signed by your NEAR wallet.

import { useCallback, useEffect, useState } from "react";
import { fromYocto, type PayRequest } from "@reins/sdk";
import { api, reins, type CardState } from "@/lib/api";
import { CONTRACT_ID } from "@/lib/chain";
import { nearToYocto, useWallet, type Wallet } from "@/lib/near";
import { Cockpit } from "../components/Shell";
import { shortHex } from "../components/ui";

export default function SettingsPage() {
  const wallet = useWallet();
  const owner = wallet.accountId;
  const [cards, setCards] = useState<CardState[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!owner) return;
    try {
      const { tree } = await api.tree(owner);
      const flat = (ns: typeof tree): CardState[] => ns.flatMap((n) => [n.card, ...flat(n.children)]);
      setCards(flat(tree));
    } catch {
      /* the sections report their own errors */
    }
  }, [owner]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!wallet.ready) return <main className="narrow">Loading…</main>;
  if (!owner) {
    return (
      <main className="narrow">
        <div className="panel">
          <p className="subnote">
            Settings act on your own reins.{" "}
            <button className="acretry" onClick={wallet.signIn}>
              Sign in with NEAR
            </button>
          </p>
        </div>
      </main>
    );
  }

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <Cockpit back={{ href: "/app", label: "Dashboard" }} wallet={wallet} refresh={refresh} onLogout={() => void wallet.signOut()} address={owner}>
      <div style={{ padding: "0 8px" }}>
        <h1 style={{ fontSize: 22, margin: "4px 0 14px" }}>Settings</h1>
        {msg && <p className="ok" style={{ margin: "0 0 10px" }}>{msg}</p>}
        <VaultSection owner={owner} wallet={wallet} flash={flash} />
        <ApprovalsSection owner={owner} wallet={wallet} flash={flash} />
        <AllowSection owner={owner} wallet={wallet} flash={flash} />
        <KeysSection owner={owner} cards={cards} />
        <PanicSection wallet={wallet} cards={cards} flash={flash} refresh={refresh} />
      </div>
    </Cockpit>
  );
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------------------

function VaultSection({ owner, wallet, flash }: { owner: string; wallet: Wallet; flash: (m: string) => void }) {
  const [vault, setVault] = useState<string | null>(null);
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api.vault(owner).then(setVault).catch((e) => setErr(errText(e))), [owner]);
  useEffect(() => {
    void load();
  }, [load]);

  const go = (method: "deposit" | "withdraw") => async () => {
    setBusy(true);
    setErr(null);
    try {
      if (method === "deposit") await wallet.call("deposit", {}, amount);
      else await wallet.call("withdraw", { amount: nearToYocto(amount).toString() });
      flash(method === "deposit" ? `Deposited Ⓝ${amount}` : `Withdrew Ⓝ${amount}`);
      await load();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="setsec">
      <h2>Vault</h2>
      <p className="lede">
        Reins pay out of this balance, held for you by <code>{CONTRACT_ID}</code>. Only your full-access key can withdraw:
        withdrawing needs an attached deposit, which a function-call key cannot make.
      </p>
      {err && <p className="err">{err}</p>}
      <div className="setrow">
        <div className="main">
          Ⓝ{vault ?? "–"}
          <div className="sub">spendable by your reins, within their terms</div>
        </div>
      </div>
      <div className="crform">
        <label className="span2">
          Amount · NEAR
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </label>
        <div className="cractions">
          <button className="primary" disabled={busy || !(parseFloat(amount) > 0)} onClick={go("deposit")}>
            Deposit
          </button>
          <button className="acretry" disabled={busy || !(parseFloat(amount) > 0)} onClick={go("withdraw")}>
            Withdraw
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ApprovalsSection({ owner, wallet, flash }: { owner: string; wallet: Wallet; flash: (m: string) => void }) {
  const [items, setItems] = useState<PayRequest[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setItems(await api.pending(owner));
      setErr(null);
    } catch (e) {
      setErr(errText(e));
    }
  }, [owner]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const act = (method: "approve_request" | "reject_request", id: number) => async () => {
    try {
      await wallet.call(method, { id });
      flash(method === "approve_request" ? `Request ${id} approved · paid` : `Request ${id} rejected`);
      await load();
    } catch (e) {
      setErr(errText(e));
    }
  };

  return (
    <section className="setsec">
      <h2>Approvals</h2>
      <p className="lede">
        Payments above a rein&apos;s threshold wait here for 24 hours. Approving checks every other rule again, then pays
        from the vault.
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
            <button className="acretry" onClick={act("approve_request", r.id)}>
              approve
            </button>
            <button className="danger-ghost" onClick={act("reject_request", r.id)}>
              reject
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------

function AllowSection({ owner, wallet, flash }: { owner: string; wallet: Wallet; flash: (m: string) => void }) {
  const [account, setAccount] = useState("");
  const [state, setState] = useState<{ reports: number; blocked: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const look = async () => {
    setErr(null);
    try {
      const [r, b] = await Promise.all([api.reports(account), api.isBlocked(owner, account)]);
      setState({ reports: r.length, blocked: b });
    } catch (e) {
      setErr(errText(e));
    }
  };
  const set = (allowed: boolean) => async () => {
    try {
      await wallet.call("set_allow", { receiver: account, allowed });
      flash(allowed ? `${account} allowed for your reins` : `${account} override removed`);
      await look();
    } catch (e) {
      setErr(errText(e));
    }
  };

  return (
    <section className="setsec">
      <h2>Blocklist Overrides</h2>
      <p className="lede">
        A bonded report blocks an account for every owner. If you know it is legitimate, allow it for your reins only; no one
        else&apos;s reins change.
      </p>
      {err && <p className="err">{err}</p>}
      <div className="crform">
        <label className="span2">
          Account
          <input value={account} onChange={(e) => setAccount(e.target.value.trim())} placeholder="merchant.testnet" />
        </label>
        <div className="cractions">
          <button className="primary" disabled={!account} onClick={look}>
            Look up
          </button>
        </div>
      </div>
      {state && (
        <div className="setrow">
          <div className="main">
            {account}
            <div className="sub">
              {state.reports} report(s) · {state.blocked ? "blocked for your reins" : "not blocked for your reins"}
            </div>
          </div>
          <div className="acts">
            {state.blocked ? (
              <button className="acretry" onClick={set(true)}>
                allow
              </button>
            ) : state.reports > 0 ? (
              <button className="danger-ghost" onClick={set(false)}>
                remove override
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Remaining gas allowance of each agent key on the owner account (view_access_key). */
function KeysSection({ owner, cards }: { owner: string; cards: CardState[] }) {
  const [allow, setAllow] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let live = true;
    Promise.all(
      cards.map(async (c) => [c.agent_key, await keyAllowance(owner, c.agent_key)] as const),
    ).then((rows) => live && setAllow(Object.fromEntries(rows)));
    return () => {
      live = false;
    };
  }, [owner, cards]);

  return (
    <section className="setsec">
      <h2>Agent Keys</h2>
      <p className="lede">
        Each rein is a function-call key on {owner}: methods <code>pay</code>, <code>request_approval</code>,{" "}
        <code>issue_subrein</code> on {CONTRACT_ID}, no deposits, and a gas allowance that runs down with use. A key with
        no allowance left can no longer sign.
      </p>
      {cards.length === 0 && <p className="subnote">No reins yet.</p>}
      {cards.map((c) => {
        const a = allow[c.agent_key];
        return (
          <div key={c.card_id} className="setrow">
            <div className="main">
              #{c.card_id} {c.name}
              <div className="sub">
                {shortHex(c.agent_key, 16, 4)} · {c.status} ·{" "}
                {a === undefined ? "reading…" : a === null ? "not on the account" : `gas allowance Ⓝ${a}`}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

async function keyAllowance(owner: string, publicKey: string): Promise<string | null> {
  const fn = (reins as unknown as { keyAllowance?: (o: string, k: string) => Promise<string | null> }).keyAllowance;
  if (fn) return fn.call(reins, owner, publicKey).then((v) => (v === null ? null : fromYocto(v)));
  try {
    const r = (await reins.provider.viewAccessKey({ accountId: owner, publicKey })) as {
      permission: { FunctionCall?: { allowance: string | null } } | string;
    };
    const fc = typeof r.permission === "object" ? r.permission.FunctionCall : undefined;
    return fc?.allowance ? fromYocto(fc.allowance) : "unlimited";
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------

function PanicSection({ wallet, cards, flash, refresh }: { wallet: Wallet; cards: CardState[]; flash: (m: string) => void; refresh: () => Promise<void> }) {
  const live = cards.filter((c) => c.status !== "revoked").length;
  const [armed, setArmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="setsec">
      <h2>Panic Button</h2>
      <p className="lede">One transaction revokes every rein and sub-rein you own. Agents holding their keys can no longer pay.</p>
      {err && <p className="err">{err}</p>}
      <div className="setrow">
        <div className="main">
          {live} live rein(s)
          <div className="sub">revoke_all · signed by your wallet</div>
        </div>
        <div className="acts">
          {!armed ? (
            <button className="danger-ghost" disabled={live === 0} onClick={() => setArmed(true)}>
              revoke everything
            </button>
          ) : (
            <>
              <button className="acretry" onClick={() => setArmed(false)}>
                cancel
              </button>
              <button
                className="danger-ghost"
                onClick={async () => {
                  try {
                    await wallet.call("revoke_all", {});
                    flash("Every rein revoked");
                    setArmed(false);
                    await refresh();
                  } catch (e) {
                    setErr(errText(e));
                  }
                }}
              >
                yes, revoke all
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
