"use client";

// The sign-in gate. Console pages open only for a signed-in NEAR wallet. Judges
// without a wallet can still look around the demo owner read-only: `?demo=1`
// turns that on for the rest of the tab session.

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useWallet } from "@/lib/near";
import { DEMO_OWNER } from "@/lib/chain";
import { Brush, DAgent, DBranch, DKey, DShield, SpinBadge, Wordmark } from "./Brand";

const DEMO_KEY = "reins-demo";

/** True when the tab is in read-only demo mode (`?demo=1` seen this session). */
export function useDemoMode(): boolean | null {
  const [demo, setDemo] = useState<boolean | null>(null);
  useEffect(() => {
    let on = false;
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("demo") === "1" || q.get("owner")) sessionStorage.setItem(DEMO_KEY, "1");
      if (q.get("demo") === "0") sessionStorage.removeItem(DEMO_KEY);
      on = sessionStorage.getItem(DEMO_KEY) === "1";
    } catch {
      on = new URLSearchParams(window.location.search).get("demo") === "1";
    }
    setDemo(on);
  }, []);
  return demo;
}

export function SignInGate({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const demo = useDemoMode();
  if (wallet.accountId || demo) return <>{children}</>;
  if (!wallet.ready || demo === null) return <div className="gate" aria-busy="true" />;
  return <SignIn onSignIn={wallet.signIn} />;
}

/**
 * Testnet demo sign-in: one click creates a faucet-funded testnet account whose key stays in
 * this tab, or paste an existing testnet account + key (e.g. from ~/.near-credentials).
 */
function DemoSignIn() {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [acct, setAcct] = useState("");
  const [key, setKey] = useState("");
  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await wallet.signInDemo();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="demo-signin" style={{ marginTop: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="abtn" style={{ height: 46 }} onClick={create} disabled={busy} data-testid="demo-account">
          {busy ? "Creating testnet account…" : "Create a testnet demo account"}
        </button>
        <button className="ghost" style={{ height: 46 }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Use a testnet key
        </button>
      </div>
      {open && (
        <form
          style={{ display: "grid", gap: 8, maxWidth: 460 }}
          onSubmit={(e) => {
            e.preventDefault();
            try {
              wallet.signInWithKey(acct, key);
            } catch {
              setErr("That does not look like an ed25519:… secret key.");
            }
          }}
        >
          <input aria-label="Testnet account" placeholder="you.testnet" value={acct} onChange={(e) => setAcct(e.target.value)} autoComplete="off" />
          <input aria-label="Secret key" placeholder="ed25519:… (testnet only, stays in this tab)" value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" />
          <button className="primary" style={{ height: 44 }} disabled={!acct || !key}>Sign in with key</button>
        </form>
      )}
      {err && <p role="alert" style={{ color: "var(--bad, #a3271f)", margin: 0, fontSize: 13 }}>{err}</p>}
      <p style={{ margin: 0, fontSize: 12.5, opacity: 0.75 }}>
        Testnet only. The demo account&apos;s key lives in this browser tab and is gone when you close it.
      </p>
    </div>
  );
}

function SignIn({ onSignIn }: { onSignIn: () => void }) {
  const facts = [
    { i: <DKey size={22} />, t: "Your wallet signs every owner action. Reins never sees a key of yours." },
    { i: <DShield size={22} />, t: "Agents get a separate key that can only call three methods and can't attach money." },
    { i: <DAgent size={22} />, t: "Use HOT, Intear, HERE or Sender on testnet, or create a one-click testnet demo account." },
  ];
  return (
    <main className="gate">
      <motion.div className="sheet" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
        <div className="gl">
          <Wordmark href="/" />
          <h1>
            <Brush delay={0.3}>Sign in</Brush>
            <br />
            to your reins
          </h1>
          <p>Connect the NEAR testnet account that owns the money. From there you create reins, hand keys to agents and approve big payments.</p>
          <ul className="facts">
            {facts.map((f) => (
              <li key={f.t}>
                {f.i}
                <span>{f.t}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <button className="primary" style={{ height: 50, padding: "0 30px", fontSize: 15 }} onClick={onSignIn} data-testid="signin">
              Connect NEAR wallet
            </button>
            <Link className="abtn" href="/" style={{ height: 50 }}>
              Back home
            </Link>
          </div>
          <DemoSignIn />
          <p className="demo">
            Just looking? <a href="?demo=1">Look around the demo owner</a> ({DEMO_OWNER}) read-only.
          </p>
        </div>
        <div className="gr" aria-hidden>
          <DBranch size={220} style={{ position: "absolute", left: -40, bottom: -30, color: "rgba(185,217,138,.55)", transform: "rotate(20deg)" }} />
          <DBranch size={180} style={{ position: "absolute", right: -30, top: -20, color: "rgba(185,217,138,.4)", transform: "rotate(200deg)" }} />
          <motion.div initial={{ rotate: -8, y: 20, opacity: 0 }} animate={{ rotate: -6, y: 0, opacity: 1 }} transition={{ delay: 0.25, type: "spring", stiffness: 80, damping: 14 }}>
            <div className="rc" style={{ position: "relative", width: 280, height: 170, background: "#173f27", borderRadius: 14, padding: 22, color: "#e8ea4f", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 30px 50px -20px rgba(0,0,0,.6)" }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 34, textTransform: "uppercase", lineHeight: 0.9 }}>Your rein</span>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "#b9d98a" }}>budget · cap · approvals</span>
            </div>
          </motion.div>
          <SpinBadge className="gatebadge" text="Sign in • Hand a key •" />
        </div>
      </motion.div>
    </main>
  );
}
