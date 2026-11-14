/**
 * Keyless verification of the deployed contract and every recorded transaction.
 *   bun run verify            on-chain checks only (needs network, no keys)
 *   bun run verify --tests    also runs `cargo test -p reins` and `bun test`
 * Prints a PASS/FAIL table; exit code 1 if anything fails.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { panicOf, parseEvents } from "@reins/sdk";
import { CFG, ROOT, reins, type Receipt } from "./lib";

const results: { check: string; ok: boolean; detail: string }[] = [];
const check = async (name: string, fn: () => Promise<string>) => {
  try {
    results.push({ check: name, ok: true, detail: await fn() });
  } catch (e: any) {
    results.push({ check: name, ok: false, detail: String(e?.message ?? e).split("\n")[0] });
  }
};
const must = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};

async function txStatus(hash: string, sender: string): Promise<any> {
  const res = await fetch(CFG.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tx", params: { tx_hash: hash, sender_account_id: sender, wait_until: "FINAL" } }),
  }).then((r) => r.json());
  if (res.error) throw new Error(JSON.stringify(res.error.cause ?? res.error));
  return res.result;
}

if (process.argv.includes("--tests")) {
  for (const [name, cmd] of [["cargo test -p reins", ["cargo", "test", "-p", "reins"]], ["bun test", ["bun", "test", "packages"]]] as const) {
    await check(name, async () => {
      const p = Bun.spawnSync([...cmd], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
      const out = p.stdout.toString() + p.stderr.toString();
      must(p.exitCode === 0, out.split("\n").filter((l) => /fail|error/i.test(l)).slice(0, 3).join(" | ") || `exit ${p.exitCode}`);
      return out.match(/test result: ok\. \d+ passed/)?.[0] ?? out.match(/\d+ pass/)?.[0] ?? "ok";
    });
  }
}

await check("contract is deployed", async () => `${CFG.contract} v${await reins.version()}`);
await check("contract has settled payments", async () => {
  const s = await reins.stats();
  must(s.payments > 0, "no payments yet; run `bun run demo`");
  return `${s.reins} reins, ${s.payments} payments, ${s.requests} approval requests`;
});
await check("drain account is on the blocklist", async () => {
  must(await reins.isBlocked(CFG.owner, CFG.scammer), "not blocked; run `bun run attack`");
  return `is_blocked(${CFG.owner}, ${CFG.scammer}) = true`;
});
await check("report evidence matches the file in this repo", async () => {
  const [r] = await reins.reportsOf(CFG.scammer);
  const local = createHash("sha256").update(readFileSync(join(ROOT, "demo", "evidence", "drain-report.md"))).digest("hex");
  must(r && r.evidence_hash === local, `on-chain ${r?.evidence_hash} != local ${local}`);
  return `sha256 ${local.slice(0, 16)}…`;
});

const receipts: Receipt[] = JSON.parse(readFileSync(join(ROOT, "demo", "receipts.json"), "utf8"));
for (const r of receipts) {
  await check(r.label, async () => {
    const tx = await txStatus(r.txHash, r.signer);
    const events = parseEvents(tx).map((e) => e.event);
    const panic = panicOf(tx);
    if (r.expect === "panic") {
      must(panic?.includes(r.code ?? ""), `expected panic ${r.code}, got ${panic ?? "success"}`);
      return `reverted on-chain with ${panic} (${r.txHash.slice(0, 8)}…)`;
    }
    must(events.includes(r.expect), `expected event ${r.expect}, got [${events.join(", ")}] ${panic ?? ""}`);
    return `event ${r.expect} (${r.txHash.slice(0, 8)}…)`;
  });
}

const w = Math.max(...results.map((r) => r.check.length));
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check.padEnd(w)}  ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
