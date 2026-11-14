// The console's data layer: every read is a view call on the Reins contract over
// public RPC (no server, no keys). Reins arrive in the console's card shape so the
// deck, the term sheet and the sub-rein rows render them unchanged.

import { ReinsClient, checkCounterparty, fromYocto, panicOf, parseEvents, type Assessment, type PayRequest, type Rein, type Report, type Stats } from "@reins/sdk";
import { BASE_PATH, CONTRACT_ID, RPC_URL } from "./chain";

export const reins = new ReinsClient(CONTRACT_ID, RPC_URL);

export type CardTermsInput = {
  pay?: { period?: { amount: string; seconds: number }; lifetime?: { amount: string } };
  expiry?: number;
  maxUses?: number;
  perTxMax?: string;
  approvalAbove?: string;
  merchants?: string[];
  subcards?: boolean;
};

export type CardState = {
  card_id: string;
  name: string;
  status: string;
  terms: CardTermsInput;
  remaining_this_period: string | null;
  remaining_lifetime: string | null;
  period_resets_at: number | null;
  expires_at: number | null;
  uses_remaining: number | null;
  subcards: string[];
  parent_card_id?: string | null;
  created_at?: number;
  agent_key: string;
  owner: string;
  uses: number;
  total_spent: string;
  raw: Rein;
};

export type TreeNode = { card: CardState; children: TreeNode[] };

export type Charge = {
  id: string;
  kind: string;
  to: string | null;
  amount: string;
  fee: string;
  status: string;
  tx: string | null;
  memo: string | null;
  at: number;
  rein_id: number;
};

const NS = 1_000_000_000;

export function toCard(r: Rein): CardState {
  const period = Number(r.terms.period_secs);
  const budget = fromYocto(r.terms.budget, 6);
  const windowStart = Number(r.window_start) / NS;
  const elapsed = period > 0 && Date.now() / 1000 >= windowStart + period;
  const spent = elapsed ? 0n : BigInt(r.spent);
  const remaining = fromYocto(BigInt(r.terms.budget) - spent > 0n ? BigInt(r.terms.budget) - spent : 0n, 6);
  return {
    card_id: String(r.id),
    name: r.label,
    status: r.status.toLowerCase(),
    terms: {
      pay: period > 0 ? { period: { amount: budget, seconds: period } } : { lifetime: { amount: budget } },
      expiry: r.terms.expires_at ? Number(r.terms.expires_at) : undefined,
      maxUses: r.terms.max_uses ?? undefined,
      perTxMax: fromYocto(r.terms.per_tx_cap, 6),
      approvalAbove: r.terms.approval_above ? fromYocto(r.terms.approval_above, 6) : undefined,
      merchants: r.terms.merchants ?? undefined,
      subcards: true,
    },
    remaining_this_period: period > 0 ? remaining : null,
    remaining_lifetime: period > 0 ? null : remaining,
    period_resets_at: period > 0 ? (elapsed ? null : Math.floor(windowStart + period)) : null,
    expires_at: r.terms.expires_at ? Number(r.terms.expires_at) : null,
    uses_remaining: r.terms.max_uses != null ? Math.max(0, r.terms.max_uses - r.uses) : null,
    subcards: r.children.map(String),
    parent_card_id: r.parent != null ? String(r.parent) : null,
    created_at: Math.floor(Number(r.created_at) / NS),
    agent_key: r.agent_key,
    owner: r.owner,
    uses: r.uses,
    total_spent: fromYocto(r.total_spent, 6),
    raw: r,
  };
}

export function buildTree(list: Rein[]): TreeNode[] {
  const cards = new Map(list.map((r) => [r.id, toCard(r)]));
  const node = (id: number): TreeNode => ({
    card: cards.get(id)!,
    children: (list.find((r) => r.id === id)?.children ?? []).filter((c) => cards.has(c)).map(node),
  });
  // newest first, revoked last: the live reins lead the deck
  const rank = (r: Rein) => (r.status === "Revoked" ? 1 : 0);
  return list
    .filter((r) => r.parent == null)
    .sort((a, b) => rank(a) - rank(b) || b.id - a.id)
    .map((r) => node(r.id));
}

/** Find a rein's node anywhere in the forest. */
export function findNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const n of tree) {
    if (n.card.card_id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The recorded transactions (demo/receipts.json, copied in at build) are read
// back from the chain itself: each tx's NEP-297 events become activity rows.
// ---------------------------------------------------------------------------

export type RecordedTx = { label: string; txHash: string; signer: string; expect: string; code?: string };

async function rpc(method: string, params: unknown): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "reins", method, params }),
  }).then((r) => r.json());
  if (res.error) throw new Error(res.error?.cause?.name ?? res.error.message ?? "rpc error");
  return res.result;
}

let receiptsCache: Promise<RecordedTx[]> | null = null;
export function recorded(): Promise<RecordedTx[]> {
  receiptsCache ??= fetch(`${BASE_PATH}/receipts.json`)
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return receiptsCache;
}

export type TxView = RecordedTx & { at: number; events: { event: string; data: any }[]; panic?: string };

let txCache: Promise<TxView[]> | null = null;
/** Every recorded tx, re-read from RPC with its block time, events and any revert. */
export function recordedTxs(): Promise<TxView[]> {
  txCache ??= recorded().then((list) =>
    Promise.all(
      list.map(async (r) => {
        try {
          const tx = await rpc("tx", { tx_hash: r.txHash, sender_account_id: r.signer, wait_until: "FINAL" });
          const block = await rpc("block", { block_id: tx.transaction_outcome.block_hash });
          return {
            ...r,
            at: Math.floor(Number(block.header.timestamp) / NS),
            events: parseEvents(tx).map((e) => ({ event: e.event, data: e.data[0] })),
            panic: panicOf(tx),
          };
        } catch {
          return { ...r, at: 0, events: [], panic: "unavailable" };
        }
      }),
    ),
  );
  return txCache;
}

/** Activity rows for a set of reins, from the recorded transactions' events. */
export async function chargesFor(ids: string[]): Promise<Charge[]> {
  const want = new Set(ids);
  const rows: Charge[] = [];
  for (const t of await recordedTxs()) {
    for (const e of t.events) {
      if (e.event !== "payment" && e.event !== "payment_failed") continue;
      if (!want.has(String(e.data.rein_id))) continue;
      rows.push({
        id: `${t.txHash}:${e.event}`,
        kind: "near",
        to: e.data.receiver,
        amount: fromYocto(e.data.amount, 6),
        fee: "0",
        status: e.event === "payment" ? "settled" : "failed",
        tx: t.txHash,
        memo: e.data.memo ?? null,
        at: t.at,
        rein_id: Number(e.data.rein_id),
      });
    }
  }
  return rows.sort((a, b) => b.at - a.at);
}

export const api = {
  tree: async (owner: string) => ({ tree: buildTree(await reins.reinsOf(owner)) }),
  vault: (owner: string) => reins.vaultOf(owner).then((v) => fromYocto(v, 6)),
  pending: (owner: string): Promise<PayRequest[]> => reins.pendingRequestsOf(owner),
  reports: (account: string): Promise<Report[]> => reins.reportsOf(account),
  isBlocked: (owner: string, account: string) => reins.isBlocked(owner, account),
  pairCount: (owner: string, account: string) => reins.pairCount(owner, account),
  stats: (): Promise<Stats> => reins.stats(),
  check: (owner: string, account: string): Promise<Assessment> => checkCounterparty(owner, account, { client: reins }),
};
