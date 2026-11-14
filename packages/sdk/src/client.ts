/** Read-only access to a Reins deployment over JSON-RPC. No keys needed. */
import { JsonRpcProvider } from "near-api-js";
import type { PayRequest, Preview, Rein, Report, Stats } from "./types";

export const DEFAULTS = {
  network: "testnet",
  rpc: process.env.NEAR_RPC ?? "https://test.rpc.fastnear.com",
  archivalRpc: process.env.NEAR_ARCHIVAL_RPC ?? "https://archival-rpc.testnet.near.org",
  contractId: process.env.REINS_CONTRACT ?? "reins-near.testnet",
  nearblocks: process.env.NEARBLOCKS_API ?? "https://api-testnet.nearblocks.io",
};

export class ReinsClient {
  readonly provider: JsonRpcProvider;

  constructor(
    readonly contractId = DEFAULTS.contractId,
    readonly rpcUrl = DEFAULTS.rpc,
  ) {
    this.provider = new JsonRpcProvider({ url: rpcUrl });
  }

  async view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    return (await this.provider.callFunction({ contractId: this.contractId, method, args })) as T;
  }

  getRein(id: number) { return this.view<Rein | null>("get_rein", { id }); }
  reinsOf(owner: string) { return this.view<Rein[]>("reins_of", { owner }); }
  reinForKey(account: string, public_key: string) { return this.view<Rein | null>("rein_for_key", { account, public_key }); }
  vaultOf(owner: string) { return this.view<string>("vault_of", { owner }); }
  getRequest(id: number) { return this.view<PayRequest | null>("get_request", { id }); }
  pendingRequestsOf(owner: string) { return this.view<PayRequest[]>("pending_requests_of", { owner }); }
  reportsOf(account: string) { return this.view<Report[]>("reports_of", { account }); }
  isBlocked(owner: string, receiver: string) { return this.view<boolean>("is_blocked", { owner, receiver }); }
  pairCount(owner: string, receiver: string) { return this.view<number>("pair_count", { owner, receiver }); }
  stats() { return this.view<Stats>("stats"); }
  tokenVaultOf(owner: string, token: string) { return this.view<string>("token_vault_of", { owner, token }); }
  mpcContract() { return this.view<string>("mpc_contract"); }
  evmPath(rein_id: number) { return this.view<string>("evm_path", { rein_id }); }
  version() { return this.view<string>("version"); }

  /**
   * Remaining gas allowance of an agent's function-call key on the owner account, in
   * yoctoNEAR. `null` when the key is not on the account (deleted, or never added).
   */
  async keyAllowance(owner: string, publicKey: string): Promise<string | null> {
    const res = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query",
        params: { request_type: "view_access_key", finality: "final", account_id: owner, public_key: publicKey } }),
    }).then((r) => r.json() as Promise<any>);
    const fc = res?.result?.permission?.FunctionCall;
    if (!res?.result) return null;
    return fc ? String(fc.allowance ?? "unlimited") : "full_access";
  }

  previewPay(owner: string, public_key: string, receiver: string, amount: string) {
    return this.view<Preview>("preview_pay", { owner, public_key, receiver, amount });
  }
}
