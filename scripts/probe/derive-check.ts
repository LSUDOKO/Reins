/** Check the SDK's derivation against a real MPC signature: sign a payload, recover the signer. */
import { Account, KeyPair, KeyPairSigner } from "near-api-js";
import { deriveEvmAddress, recoverSigner, MPC_TESTNET } from "@reins/sdk";
import { CFG, provider, reins, secretFor } from "../lib";
const acct = new Account(CFG.owner, provider, new KeyPairSigner(KeyPair.fromString(secretFor(CFG.owner, "OWNER_KEY"))));
const master = (await provider.callFunction({ contractId: MPC_TESTNET, method: "public_key", args: {} })) as string;
const payload = "22".repeat(32);
const r: any = await acct.callFunctionRaw({ contractId: MPC_TESTNET, methodName: "sign", args: { request: { payload_v2: { Ecdsa: payload }, path: "reins-check", domain_id: 0 } }, deposit: "1", gas: "300000000000000" });
const sig = JSON.parse(Buffer.from(r.status.SuccessValue, "base64").toString());
console.log("derived  ", deriveEvmAddress(master, CFG.owner, "reins-check"));
console.log("recovered", recoverSigner(payload, sig));
