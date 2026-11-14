import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { KeyPair, type KeyPairString } from "near-api-js";
import { buildServer } from "../src/server";
import { quoteBody, quoteCrossChain } from "../src/intents";

test("server exposes the agent tools and nothing that moves owner funds", async () => {
  const server = buildServer({ owner: "alice.testnet", agentKey: KeyPair.fromRandom("ed25519").toString() as KeyPairString });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  expect(names).toEqual(["approval_status", "check_counterparty", "issue_subrein", "pay", "preview_payment", "quote_cross_chain", "rein_status", "screen_text"]);
  expect(names.some((n) => /withdraw|approve_request|set_allow|freeze/.test(n))).toBe(false);
});

test("1Click quote body is always a dry run", () => {
  const b = quoteBody({ origin_asset: "nep141:wrap.near", destination_asset: "x", amount: "1", recipient: "0xabc", refund_to: "a.near" }, 0);
  expect(b.dry).toBe(true);
  expect(b.deadline).toBe(new Date(600_000).toISOString());
});

test("quote result is summarised; failures are reported, not thrown", async () => {
  const ok = (async () => new Response(JSON.stringify({ quote: { amountInFormatted: "1.0", amountOutFormatted: "3.3", amountInUsd: "3.34", amountOutUsd: "3.32", minAmountOut: "3291236", timeEstimate: 24 } }))) as unknown as typeof fetch;
  const r = await quoteCrossChain({ origin_asset: "a", destination_asset: "b", amount: "1", recipient: "r", refund_to: "x.near" }, ok);
  expect(r).toMatchObject({ ok: true, dry: true, amount_out: "3.3", eta_seconds: 24 });
  const bad = (async () => new Response(JSON.stringify({ message: "recipient is not valid" }), { status: 400 })) as unknown as typeof fetch;
  expect(await quoteCrossChain({ origin_asset: "a", destination_asset: "b", amount: "1", recipient: "r", refund_to: "x.near" }, bad))
    .toEqual({ ok: false, status: 400, error: "recipient is not valid" });
});
