import { expect, test } from "bun:test";
import { collectSignals, isImplicit } from "../src/counterparty";

/** Fake RPC/NEARBlocks fetch and a fake ReinsClient: no network in tests. */
function fakes(o: { account?: any; old?: any; created?: number | null; reports?: any[]; blocked?: boolean; prior?: number; fail?: boolean }) {
  const f = (async (url: string, init?: any) => {
    if (o.fail) throw new Error("offline");
    if (String(url).includes("/v1/account/")) {
      return new Response(JSON.stringify(o.created == null ? { account: [] } : { account: [{ created: { block_timestamp: o.created } }] }));
    }
    const body = JSON.parse(init.body);
    const isOld = body.params.block_id !== undefined;
    return new Response(JSON.stringify(isOld ? o.old : o.account));
  }) as unknown as typeof fetch;
  const client: any = {
    rpcUrl: "http://rpc",
    pairCount: async () => { if (o.fail) throw new Error("x"); return o.prior ?? 0; },
    reportsOf: async () => { if (o.fail) throw new Error("x"); return o.reports ?? []; },
    isBlocked: async () => { if (o.fail) throw new Error("x"); return o.blocked ?? false; },
  };
  return { fetch: f, client, archivalRpc: "http://archival", nearblocks: "http://nb" };
}

const ACCOUNT = { result: { code_hash: "11111111111111111111111111111111", block_height: 5_000_000 } };
const CONTRACT = (h: string) => ({ result: { code_hash: h, block_height: 5_000_000 } });
const daysAgo = (d: number) => (Date.now() - d * 86_400_000) * 1_000_000;

test("reads existence, age, history and blocklist", async () => {
  const s = await collectSignals("alice.testnet", "shop.testnet", fakes({ account: ACCOUNT, created: daysAgo(30), prior: 2 }));
  expect(s.exists).toBe(true);
  expect(s.isContract).toBe(false);
  expect(Math.round(s.ageDays!)).toBe(30);
  expect(s.priorPayments).toBe(2);
  expect(s.blockedForOwner).toBe(false);
});

test("unknown account is reported as not existing", async () => {
  const s = await collectSignals("alice.testnet", "ghost.testnet",
    fakes({ account: { error: { cause: { name: "UNKNOWN_ACCOUNT" } } }, created: null }));
  expect(s.exists).toBe(false);
  expect(s.ageDays).toBe(0);
});

test("detects a contract whose code changed within a week", async () => {
  const s = await collectSignals("alice.testnet", "app.testnet",
    fakes({ account: CONTRACT("NEW"), old: CONTRACT("OLD"), created: daysAgo(90) }));
  expect(s.isContract).toBe(true);
  expect(s.codeChangedRecently).toBe(true);
});

test("unchanged contract code is reported as unchanged", async () => {
  const s = await collectSignals("alice.testnet", "app.testnet",
    fakes({ account: CONTRACT("SAME"), old: CONTRACT("SAME"), created: daysAgo(90) }));
  expect(s.codeChangedRecently).toBe(false);
});

test("every source offline yields unknowns, not zeros", async () => {
  const s = await collectSignals("alice.testnet", "shop.testnet", fakes({ fail: true }));
  expect(s.exists).toBeNull();
  expect(s.ageDays).toBeNull();
  expect(s.priorPayments).toBeNull();
  expect(s.blockedForOwner).toBeNull();
  expect(s.reportCount).toBeNull();
});

test("merchant allowlist feeds look-alike detection", async () => {
  const s = await collectSignals("alice.testnet", "sh0p.testnet",
    { ...fakes({ account: ACCOUNT, created: daysAgo(30) }), merchants: ["shop.testnet"] });
  expect(s.allowlisted).toBe(false);
  expect(s.known).toContain("shop.testnet");
});

test("implicit account ids are recognised", () => {
  expect(isImplicit("a".repeat(64))).toBe(true);
  expect(isImplicit("0x" + "b".repeat(40))).toBe(true);
  expect(isImplicit("shop.testnet")).toBe(false);
});
