/**
 * Collects counterparty signals for a receiver. Each source is independent and fails soft:
 * an unreachable source yields `null`, which the policy reports as "unavailable".
 *
 * | Signal              | Source                                                        |
 * | ------------------- | ------------------------------------------------------------- |
 * | exists, is contract | RPC `view_account` (code_hash != 1111…)                       |
 * | code changed        | archival RPC `view_account` ~7 days of blocks ago vs now      |
 * | account age         | NEARBlocks `/v1/account/{id}` -> `created.block_timestamp`    |
 * | prior interactions  | Reins `pair_count(owner, receiver)` (settled payments)        |
 * | shared blocklist    | Reins `reports_of` + `is_blocked(owner, receiver)`            |
 * | look-alike name     | local: skeleton + edit distance against known merchants       |
 */
import { assess, type Assessment, type Signals } from "./policy";
import { DEFAULTS, ReinsClient } from "./client";

const EMPTY_CODE = "11111111111111111111111111111111";
/** ~7 days of testnet blocks at ~0.6 s per block. */
export const WEEK_OF_BLOCKS = 1_000_000;

type Fetch = typeof fetch;

async function rpc(url: string, method: string, params: unknown, f: Fetch): Promise<any> {
  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "reins", method, params }),
    signal: AbortSignal.timeout(8000),
  });
  return res.json();
}

export interface CounterpartyOptions {
  client?: ReinsClient;
  archivalRpc?: string;
  nearblocks?: string;
  fetch?: Fetch;
  /** Merchant allowlist of the rein, if any. */
  merchants?: string[] | null;
  /** Extra accounts the owner trusts, for look-alike detection. */
  known?: string[];
}

export function isImplicit(id: string): boolean {
  return /^[0-9a-f]{64}$/.test(id) || /^0x[0-9a-f]{40}$/.test(id);
}

export async function collectSignals(owner: string, receiver: string, o: CounterpartyOptions = {}): Promise<Signals> {
  const client = o.client ?? new ReinsClient();
  const f = o.fetch ?? fetch;
  const archival = o.archivalRpc ?? DEFAULTS.archivalRpc;
  const nearblocks = o.nearblocks ?? DEFAULTS.nearblocks;
  const soft = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

  const [acct, created, prior, reports, blocked] = await Promise.all([
    soft(rpc(client.rpcUrl, "query", { request_type: "view_account", finality: "final", account_id: receiver }, f)),
    soft(f(`${nearblocks}/v1/account/${receiver}`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json())),
    soft(client.pairCount(owner, receiver)),
    soft(client.reportsOf(receiver)),
    soft(client.isBlocked(owner, receiver)),
  ]);

  let exists: boolean | null = null;
  let isContract: boolean | null = null;
  let height: number | null = null;
  if (acct?.result) {
    exists = true;
    isContract = acct.result.code_hash !== EMPTY_CODE;
    height = acct.result.block_height;
  } else if (acct?.error) {
    const cause = acct.error?.cause?.name;
    exists = cause === "UNKNOWN_ACCOUNT" ? false : null;
  }

  let codeChangedRecently: boolean | null = null;
  if (isContract && height) {
    const old = await soft(rpc(archival, "query",
      { request_type: "view_account", block_id: height - WEEK_OF_BLOCKS, account_id: receiver }, f));
    if (old?.result) codeChangedRecently = old.result.code_hash !== acct.result.code_hash;
    else if (old?.error?.cause?.name === "UNKNOWN_ACCOUNT") codeChangedRecently = true; // did not exist a week ago
  }

  const ts = created?.account?.[0]?.created?.block_timestamp;
  const ageDays = typeof ts === "number" || typeof ts === "string"
    ? (Date.now() - Number(BigInt(ts) / 1_000_000n)) / 86_400_000
    : exists === false ? 0 : null;

  const merchants = o.merchants ?? [];
  return {
    receiver,
    exists,
    implicit: isImplicit(receiver),
    ageDays,
    isContract,
    codeChangedRecently,
    priorPayments: prior,
    reportCount: reports ? reports.length : null,
    reportEvidence: (reports ?? []).map((r) => r.evidence_uri),
    blockedForOwner: blocked,
    allowlisted: merchants.includes(receiver),
    known: [...merchants, ...(o.known ?? [])],
  };
}

export async function checkCounterparty(owner: string, receiver: string, o: CounterpartyOptions = {}): Promise<Assessment> {
  return assess(await collectSignals(owner, receiver, o));
}
