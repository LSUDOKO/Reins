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

function SignIn({ onSignIn }: { onSignIn: () => void }) {
  const facts = [
    { i: <DKey size={22} />, t: "Your wallet signs every owner action. Reins never sees a key of yours." },
    { i: <DShield size={22} />, t: "Agents get a separate key that can only call three methods and can't attach money." },
    { i: <DAgent size={22} />, t: "Works with MyNearWallet, HOT, Intear, HERE and Sender on testnet." },
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
          <p className="demo">
            No testnet wallet? <a href="?demo=1">Look around the demo owner</a> ({DEMO_OWNER}) read-only.
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
          <SpinBadge className="gatebadge" text="Sign in • Set limits • Hand a key •" />
        </div>
      </motion.div>
    </main>
  );
}
