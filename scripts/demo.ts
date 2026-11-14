/**
 * End-to-end demo on NEAR testnet. Every step is a real transaction or view call.
 *   bun run demo            (after PREFIX=... ./scripts/deploy.sh)
 * Writes demo/logs/demo.log and appends tx hashes to demo/receipts.json.
 */
import { KeyPair, type KeyPairString } from "near-api-js";
import { AgentClient, OwnerClient, SECONDS, fromYocto, toYocto, type Assessment } from "@reins/sdk";
import { CFG, link, logTo, provider, record, reins, secretFor } from "./lib";

const log = logTo("demo");
const owner = new OwnerClient(CFG.owner, secretFor(CFG.owner, "OWNER_KEY"), provider, CFG.contract);
const say = (a: Assessment) => a.reasons.map((r) => `    [${r.level}] ${r.signal}: ${r.detail}`).join("\n");
/** The "human" in this scripted run. Interactive runs can swap this for a prompt. */
const human = async (a: Assessment) => {
  log(`  human asked (verdict ${a.verdict}):\n${say(a)}\n  human: approve`);
  return true;
};

log(`contract ${CFG.contract} v${await reins.version()}, owner ${CFG.owner}`);

// 1. Fund the vault -----------------------------------------------------------------------
const vault = BigInt(await reins.vaultOf(CFG.owner));
if (vault < BigInt(toYocto("1"))) {
  await owner.deposit("1.5");
}
log(`\n1. vault holds ${fromYocto(await reins.vaultOf(CFG.owner))} NEAR`);

// 2. Grant a rein: the agent gets a function-call key, not the owner's key ---------------
const grant = await owner.grantRein("research-agent", {
  budget: toYocto("0.5"),
  period_secs: String(SECONDS.day),
  per_tx_cap: toYocto("0.2"),
  approval_above: toYocto("0.1"),
});
log(`\n2. rein #${grant.reinId}: 0.5 NEAR/day, 0.2 per payment, owner approval above 0.1`);
log(`   agent key ${grant.publicKey} added to ${CFG.owner} as a function-call key`);
log(`   allowed methods: pay, request_approval, issue_subrein on ${CFG.contract}; gas allowance 0.25 NEAR`);
const agent = new AgentClient(CFG.owner, grant.secretKey, provider, CFG.contract, reins);

// 3. A normal payment through the guard -------------------------------------------------
log(`\n3. agent pays 0.05 NEAR to ${CFG.merchant} through guardedPay`);
const p1 = await agent.guardedPay({ receiver: CFG.merchant, amountNear: "0.05", memo: "api credits", askHuman: human });
log(`   -> ${p1.status}`, "tx" in p1 && p1.tx ? link(p1.tx.txHash) : "");
if (p1.status === "paid") record({ label: "demo: guarded payment", txHash: p1.tx.txHash, signer: CFG.owner, expect: "payment" });

// 4. Above the approval threshold: the agent asks, the owner decides ---------------------
log(`\n4. agent wants to pay 0.15 NEAR (above the 0.1 threshold)`);
const p2 = await agent.guardedPay({ receiver: CFG.merchant, amountNear: "0.15", memo: "dataset", askHuman: human });
log(`   -> ${p2.status}`, "tx" in p2 && p2.tx ? link(p2.tx.txHash) : "");
if (p2.status === "pending_approval") {
  record({ label: "demo: approval request", txHash: p2.tx.txHash, signer: CFG.owner, expect: "approval_requested" });
  log(`   pending for owner: ${JSON.stringify((await reins.pendingRequestsOf(CFG.owner)).map((r) => ({ id: r.id, amount: fromYocto(r.amount) })))}`);
  const ok = await owner.raw("approve_request", { id: p2.requestId });
  log(`   owner approves request #${p2.requestId} with a full-access key ->`, ok.error ?? "paid", link(ok.txHash));
  if (!ok.error) record({ label: "demo: owner-approved payment", txHash: ok.txHash, signer: CFG.owner, expect: "payment" });
}

// 5. Over the per-payment cap: refused, nothing signed -------------------------------------
log(`\n5. agent tries 0.3 NEAR (cap is 0.2)`);
const p3 = await agent.guardedPay({ receiver: CFG.merchant, amountNear: "0.3", askHuman: human });
log(`   -> ${p3.status}${p3.status === "refused" ? ` by ${p3.by}: ${p3.code}` : ""}`);

// 6. Sub-agent: the agent splits its allowance; the owner activates the key -----------------
log(`\n6. agent issues a sub-rein (0.1 NEAR/day) for a sub-agent`);
const sub = KeyPair.fromRandom("ed25519");
const subPk = sub.getPublicKey().toString();
const issued = await agent.issueSubrein(subPk, "scraper-subagent", {
  budget: toYocto("0.1"), period_secs: String(SECONDS.day), per_tx_cap: toYocto("0.05"),
});
const subId = issued.events.find((e) => e.event === "rein_created")?.data[0].rein_id;
log(`   sub-rein #${subId} registered`, link(issued.txHash));
if (subId) record({ label: "demo: agent-issued sub-rein", txHash: issued.txHash, signer: CFG.owner, expect: "rein_created" });
const subAgent = new AgentClient(CFG.owner, sub.toString() as KeyPairString, provider, CFG.contract, reins);
const early = await subAgent.rawPay(CFG.merchant, "0.01");
log(`   sub-agent pays before the owner added its key -> ${early.error ? "rejected by the network (key not on the account)" : "UNEXPECTED"}`);
await owner.addAgentKey(subPk, "0.1");
const p4 = await subAgent.rawPay(CFG.merchant, "0.02", "sub-agent job");
log(`   owner adds the key; sub-agent pays 0.02 ->`, p4.error ?? "paid", link(p4.txHash));
if (!p4.error) record({ label: "demo: sub-agent payment", txHash: p4.txHash, signer: CFG.owner, expect: "payment" });
const parent = await reins.getRein(grant.reinId);
log(`   parent rein spent today: ${fromYocto(parent!.spent)} NEAR (sub-agent spending counts against it)`);

// 7. Freeze: instant stop, reversible ---------------------------------------------------
await owner.freeze(grant.reinId);
const p5 = await agent.guardedPay({ receiver: CFG.merchant, amountNear: "0.01", askHuman: human });
log(`\n7. owner freezes rein #${grant.reinId}; agent pays 0.01 -> ${p5.status}${p5.status === "refused" ? `: ${p5.code}` : ""}`);
await owner.unfreeze(grant.reinId);
log(`   owner unfreezes it`);

const r = (await reins.getRein(grant.reinId))!;
log(`\nfinal: rein #${r.id} spent ${fromYocto(r.spent)} / ${fromYocto(r.terms.budget)} NEAR today, ${r.uses} payments; stats`, await reins.stats());
console.log(`\nAgent secret for this rein (for the MCP server, keep it out of git):\nREINS_AGENT_KEY=${grant.secretKey}`);
