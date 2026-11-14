"use client";

// /connect: the Connect Agent wizard. Describe the rein in plain English, review
// the terms (and what they mean), create the rein and add the agent's key with one
// wallet approval, copy the MCP command into Claude Code or Codex, then run a free
// preview_pay to prove the key works. The agent secret is generated in this tab and
// kept in sessionStorage only until the wallet comes back (redirect wallets leave
// the page), so it survives the round trip and is never sent anywhere.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { KeyPair, type KeyPairString } from "near-api-js";
import type { Preview, Terms } from "@reins/sdk";
import { reins } from "@/lib/api";
import { AGENT_ALLOWANCE_NEAR, AGENT_METHODS, CONTRACT_ID, DEMO_OWNER, STORAGE_DEPOSIT_NEAR } from "@/lib/chain";
import { nearToYocto, useWallet } from "@/lib/near";
import { draft, explain, near } from "@/lib/plain";
import { Cockpit } from "../components/Shell";
import { mcpCommands } from "../components/Authority";
import { Brush } from "../components/Brand";
import { Plain } from "../components/Plain";

const PENDING = "reins-pending-agent";
const MERCHANT = process.env.NEXT_PUBLIC_DEMO_MERCHANT ?? "reins-near-shop.testnet";
const EXAMPLES = [
  "1 NEAR a day for API credits, max 0.2 per payment, ask me above 0.1",
  "0.5 NEAR a week, only reins-near-shop.testnet, expires in 14 days",
  "Research agent: 2 NEAR total, 0.25 per payment, at most 20 payments",
];
const STEPS = ["Describe", "Review", "Create rein", "Agent key", "Connect", "Test"];

type Pending = { secret: string; publicKey: string; label: string; owner: string };
type Form = { label: string; budget: string; period: number; perTx: string; approval: string; merchants: string; days: string; uses: string };

function loadPending(): Pending | null {
  try {
    const v = sessionStorage.getItem(PENDING);
    return v ? (JSON.parse(v) as Pending) : null;
  } catch {
    return null;
  }
}

function toForm(t: Terms, label: string): Form {
  return {
    label,
    budget: near(t.budget),
    period: Number(t.period_secs),
    perTx: near(t.per_tx_cap),
    approval: t.approval_above ? near(t.approval_above) : "",
    merchants: (t.merchants ?? []).join(", "),
    days: t.expires_at ? String(Math.max(1, Math.round((Number(t.expires_at) * 1000 - Date.now()) / 86_400_000))) : "",
    uses: t.max_uses ? String(t.max_uses) : "",
  };
}

function toTerms(f: Form): Terms {
  const y = (v: string) => nearToYocto(v || "0").toString();
  const uses = parseInt(f.uses, 10);
  const days = parseInt(f.days, 10);
  return {
    budget: y(f.budget),
    period_secs: String(f.period),
    per_tx_cap: y(f.perTx || f.budget),
    approval_above: f.approval.trim() ? y(f.approval) : null,
    expires_at: Number.isFinite(days) && days > 0 ? String(Math.floor(Date.now() / 1000) + days * 86400) : null,
    max_uses: Number.isFinite(uses) && uses > 0 ? uses : null,
    merchants: f.merchants.trim() ? f.merchants.split(/[\s,]+/).filter(Boolean) : null,
  };
}

export default function ConnectPage() {
  const wallet = useWallet();
  const owner = wallet.accountId ?? DEMO_OWNER;
  const refresh = useCallback(async () => {}, []);
  return (
    <Cockpit back={{ href: "/app", label: "Dashboard" }} wallet={wallet} refresh={refresh} onLogout={() => void wallet.signOut()} address={owner}>
      <Wizard owner={owner} canWrite={!!wallet.accountId} />
    </Cockpit>
  );
}

function Wizard({ owner, canWrite }: { owner: string; canWrite: boolean }) {
  const wallet = useWallet();
  const [step, setStep] = useState(0);
  const [text, setText] = useState(EXAMPLES[0]);
  const [form, setForm] = useState<Form | null>(null);
  const [plain, setPlain] = useState<{ text: string; source: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reinId, setReinId] = useState<number | null>(null);
  const [keyOn, setKeyOn] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const terms = useMemo(() => (form ? toTerms(form) : null), [form]);

  // Coming back from a redirect wallet: pick the pending agent up and check the chain.
  const check = useCallback(async (p: Pending) => {
    const r = await reins.reinForKey(p.owner, p.publicKey).catch(() => null);
    const allowance = await reins.keyAllowance(p.owner, p.publicKey).catch(() => null);
    setReinId(r?.id ?? null);
    setKeyOn(allowance !== null);
    if (r && allowance !== null) setStep(4);
    else if (r) setStep(3);
    else setStep(2);
  }, []);
  useEffect(() => {
    const p = loadPending();
    if (p && p.owner === owner) {
      setPending(p);
      void check(p);
    }
  }, [owner, check]);

  // The plain-English explanation follows the terms as they are edited.
  useEffect(() => {
    if (!terms || !form) return;
    const t = setTimeout(() => {
      explain(terms, form.label).then(setPlain).catch(() => undefined);
    }, 450);
    return () => clearTimeout(t);
  }, [terms, form]);

  async function onDraft() {
    setErr(null);
    setBusy(true);
    try {
      const r = await draft(text);
      setForm(toForm(r.terms, text.match(/^([A-Za-z][\w -]{1,30}):/)?.[1] ?? "agent"));
      setPlain({ text: r.explanation, source: r.source });
      setStep(1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    if (!terms || !form) return;
    setErr(null);
    if (!(parseFloat(form.budget) > 0)) return setErr("Set a budget above 0.");
    if (parseFloat(form.perTx || form.budget) > parseFloat(form.budget)) return setErr("The per-payment cap can't be above the budget.");
    if (form.approval && parseFloat(form.approval) >= parseFloat(form.perTx || form.budget)) return setErr("Ask-me-above must be below the per-payment cap.");
    const kp = KeyPair.fromRandom("ed25519");
    const p: Pending = { secret: kp.toString(), publicKey: kp.getPublicKey().toString(), label: form.label || "agent", owner };
    try {
      sessionStorage.setItem(PENDING, JSON.stringify(p));
    } catch {
      /* private mode: the popup wallets still work */
    }
    setPending(p);
    setBusy(true);
    try {
      await wallet.createReinWithKey(p.publicKey, p.label, terms as unknown as Record<string, unknown>, STORAGE_DEPOSIT_NEAR);
      await check(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAddKey() {
    if (!pending) return;
    setErr(null);
    setBusy(true);
    try {
      await wallet.addAgentKey(pending.publicKey);
      await check(pending);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    if (!pending) return;
    setBusy(true);
    setErr(null);
    try {
      setPreview(await reins.previewPay(pending.owner, pending.publicKey, MERCHANT, nearToYocto("0.01").toString()));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function forget() {
    try {
      sessionStorage.removeItem(PENDING);
    } catch {
      /* nothing stored */
    }
    setPending(null);
    setReinId(null);
    setKeyOn(null);
    setPreview(null);
    setStep(0);
  }

  const reachable = (i: number) => i <= 1 ? i === 0 || !!form : i <= 3 ? !!form || !!pending : !!pending && keyOn === true;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => (f ? { ...f, [k]: k === "period" ? Number(e.target.value) : e.target.value } : f));
  const slug = (pending?.label ?? "agent").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "agent";
  const cmds = pending ? mcpCommands(pending.owner, pending.secret, `reins-${slug}`) : null;

  return (
    <div style={{ padding: "6px 4px" }}>
      <h1 style={{ fontSize: "clamp(32px,5vw,56px)", lineHeight: 0.95, marginTop: 10 }}>
        <Brush>Connect an agent</Brush>
      </h1>
      <p style={{ marginTop: 14, maxWidth: 640, lineHeight: 1.65 }}>
        Six steps, about a minute. Your wallet approves once; the agent gets its own key that can only ask the Reins
        contract to pay within the limits you set.
      </p>

      <div className="wiz">
        <ol aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? "on" : i < step ? "done" : ""}>
              <button onClick={() => reachable(i) && setStep(i)} disabled={!reachable(i)} aria-current={i === step ? "step" : undefined}>
                <span className="sn">{i + 1}</span>
                <span className="lbltxt">{s}</span>
              </button>
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait">
          <motion.section
            key={step}
            className="stage"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && (
              <>
                <h2>Describe it</h2>
                <p>Say what the agent may spend, like you would tell a person. You review everything before anything is signed.</p>
                <textarea aria-label="Describe the rein" value={text} onChange={(e) => setText(e.target.value)} style={{ marginTop: 14 }} />
                <div className="row">
                  {EXAMPLES.map((x) => (
                    <button key={x} onClick={() => setText(x)} style={{ fontSize: 12, padding: "6px 12px" }}>
                      {x.length > 42 ? x.slice(0, 40) + "…" : x}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <button className="primary" onClick={onDraft} disabled={busy || !text.trim()}>
                    {busy ? "Reading…" : "Turn into terms"}
                  </button>
                </div>
              </>
            )}

            {step === 1 && form && (
              <>
                <h2>Review the terms</h2>
                <p>Change anything. The contract will enforce exactly these numbers.</p>
                <div className="terms">
                  <label>Name<input value={form.label} onChange={set("label")} maxLength={64} /></label>
                  <label>Budget (NEAR)<input inputMode="decimal" value={form.budget} onChange={set("budget")} /></label>
                  <label>
                    Resets
                    <select value={form.period} onChange={set("period")}>
                      <option value={86400}>every day</option>
                      <option value={604800}>every week</option>
                      <option value={2592000}>every 30 days</option>
                      <option value={0}>never (total)</option>
                    </select>
                  </label>
                  <label>Per payment (NEAR)<input inputMode="decimal" value={form.perTx} onChange={set("perTx")} /></label>
                  <label>Ask me above (NEAR)<input inputMode="decimal" placeholder="off" value={form.approval} onChange={set("approval")} /></label>
                  <label>Only pay<input placeholder="any account" value={form.merchants} onChange={set("merchants")} /></label>
                  <label>Expires in (days)<input inputMode="numeric" placeholder="never" value={form.days} onChange={set("days")} /></label>
                  <label>Max payments<input inputMode="numeric" placeholder="no limit" value={form.uses} onChange={set("uses")} /></label>
                </div>
                {plain && <Plain text={plain.text} source={plain.source} />}
                <div className="row">
                  <button onClick={() => setStep(0)}>Back</button>
                  <button className="primary" onClick={() => setStep(2)}>
                    Looks right
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2>Create the rein</h2>
                <p>
                  One approval in your wallet sends two transactions: <code>create_rein</code> to <code>{CONTRACT_ID}</code> (with{" "}
                  {STORAGE_DEPOSIT_NEAR} NEAR for storage, the rest goes to your vault), and a new key on your own account that can
                  only call {AGENT_METHODS.join(", ")}, with {AGENT_ALLOWANCE_NEAR} NEAR of gas allowance.
                </p>
                {reinId !== null && <p className="ok">Rein #{reinId} is on-chain.</p>}
                <div className="row">
                  {canWrite ? (
                    <button className="primary" onClick={onCreate} disabled={busy || !form || reinId !== null}>
                      {busy ? "Waiting for your wallet…" : "Create rein and key"}
                    </button>
                  ) : (
                    <button className="primary" onClick={wallet.signIn}>
                      Sign in to create
                    </button>
                  )}
                  {reinId !== null && <button onClick={() => setStep(3)}>Next</button>}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2>The agent&apos;s key</h2>
                {keyOn ? (
                  <p className="ok">The key is on {pending?.owner} as a function-call key. It can&apos;t attach money, add keys or call anything else.</p>
                ) : (
                  <p>The rein exists, but its key isn&apos;t on your account yet. Add it now.</p>
                )}
                {pending && <div className="secret" aria-label="Agent public key">{pending.publicKey}</div>}
                <div className="row">
                  {!keyOn && canWrite && (
                    <button className="primary" onClick={onAddKey} disabled={busy}>
                      {busy ? "Waiting for your wallet…" : "Add agent key"}
                    </button>
                  )}
                  {pending && (
                    <button onClick={() => void check(pending)} disabled={busy}>
                      Check again
                    </button>
                  )}
                  {keyOn && <button className="primary" onClick={() => setStep(4)}>Next</button>}
                </div>
              </>
            )}

            {step === 4 && pending && cmds && (
              <>
                <h2>Connect it</h2>
                <p>This secret is the agent&apos;s key. It&apos;s shown here once and only kept in this tab. Paste one of these into your agent&apos;s setup.</p>
                <div className="secret" style={{ marginTop: 12 }}>{pending.secret}</div>
                {[
                  ["Claude Code", cmds.cli],
                  ["Codex", cmds.codex],
                  ["Any MCP client (JSON)", cmds.json],
                ].map(([k, v]) => (
                  <Copyable key={k} label={k} text={v} />
                ))}
                <div className="row">
                  <button className="primary" onClick={() => setStep(5)}>
                    Test it
                  </button>
                </div>
              </>
            )}

            {step === 5 && pending && (
              <>
                <h2>Test the key</h2>
                <p>
                  Ask the contract what it would do if this agent paid 0.01 NEAR to <code>{MERCHANT}</code>. It&apos;s a free view call; nothing moves.
                </p>
                <div className="row">
                  <button className="primary" onClick={onTest} disabled={busy}>
                    {busy ? "Asking…" : "Run preview_pay"}
                  </button>
                </div>
                {preview && (
                  <Plain
                    text={
                      preview.ok
                        ? `The contract would pay. ${near(preview.remaining)} NEAR left in this window; the vault holds ${near(preview.vault)} NEAR.`
                        : preview.needs_approval
                          ? "The contract would ask you first: that amount is above your approval threshold."
                          : `The contract would refuse: ${preview.code?.replace(/_/g, " ")}.`
                    }
                    source="chain"
                    title={preview.ok ? "Ready" : "Refused"}
                  />
                )}
                <div className="row">
                  <Link className="abtn" href={reinId ? `/rein?id=${reinId}` : "/app"}>
                    Open the rein
                  </Link>
                  <button onClick={forget}>Done, forget the secret</button>
                </div>
              </>
            )}
            {err && <p className="err" role="alert">{err}</p>}
          </motion.section>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Copyable({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
        <strong style={{ fontSize: 13 }}>{label}</strong>
        <button
          style={{ padding: "5px 14px", fontSize: 12 }}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
        >
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bcode" style={{ marginTop: 6, fontSize: 12 }}>{text}</pre>
    </div>
  );
}
