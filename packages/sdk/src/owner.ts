/**
 * Owner side: signs with a FULL-ACCESS key of the owner account. Every contract call here
 * attaches at least 1 yoctoNEAR, which an agent's function-call key cannot do.
 */
import { Account, KeyPair, KeyPairSigner, type JsonRpcProvider } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import { AGENT_METHODS, type Terms } from "./types";
import { toYocto } from "./units";

const GAS = "100000000000000"; // 100 Tgas
const ONE_YOCTO = "1";

export interface Grant {
  reinId: number;
  publicKey: string;
  /** The agent's secret. Hand it to the agent's environment; never commit it. */
  secretKey: KeyPairString;
}

export class OwnerClient {
  readonly account: Account;

  constructor(readonly ownerId: string, secretKey: KeyPairString, provider: JsonRpcProvider, readonly contractId: string) {
    this.account = new Account(ownerId, provider, new KeyPairSigner(KeyPair.fromString(secretKey)));
  }

  private call<T>(methodName: string, args: Record<string, unknown>, deposit = ONE_YOCTO) {
    return this.account.callFunction<T>({ contractId: this.contractId, methodName, args, deposit, gas: GAS });
  }

  deposit(near: string) { return this.call<string>("deposit", {}, toYocto(near)); }
  withdraw(near: string) { return this.call("withdraw", { amount: toYocto(near) }); }

  /**
   * Create a rein and give the agent its key in two transactions:
   * 1. `create_rein` binds the new public key to the terms (deposit covers storage);
   * 2. AddKey puts that key on the owner account as a function-call key that can call
   *    only `pay`, `request_approval` and `issue_subrein` on this contract, with a gas
   *    allowance (default 0.25 NEAR).
   */
  async grantRein(label: string, terms: Terms, opts: { allowanceNear?: string; storageNear?: string; parent?: number } = {}): Promise<Grant> {
    const kp = KeyPair.fromRandom("ed25519");
    const publicKey = kp.getPublicKey().toString();
    const storage = toYocto(opts.storageNear ?? "0.02");
    const reinId = opts.parent === undefined
      ? await this.call<number>("create_rein", { agent_key: publicKey, label, terms }, storage)
      : await this.call<number>("create_subrein", { parent: opts.parent, agent_key: publicKey, label, terms }, storage);
    await this.addAgentKey(publicKey, opts.allowanceNear);
    return { reinId, publicKey, secretKey: kp.toString() as KeyPairString };
  }

  /** Activate a sub-agent key that an agent registered with `issue_subrein`. */
  addAgentKey(publicKey: string, allowanceNear = "0.25") {
    return this.account.addFunctionCallAccessKey({
      publicKey,
      contractId: this.contractId,
      methodNames: [...AGENT_METHODS],
      allowance: toYocto(allowanceNear),
    });
  }

  freeze(id: number) { return this.call("freeze", { id }); }
  unfreeze(id: number) { return this.call("unfreeze", { id }); }
  updateTerms(id: number, terms: Terms) { return this.call("update_terms", { id, terms }); }

  /** Revoke on the contract, then delete the key from the account. */
  async revoke(id: number, publicKey?: string) {
    await this.call("revoke", { id });
    if (publicKey) await this.account.deleteKey(publicKey).catch(() => undefined);
  }

  revokeAll() { return this.call<number>("revoke_all", {}); }
  approve(requestId: number) { return this.call<boolean>("approve_request", { id: requestId }); }
  reject(requestId: number) { return this.call("reject_request", { id: requestId }); }
  setAllow(receiver: string, allowed: boolean) { return this.call("set_allow", { receiver, allowed }); }

  report(account: string, evidenceHash: string, evidenceUri: string, bondNear = "0.11") {
    return this.call("report", { account, evidence_hash: evidenceHash, evidence_uri: evidenceUri }, toYocto(bondNear));
  }
  retractReport(account: string) { return this.call("retract_report", { account }); }
}
