"use client";

// /guard: the guard console. Reins decides what may be spent; this page shows how:
// the contract's live numbers, the counterparty check, the rules in the order the
// contract checks them, and the recorded transactions re-read from the chain.
// Read-only: nothing on this page moves money.

import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { DEMO_OWNER } from "@/lib/chain";
import { useWallet } from "@/lib/near";
import { Cockpit } from "../components/Shell";
import Guard from "../components/Guard";

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
  // The pane owns its own polling; the shell's refresh has nothing to re-read.
  const refresh = useCallback(async () => {}, []);

  return (
    <Cockpit back={{ href: "/app", label: "Dashboard" }} wallet={wallet} refresh={refresh} onLogout={() => void wallet.signOut()} address={owner}>
      <div style={{ padding: "0 8px" }}>
        <h1 style={{ fontSize: 22, margin: "4px 0 14px" }}>Guard</h1>
        <Guard owner={owner} />
      </div>
    </Cockpit>
  );
}
