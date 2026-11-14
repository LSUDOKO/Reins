/**
 * Agent side: signs as the OWNER account but with the agent's function-call key. That key
 * can call only the agent methods of the Reins contract and cannot attach a deposit.
 *
 * `guardedPay` is the wrapper an agent should use: it never signs when the counterparty
 * verdict is `block`, asks a human on `warn`, and routes above-threshold payments to an
 * on-chain approval request. `rawPay` skips the wrapper; the contract still enforces the
 * rein's terms and the shared blocklist, which is what the attack demo shows.
 */
import { Account, KeyPair, KeyPairSigner, type JsonRpcProvider, type KeyPairString } from "near-api-js";
import { checkCounterparty, type CounterpartyOptions } from "./counterparty";
import { ReinsClient } from "./client";
import type { Assessment } from "./policy";
import type { Preview, Rein, Terms } from "./types";
import { toYocto } from "./units";

const GAS = "60000000000000"; // 60 Tgas: pay + transfer + callback

export interface ChainEvent {
  standard: string;
  event: string;
  data: any[];
}

export interface TxResult {
  txHash: string;
  events: ChainEvent[];
  /** Panic message when the transaction failed, e.g. "over_budget". */
  error?: string;
}

export type PayOutcome =
  | { status: "paid"; assessment: Assessment; preview: Preview; tx: TxResult }
  | { status: "transfer_failed"; assessment: Assessment; preview: Preview; tx: TxResult }
  | { status: "refused"; by: "guard" | "contract"; code: string; assessment: Assessment; preview?: Preview }
  | { status: "pending_approval"; requestId: number; assessment: Assessment; preview: Preview; tx: TxResult }
  | { status: "declined_by_human"; assessment: Assessment; preview: Preview };

export function parseEvents(res: any): ChainEvent[] {
  const logs: string[] = [
    ...(res?.transaction_outcome?.outcome?.logs ?? []),
    ...(res?.receipts_outcome ?? []).flatMap((r: any) => r.outcome?.logs ?? []),
  ];
  return logs
    .filter((l) => l.startsWith("EVENT_JSON:"))
    .map((l) => JSON.parse(l.slice("EVENT_JSON:".length)))
    .filter((e) => e.standard === "reins");
}

export function panicOf(res: any): string | undefined {
  const outcomes = [res?.transaction_outcome, ...(res?.receipts_outcome ?? [])];
  for (const o of outcomes) {
    const f = o?.outcome?.status?.Failure;
    if (!f) continue;
    const msg = f?.ActionError?.kind?.FunctionCallError?.ExecutionError ?? JSON.stringify(f);
    return String(msg).replace(/^Smart contract panicked: /, "");
  }
  return undefined;
}

export class AgentClient {
  readonly account: Account;
  readonly publicKey: string;
  readonly reins: ReinsClient;

  constructor(readonly ownerId: string, agentSecret: KeyPairString, provider: JsonRpcProvider, readonly contractId: string, reins?: ReinsClient) {
    const kp = KeyPair.fromString(agentSecret);
    this.publicKey = kp.getPublicKey().toString();
    this.account = new Account(ownerId, provider, new KeyPairSigner(kp));
    this.reins = reins ?? new ReinsClient(contractId);
  }

  private async send(methodName: string, args: Record<string, unknown>): Promise<TxResult> {
    try {
      const res: any = await this.account.callFunctionRaw({ contractId: this.contractId, methodName, args, gas: GAS, deposit: "0" });
      return { txHash: res?.transaction?.hash ?? res?.transaction_outcome?.id, events: parseEvents(res), error: panicOf(res) };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = msg.match(/panicked: ([a-z_]+)/)?.[1] ?? msg.match(/"([a-z_]{6,})"/)?.[1] ?? msg;
      return { txHash: e?.context?.transactionHash ?? "", events: [], error: code };
    }
  }

  rein(): Promise<Rein | null> {
    return this.reins.reinForKey(this.ownerId, this.publicKey);
  }

  preview(receiver: string, amountNear: string): Promise<Preview> {
    return this.reins.previewPay(this.ownerId, this.publicKey, receiver, toYocto(amountNear));
  }

  /** Direct contract call, no counterparty guard. The contract still enforces the terms. */
  rawPay(receiver: string, amountNear: string, memo?: string): Promise<TxResult> {
    return this.send("pay", { receiver, amount: toYocto(amountNear), memo: memo ?? null });
  }

  requestApproval(receiver: string, amountNear: string, memo?: string): Promise<TxResult> {
    return this.send("request_approval", { receiver, amount: toYocto(amountNear), memo: memo ?? null });
  }

  issueSubrein(agentKey: string, label: string, terms: Terms): Promise<TxResult> {
    return this.send("issue_subrein", { agent_key: agentKey, label, terms });
  }

  async assess(receiver: string, o: CounterpartyOptions = {}): Promise<Assessment> {
    const rein = await this.rein();
    return checkCounterparty(this.ownerId, receiver, { client: this.reins, merchants: rein?.terms.merchants, ...o });
  }

  async guardedPay(p: {
    receiver: string;
    amountNear: string;
    memo?: string;
    /** Called on a `warn` verdict. Return true to pay anyway. Without it, warn = refuse. */
    askHuman?: (a: Assessment, preview: Preview) => Promise<boolean>;
    counterparty?: CounterpartyOptions;
  }): Promise<PayOutcome> {
    const assessment = await this.assess(p.receiver, p.counterparty);
    if (assessment.verdict === "block") {
      return { status: "refused", by: "guard", code: "counterparty_blocked", assessment };
    }
    const preview = await this.preview(p.receiver, p.amountNear);
    if (preview.needs_approval) {
      const tx = await this.requestApproval(p.receiver, p.amountNear, p.memo);
      const ev = tx.events.find((e) => e.event === "approval_requested");
      if (tx.error || !ev) return { status: "refused", by: "contract", code: tx.error ?? "request_failed", assessment, preview };
      return { status: "pending_approval", requestId: ev.data[0].request_id, assessment, preview, tx };
    }
    if (!preview.ok) {
      return { status: "refused", by: "contract", code: preview.code ?? "unknown", assessment, preview };
    }
    if (assessment.verdict === "warn") {
      const yes = p.askHuman ? await p.askHuman(assessment, preview) : false;
      if (!yes) return { status: "declined_by_human", assessment, preview };
    }
    const tx = await this.rawPay(p.receiver, p.amountNear, p.memo);
    if (tx.error) return { status: "refused", by: "contract", code: tx.error, assessment, preview };
    const paid = tx.events.some((e) => e.event === "payment");
    return { status: paid ? "paid" : "transfer_failed", assessment, preview, tx };
  }
}
