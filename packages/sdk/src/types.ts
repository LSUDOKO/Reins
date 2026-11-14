/** Mirrors of the contract's JSON types (contracts/reins/src/types.rs). */
export type Status = "Active" | "Frozen" | "Revoked";
export type RequestState = "Pending" | "Approved" | "Rejected" | "Expired";

export interface Terms {
  budget: string;
  period_secs: string;
  per_tx_cap: string;
  approval_above?: string | null;
  expires_at?: string | null;
  max_uses?: number | null;
  merchants?: string[] | null;
  /** NEP-141 token the budget is in; null = NEAR. */
  token?: string | null;
  /** EVM chain id for Chain Signatures reins (amounts in wei). */
  evm_chain_id?: string | null;
}

export interface Rein {
  id: number;
  owner: string;
  /** Account holding the agent key: the owner or a named sub-account of it. */
  agent_account: string;
  agent_key: string;
  label: string;
  parent: number | null;
  children: number[];
  terms: Terms;
  status: Status;
  spent: string;
  window_start: string;
  uses: number;
  total_spent: string;
  created_at: string;
  pending_requests: number;
  evm_nonce: string;
}

export interface PayRequest {
  id: number;
  rein_id: number;
  owner: string;
  receiver: string;
  amount: string;
  memo: string | null;
  state: RequestState;
  created_at: string;
  expires_at: string;
}

export interface Report {
  reporter: string;
  evidence_hash: string;
  evidence_uri: string;
  bond: string;
  created_at: string;
}

export interface Preview {
  ok: boolean;
  code: string | null;
  needs_approval: boolean;
  rein_id: number | null;
  remaining: string;
  vault: string;
}

export interface Stats {
  reins: number;
  requests: number;
  payments: number;
  volume: string;
  evm_signatures: number;
}

/** The only methods an agent key is ever granted. */
export const AGENT_METHODS = ["pay", "pay_evm", "request_approval", "issue_subrein"] as const;
