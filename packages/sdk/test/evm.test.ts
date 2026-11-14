import { expect, test } from "bun:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { addressOf, deriveEvmAddress, epsilon, payloadOf, recoverSigner, signedTx, unsignedTx, type EvmTx } from "../src/evm";

const TX: EvmTx = { chain_id: 84532, nonce: 0, to: "0x1111111111111111111111111111111111111111", value: "3",
  max_fee_per_gas: "2", max_priority_fee_per_gas: "1", gas_limit: 21000, payload: "" };

test("unsigned layout matches the contract's encoder (type 2, chain id 84532 first)", () => {
  const u = unsignedTx(TX);
  expect(u[0]).toBe(0x02);
  expect([...u.slice(2, 6)]).toEqual([0x83, 0x01, 0x4a, 0x34]);
});

test("a signature over the payload recovers to the signing key's address", () => {
  const sk = secp256k1.utils.randomSecretKey();
  const payload = payloadOf(TX);
  const sig = secp256k1.sign(Buffer.from(payload, "hex"), sk, { prehash: false, format: "recovered" });
  const recovery = sig[0], r = sig.slice(1, 33), s = sig.slice(33);
  const mpc = { big_r: { affine_point: "02" + bytesToHex(r) }, s: { scalar: bytesToHex(s) }, recovery_id: recovery };
  expect(recoverSigner(payload, mpc)).toBe(addressOf(secp256k1.Point.fromBytes(secp256k1.getPublicKey(sk, false))));
  expect(signedTx(TX, mpc).startsWith("0x02f8")).toBe(true);
});

test("derivation is deterministic per contract and path", () => {
  const master = "secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3";
  const a = deriveEvmAddress(master, "reins-near.testnet", "reins-1");
  expect(a).toMatch(/^0x[0-9a-f]{40}$/);
  expect(deriveEvmAddress(master, "reins-near.testnet", "reins-1")).toBe(a);
  expect(deriveEvmAddress(master, "reins-near.testnet", "reins-2")).not.toBe(a);
  expect(epsilon("a", "b")).not.toBe(epsilon("a", "c"));
});
