/**
 * Owner CLI. Signs with the owner's FULL-ACCESS key (env OWNER_KEY or ~/.near-credentials).
 *   bun run reins <command> [args]
 *
 *   status                         vault, reins and pending requests of the owner
 *   grant <label> <budget> <cap> [approval_above] [period_secs]
 *                                  new rein + function-call key; prints the agent secret once
 *   approve <request_id>           approve an agent's request (pays it)
 *   reject <request_id>
 *   freeze|unfreeze|revoke <rein_id>
 *   panic                          revoke every rein
 *   trust <rein_id> <account>      add a merchant to the rein's allowlist
 *   check <account>                counterparty verdict for the owner
 *   report <account> <evidence_file> <evidence_uri>   bonded blocklist report (0.11 NEAR)
 *   allow|disallow <account>       per-owner override for a reported account
 *   deposit|withdraw <near>
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { OwnerClient, checkCounterparty, fromYocto, toYocto } from "@reins/sdk";
import { CFG, link, provider, reins, secretFor } from "./lib";

const [cmd, ...args] = process.argv.slice(2);
const owner = () => new OwnerClient(CFG.owner, secretFor(CFG.owner, "OWNER_KEY"), provider, CFG.contract);
const id = (s?: string) => {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) throw new Error(`expected an id, got ${s}`);
  return n;
};
const show = (r: { txHash: string; error?: string }) => console.log(r.error ? `refused: ${r.error}` : "ok", link(r.txHash));

switch (cmd) {
  case "status": {
    const [vault, list, pending] = await Promise.all([reins.vaultOf(CFG.owner), reins.reinsOf(CFG.owner), reins.pendingRequestsOf(CFG.owner)]);
    console.log(`owner ${CFG.owner} on ${CFG.contract}\nvault ${fromYocto(vault)} NEAR\n`);
    for (const r of list) {
      const allowance = r.status === "Revoked" ? null : await reins.keyAllowance(CFG.owner, r.agent_key);
      const gas = allowance === null ? "key not on account" : /^\d+$/.test(allowance) ? `gas ${fromYocto(allowance)} NEAR` : allowance;
      console.log(`#${r.id} ${r.label.padEnd(18)} ${r.status.padEnd(8)} spent ${fromYocto(r.spent)}/${fromYocto(r.terms.budget)} NEAR` +
        ` cap ${fromYocto(r.terms.per_tx_cap)}${r.parent ? ` parent #${r.parent}` : ""}  ${gas}`);
    }
    console.log(pending.length ? `\npending approvals:` : "\nno pending approvals");
    for (const q of pending) console.log(`  request ${q.id}: rein #${q.rein_id} wants ${fromYocto(q.amount)} NEAR -> ${q.receiver} (${q.memo ?? ""})`);
    break;
  }
  case "grant": {
    const [label, budget, cap, approval, period] = args;
    if (!label || !budget || !cap) throw new Error("usage: grant <label> <budget_near> <cap_near> [approval_above_near] [period_secs]");
    const g = await owner().grantRein(label, {
      budget: toYocto(budget), per_tx_cap: toYocto(cap), period_secs: period ?? "86400",
      approval_above: approval ? toYocto(approval) : null,
    });
    console.log(`rein #${g.reinId} bound to ${g.publicKey}\nGive this to the agent (shown once, keep it out of git):\nREINS_OWNER=${CFG.owner}\nREINS_AGENT_KEY=${g.secretKey}`);
    break;
  }
  case "approve": show(await owner().raw("approve_request", { id: id(args[0]) })); break;
  case "reject": show(await owner().raw("reject_request", { id: id(args[0]) })); break;
  case "freeze": case "unfreeze": case "revoke": show(await owner().raw(cmd, { id: id(args[0]) })); break;
  case "panic": show(await owner().raw("revoke_all", {})); break;
  case "trust": {
    const r = await reins.getRein(id(args[0]));
    if (!r || !args[1]) throw new Error("usage: trust <rein_id> <account>");
    const merchants = [...new Set([...(r.terms.merchants ?? []), args[1]])];
    show(await owner().raw("update_terms", { id: r.id, terms: { ...r.terms, merchants } }));
    break;
  }
  case "check": console.log(JSON.stringify(await checkCounterparty(CFG.owner, args[0], { client: reins }), null, 2)); break;
  case "report": {
    const [account, file, uri] = args;
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    show(await owner().raw("report", { account, evidence_hash: hash, evidence_uri: uri }, toYocto("0.11")));
    break;
  }
  case "allow": case "disallow": show(await owner().raw("set_allow", { receiver: args[0], allowed: cmd === "allow" })); break;
  case "deposit": show(await owner().raw("deposit", {}, toYocto(args[0]))); break;
  case "withdraw": show(await owner().raw("withdraw", { amount: toYocto(args[0]) })); break;
  default:
    console.log(readFileSync(import.meta.path, "utf8").split("*/")[0]);
}
