/**
 * Chain Signatures demo: a rein limits what an agent may pay on Base Sepolia.
 *   bun run crosschain
 * 1. Owner creates an EVM rein (chain 84532, 0.002 ETH/day, 0.001 ETH per payment, one merchant).
 * 2. The agent asks the contract to pay the merchant 0.0001 ETH; the contract builds the EIP-1559
 *    transaction, checks it against the rein and gets it signed by NEAR's MPC network.
 * 3. We recover the signer from the signature and check it is the rein's derived address.
 * 4. If that address holds Base Sepolia ETH, the signed transaction is broadcast; otherwise the
 *    script prints the address to fund and the raw transaction.
 * 5. The agent then tries a merchant outside the list and an amount over the cap: refused on NEAR,
 *    nothing is signed.
 */
import { AgentClient, MPC_TESTNET, OwnerClient, SECONDS, deriveEvmAddress, recoverSigner, signedTx } from "@reins/sdk";
import { CFG, link, logTo, provider, record, reins, secretFor } from "./lib";

const log = logTo("crosschain");
const BASE_RPC = process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org";
const MERCHANT = (process.env.EVM_MERCHANT ?? "0x000000000000000000000000000000000000dEaD").toLowerCase();
const ETH = 10n ** 18n;
const owner = new OwnerClient(CFG.owner, secretFor(CFG.owner, "OWNER_KEY"), provider, CFG.contract);

async function evm(method: string, params: unknown[]): Promise<any> {
  const r = await fetch(BASE_RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((x) => x.json() as Promise<any>);
  if (r.error) throw new Error(r.error.message);
  return r.result;
}

const grant = await owner.grantRein("base-buyer", {
  budget: String(ETH / 500n), period_secs: String(SECONDS.day), per_tx_cap: String(ETH / 1000n),
  merchants: [MERCHANT], evm_chain_id: "84532",
}, { allowanceNear: "0.5" });
const master = (await provider.callFunction({ contractId: MPC_TESTNET, method: "public_key", args: {} })) as string;
const path = await reins.evmPath(grant.reinId);
const address = deriveEvmAddress(master, CFG.contract, path);
log(`1. rein #${grant.reinId} pays on Base Sepolia (chain 84532): 0.002 ETH/day, 0.001 ETH per payment, only ${MERCHANT}`);
log(`   it controls ${address} (derived from ${CFG.contract} + "${path}" by NEAR Chain Signatures)`);

const agent = new AgentClient(CFG.owner, grant.secretKey, provider, CFG.contract, reins);
const [nonceHex, gasPriceHex] = await Promise.all([
  evm("eth_getTransactionCount", [address, "pending"]).catch(() => "0x0"),
  evm("eth_gasPrice", []).catch(() => "0x3b9aca00"),
]);
const maxFee = (BigInt(gasPriceHex) * 2n + 1_000_000n).toString();
const value = (ETH / 10000n).toString();
log(`\n2. agent asks to pay 0.0001 ETH (nonce ${BigInt(nonceHex)}, max fee ${maxFee} wei/gas)`);
const paid = await agent.payEvm({ to: MERCHANT, valueWei: value, nonce: Number(BigInt(nonceHex)), maxFeePerGas: maxFee, maxPriorityFeePerGas: "1000000" });
log(`   -> ${paid.error ?? "signed by the MPC network"}`, link(paid.txHash));
if (paid.signature) {
  record({ label: "chain signatures: signed Base Sepolia payment", txHash: paid.txHash, signer: CFG.owner, expect: "evm_payment_signed" });
  const signer = recoverSigner(paid.evmTx.payload, paid.signature);
  log(`\n3. recovered signer ${signer} ${signer === address ? "== rein address ✓" : "!= rein address ✗"}`);
  const raw = signedTx(paid.evmTx, paid.signature);
  const balance = BigInt(await evm("eth_getBalance", [address, "latest"]).catch(() => "0x0"));
  if (balance >= BigInt(value) + BigInt(maxFee) * 21000n) {
    const hash = await evm("eth_sendRawTransaction", [raw]);
    log(`\n4. broadcast on Base Sepolia: https://sepolia.basescan.org/tx/${hash}`);
  } else {
    log(`\n4. not broadcast: ${address} holds ${balance} wei on Base Sepolia. Fund it and run:`);
    log(`   curl ${BASE_RPC} -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_sendRawTransaction","params":["${raw.slice(0, 24)}…"]}'`);
  }
}

log(`\n5. agent tries a merchant outside the list`);
const off = await agent.payEvm({ to: "0x2222222222222222222222222222222222222222", valueWei: value, nonce: 99, maxFeePerGas: maxFee, maxPriorityFeePerGas: "1000000" });
log(`   -> ${off.error}`, link(off.txHash));
if (off.txHash) record({ label: "chain signatures: merchant outside the list", txHash: off.txHash, signer: CFG.owner, expect: "panic", code: "merchant_not_allowed" });
const big = await agent.payEvm({ to: MERCHANT, valueWei: String(ETH / 100n), nonce: 99, maxFeePerGas: maxFee, maxPriorityFeePerGas: "1000000" });
log(`   agent tries 0.01 ETH (cap 0.001) -> ${big.error}`, link(big.txHash));
if (big.txHash) record({ label: "chain signatures: over cap", txHash: big.txHash, signer: CFG.owner, expect: "panic", code: "over_per_tx_cap" });
const r = (await reins.getRein(grant.reinId))!;
log(`\nrein #${r.id}: ${r.spent} wei booked today (value + worst-case fee), EVM nonce ${r.evm_nonce}; MPC signatures so far: ${(await reins.stats()).evm_signatures}`);
