/**
 * Send one function call and keep its hash even when the contract panics, so a refused
 * payment is still a checkable on-chain record. Errors before broadcast (for example the
 * network rejecting a function-call key that tries to attach a deposit) have no hash.
 */
import { actions, type Account } from "near-api-js";

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

export async function sendCall(
  account: Account,
  contractId: string,
  method: string,
  args: Record<string, unknown>,
  gas: bigint,
  deposit: bigint,
): Promise<TxResult> {
  try {
    const res: any = await account.signAndSendTransaction({
      receiverId: contractId,
      actions: [actions.functionCall(method, args, gas, deposit)],
      throwOnFailure: false,
    });
    const txHash = res?.transaction?.hash ?? res?.transaction_outcome?.id ?? "";
    return { txHash, events: parseEvents(res), error: panicOf(res) };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return { txHash: "", events: [], error: msg.match(/panicked: ([a-z_]+)/)?.[1] ?? msg.split("\n")[0] };
  }
}
