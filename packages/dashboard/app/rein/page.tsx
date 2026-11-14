"use client";

// Rein detail (/rein?id=3): the same slab language, scoped to one rein and its
// direct sub-reins. A single dossier · no carousel, no create affordance.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildTree, chargesFor, findNode, reins, type TreeNode } from "@/lib/api";
import { useWallet } from "@/lib/near";
import { Cockpit } from "../components/Shell";
import { Dossier } from "../components/Dossier";
import type { FeedRow } from "../components/Activity";

export default function ReinPage() {
  return (
    <Suspense>
      <ReinInner />
    </Suspense>
  );
}

function ReinInner() {
  const id = useSearchParams().get("id") ?? "";
  const wallet = useWallet();
  const [node, setNode] = useState<TreeNode | null>(null);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rein = await reins.getRein(Number(id));
      if (!rein) throw new Error(`no rein #${id}`);
      const n = findNode(buildTree(await reins.reinsOf(rein.owner)), id);
      setNode(n);
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    setNode(null);
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const idsKey = node ? [node.card.card_id, ...node.children.map((c) => c.card.card_id)].join(",") : "";
  useEffect(() => {
    if (!node) return;
    const names = new Map([node.card, ...node.children.map((c) => c.card)].map((c) => [c.card_id, c.name]));
    chargesFor(idsKey.split(","))
      .then((rows) => setFeed(rows.map((ch) => ({ ch, cardName: names.get(String(ch.rein_id)) ?? `#${ch.rein_id}` }))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (!node) {
    return (
      <main className="narrow" style={{ textAlign: "center" }}>
        <span style={{ color: "var(--body)", fontSize: 13 }}>
          Loading… {msg && <span className="err">{msg}</span>}
        </span>
      </main>
    );
  }

  const owner = node.card.owner;
  return (
    <Cockpit back={{ href: "/app", label: "Dashboard" }} wallet={wallet} refresh={refresh} onLogout={() => void wallet.signOut()} address={owner}>
      <h1 data-testid="card-status" data-status={node.card.status} style={{ position: "absolute", left: -9999, top: 0 }}>
        {node.card.name}
      </h1>
      {msg && (
        <p className="err" style={{ margin: "0 8px 10px" }}>
          {msg}
        </p>
      )}
      <Dossier
        node={node}
        kmap={new Map()}
        feed={feed}
        wallet={wallet}
        canWrite={wallet.accountId === owner}
        refresh={refresh}
        roots={[node]}
        currentId={node.card.card_id}
      />
    </Cockpit>
  );
}
