/**
 * NEAR Intents 1Click API, dry quotes only (`dry: true`): no deposit address is issued and
 * nothing moves. Intents has no testnet, so quotes are mainnet prices.
 * Docs: https://docs.near-intents.org/ — API base https://1click.chaindefuser.com/v0
 */
export const ONE_CLICK = process.env.ONE_CLICK_API ?? "https://1click.chaindefuser.com/v0";

export interface QuoteArgs {
  origin_asset: string;
  destination_asset: string;
  amount: string;
  recipient: string;
  refund_to: string;
}

export function quoteBody(a: QuoteArgs, now = Date.now()) {
  return {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: a.origin_asset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: a.destination_asset,
    amount: a.amount,
    refundTo: a.refund_to,
    refundType: "ORIGIN_CHAIN",
    recipient: a.recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(now + 10 * 60_000).toISOString(),
  };
}

export async function quoteCrossChain(a: QuoteArgs, f: typeof fetch = fetch) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.ONE_CLICK_JWT) headers.authorization = `Bearer ${process.env.ONE_CLICK_JWT}`;
  const res = await f(`${ONE_CLICK}/quote`, { method: "POST", headers, body: JSON.stringify(quoteBody(a)), signal: AbortSignal.timeout(15000) });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body.quote) return { ok: false, status: res.status, error: body.message ?? "quote_failed" };
  const q = body.quote;
  return {
    ok: true,
    dry: true,
    amount_in: q.amountInFormatted,
    amount_in_usd: q.amountInUsd,
    amount_out: q.amountOutFormatted,
    amount_out_usd: q.amountOutUsd,
    min_amount_out: q.minAmountOut,
    eta_seconds: q.timeEstimate,
    note: "Dry quote: no deposit address issued, nothing moved.",
  };
}
