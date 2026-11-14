/** Probe: ask the testnet MPC signer for one signature from the owner account. */
import { Account, KeyPair, KeyPairSigner } from "near-api-js";
import { CFG, provider, secretFor } from "../lib";
const acct = new Account(CFG.owner, provider, new KeyPairSigner(KeyPair.fromString(secretFor(CFG.owner, "OWNER_KEY"))));
const payload = "11".repeat(32);
for (const args of [
  { request: { payload_v2: { Ecdsa: payload }, path: "reins-probe", domain_id: 0 } },
  { request: { payload: Array(32).fill(17), path: "reins-probe", key_version: 0 } },
]) {
  try {
    const r: any = await acct.callFunctionRaw({ contractId: "v1.signer-prod.testnet", methodName: "sign", args, deposit: "1", gas: "300000000000000" });
    const v = r.status?.SuccessValue; console.log("OK", JSON.stringify(args).slice(0, 80), v ? Buffer.from(v, "base64").toString() : JSON.stringify(r.status));
    break;
  } catch (e: any) { console.log("ERR", JSON.stringify(args).slice(0, 80), String(e.message).slice(0, 300)); }
}
