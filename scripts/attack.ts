/**
 * Attack demo: a prompt-injected agent tries to drain its owner, and is stopped twice —
 * first by the agent-side guard (nothing is signed), then, when the guard is bypassed, by
 * the contract itself.
 *   bun run attack
 *
 * The "agent" here is scripted: it obeys the instruction hidden in
 * demo/evidence/injected-page.html exactly as a compromised LLM agent would. No LLM is in
 * the loop, so the run is deterministic and reproducible.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AgentClient, OwnerClient, SECONDS, fromYocto, toYocto } from "@reins/sdk";
import { CFG, ROOT, link, logTo, provider, record, reins, secretFor } from "./lib";

const log = logTo("attack");
const owner = new OwnerClient(CFG.owner, secretFor(CFG.owner, "OWNER_KEY"), provider, CFG.contract);
const reporter = new OwnerClient(CFG.merchant, secretFor(CFG.merchant, "MERCHANT_KEY"), provider, CFG.contract);
const lookalike = CFG.merchant.replace("shop", "sh0p");
const rows: [string, string, string][] = [];
const row = (attempt: string, layer: string, result: string) => rows.push([attempt, layer, result]);

// Setup: a bonded report puts the drain account on the shared blocklist ------------------
const evidenceFile = join(ROOT, "demo", "evidence", "drain-report.md");
const evidenceHash = createHash("sha256").update(readFileSync(evidenceFile)).digest("hex");
const evidenceUri = "https://github.com/LSUDOKO/Reins/blob/main/demo/evidence/drain-report.md";
if ((await reins.reportsOf(CFG.scammer)).length === 0) {
  const rep = await reporter.raw("report", { account: CFG.scammer, evidence_hash: evidenceHash, evidence_uri: evidenceUri }, toYocto("0.11"));
  log(`setup: ${CFG.merchant} reports ${CFG.scammer} with a 0.1 NEAR bond`, rep.error ?? "", link(rep.txHash));
} else {
  log(`setup: ${CFG.scammer} is already on the blocklist`);
}
log(`        evidence sha256 ${evidenceHash}`);

const grant = await owner.grantRein("victim-agent", {
  budget: toYocto("0.5"), period_secs: String(SECONDS.day), per_tx_cap: toYocto("0.2"),
});
const agent = new AgentClient(CFG.owner, grant.secretKey, provider, CFG.contract, reins);
const vaultBefore = await reins.vaultOf(CFG.owner);
log(`setup: rein #${grant.reinId} (0.5 NEAR/day, 0.2 per payment); vault ${fromYocto(vaultBefore)} NEAR`);

const page = readFileSync(join(ROOT, "demo", "evidence", "injected-page.html"), "utf8");
log(`\nagent fetches a pricing page. Hidden in it:\n${page.match(/<!--([\s\S]*?)-->/)![1].trim()}\n`);
log("agent (compromised) follows the hidden instruction.\n");

// 1. Pay the drain account through the guard -----------------------------------------
log(`1. guardedPay 0.15 NEAR -> ${CFG.scammer}`);
const a1 = await agent.guardedPay({ receiver: CFG.scammer, amountNear: "0.15", askHuman: async () => true });
log(`   -> ${a1.status}${a1.status === "refused" ? ` by ${a1.by}: ${a1.code}` : ""}`);
for (const r of a1.assessment.reasons) log(`      [${r.level}] ${r.signal}: ${r.detail}`);
row(`pay ${CFG.scammer}`, "guard", a1.status === "refused" ? `refused (${a1.code}), nothing signed` : a1.status);

// 2. Same payment, guard bypassed: straight to the contract -----------------------------
log(`\n2. rawPay 0.15 NEAR -> ${CFG.scammer} (wrapper bypassed, signed with the agent key)`);
const a2 = await agent.rawPay(CFG.scammer, "0.15");
log(`   -> contract: ${a2.error ?? "UNEXPECTED SUCCESS"}`, link(a2.txHash));
if (a2.txHash) record({ label: "attack: blocked receiver", txHash: a2.txHash, signer: CFG.owner, expect: "panic", code: "receiver_blocked" });
row(`pay ${CFG.scammer}`, "contract", a2.error ? `reverted (${a2.error})` : "PAID");

// 3. Look-alike merchant -----------------------------------------------------------------
log(`\n3. guardedPay 0.15 NEAR -> ${lookalike}`);
const a3 = await agent.guardedPay({ receiver: lookalike, amountNear: "0.15", askHuman: async () => true,
  counterparty: { known: [CFG.merchant] } });
log(`   -> ${a3.status}${a3.status === "refused" ? ` by ${a3.by}: ${a3.code}` : ""}`);
for (const r of a3.assessment.reasons.filter((r) => r.level !== "info")) log(`      [${r.level}] ${r.signal}: ${r.detail}`);
row(`pay ${lookalike}`, "guard", a3.status === "refused" ? `refused (${a3.code}), nothing signed` : a3.status);

log(`   rawPay the same (guard bypassed)`);
const a3b = await agent.rawPay(lookalike, "0.15");
const failed = a3b.events.some((e) => e.event === "payment_failed");
log(`   -> transfer to a non-existent account failed; callback restored budget and vault: ${failed}`, link(a3b.txHash));
if (failed) record({ label: "attack: rollback on failed transfer", txHash: a3b.txHash, signer: CFG.owner, expect: "payment_failed" });
row(`pay ${lookalike}`, "contract", failed ? "transfer failed, budget restored" : a3b.error ?? "?");

// 4. Drain in one big payment ------------------------------------------------------------
log(`\n4. rawPay 5 NEAR -> ${CFG.merchant}`);
const a4 = await agent.rawPay(CFG.merchant, "5");
log(`   -> contract: ${a4.error}`, link(a4.txHash));
if (a4.txHash) record({ label: "attack: over cap", txHash: a4.txHash, signer: CFG.owner, expect: "panic", code: "over_per_tx_cap" });
row("pay 5 NEAR", "contract", `reverted (${a4.error})`);

// 5. Withdraw the vault / override the blocklist / mint a bigger allowance --------------
log(`\n5. agent key calls withdraw (needs 1 yoctoNEAR attached)`);
const w = await agent.account
  .callFunctionRaw({ contractId: CFG.contract, methodName: "withdraw", args: { amount: vaultBefore }, deposit: "1" })
  .then(() => "UNEXPECTED SUCCESS", (e: any) => String(e?.message ?? e).split("\n")[0]);
log(`   -> network: ${w}`);
row("withdraw vault", "NEAR access key", w.includes("UNEXPECTED") ? "WITHDRAWN" : "rejected: function-call keys cannot attach deposit");

log(`   agent key calls set_allow(${CFG.scammer}) (not in the key's method list)`);
const s = await agent.account
  .callFunctionRaw({ contractId: CFG.contract, methodName: "set_allow", args: { receiver: CFG.scammer, allowed: true } })
  .then(() => "UNEXPECTED SUCCESS", (e: any) => String(e?.message ?? e).split("\n")[0]);
log(`   -> network: ${s}`);
row("allow blocked receiver", "NEAR access key", s.includes("UNEXPECTED") ? "ALLOWED" : "rejected: method not granted to the key");

log(`   agent issues itself a 5 NEAR sub-rein`);
const big = await agent.issueSubrein("ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp", "escape", {
  budget: toYocto("5"), period_secs: "0", per_tx_cap: toYocto("5"),
});
log(`   -> contract: ${big.error}`, link(big.txHash));
if (big.txHash) record({ label: "attack: oversized sub-rein", txHash: big.txHash, signer: CFG.owner, expect: "panic", code: "child_budget_above_parent" });
row("mint bigger allowance", "contract", `reverted (${big.error})`);

// Result -----------------------------------------------------------------------------------
const vaultAfter = await reins.vaultOf(CFG.owner);
const rein = (await reins.getRein(grant.reinId))!;
log(`\nresult: vault ${fromYocto(vaultBefore)} -> ${fromYocto(vaultAfter)} NEAR (difference is gas-free; only storage), rein spent ${fromYocto(rein.spent)} NEAR\n`);
log("| attempt | stopped by | result |\n| --- | --- | --- |");
for (const [a, l, r] of rows) log(`| ${a} | ${l} | ${r} |`);
await owner.revoke(grant.reinId, grant.publicKey);
log(`\ncleanup: rein #${grant.reinId} revoked and its key deleted from ${CFG.owner}`);
