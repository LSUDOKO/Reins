/** Read-only access to a Reins deployment over JSON-RPC. No keys needed. */
import { JsonRpcProvider } from "near-api-js";
import type { PayRequest, Preview, Rein, Report, Stats } from "./types";

export const DEFAULTS = {
  network: "testnet",
  rpc: process.env.NEAR_RPC ?? "https://test.rpc.fastnear.com",
  archivalRpc: process.env.NEAR_ARCHIVAL_RPC ?? "https://archival-rpc.testnet.near.org",
  contractId: process.env.REINS_CONTRACT ?? "reins-demo.testnet",
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
  reinForKey(owner: string, public_key: string) { return this.view<Rein | null>("rein_for_key", { owner, public_key }); }
  vaultOf(owner: string) { return this.view<string>("vault_of", { owner }); }
  getRequest(id: number) { return this.view<PayRequest | null>("get_request", { id }); }
  pendingRequestsOf(owner: string) { return this.view<PayRequest[]>("pending_requests_of", { owner }); }
  reportsOf(account: string) { return this.view<Report[]>("reports_of", { account }); }
  isBlocked(owner: string, receiver: string) { return this.view<boolean>("is_blocked", { owner, receiver }); }
  pairCount(owner: string, receiver: string) { return this.view<number>("pair_count", { owner, receiver }); }
  stats() { return this.view<Stats>("stats"); }
  version() { return this.view<string>("version"); }

  previewPay(owner: string, public_key: string, receiver: string, amount: string) {
    return this.view<Preview>("preview_pay", { owner, public_key, receiver, amount });
  }
}
