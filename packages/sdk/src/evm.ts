/**
 * Chain Signatures helpers: derive the EVM address the MPC network controls for a rein, and
 * turn the contract's signature into a broadcastable EIP-1559 transaction.
 *
 * Derivation (MPC v1, additive): epsilon = sha3_256("near-mpc-recovery v0.1.0 epsilon
 * derivation:" + predecessor + "," + path); derived = master + epsilon·G. The predecessor is
 * the Reins contract (it calls `sign`), the path is `reins-<rein id>`.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256, sha3_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const MPC_TESTNET = "v1.signer-prod.testnet";

function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(i);
  }
  const hex = n.toString(16).padStart(2, "0");
  const out = hexToBytes(hex.length % 2 ? "0" + hex : hex);
  const zeros = s.match(/^1*/)![0].length;
  return new Uint8Array([...new Uint8Array(zeros), ...out]);
}

/** `secp256k1:<base58 of 64-byte x||y>` (the MPC contract's `public_key`) -> curve point. */
export function parseMpcKey(key: string) {
  const raw = b58decode(key.replace(/^secp256k1:/, ""));
  return secp256k1.Point.fromBytes(new Uint8Array([0x04, ...raw.slice(-64)]));
}

export function epsilon(predecessor: string, path: string): bigint {
  const h = sha3_256(new TextEncoder().encode(`near-mpc-recovery v0.1.0 epsilon derivation:${predecessor},${path}`));
  return BigInt("0x" + bytesToHex(h));
}

export function derivePublicKey(masterKey: string, predecessor: string, path: string) {
  return parseMpcKey(masterKey).add(secp256k1.Point.BASE.multiply(epsilon(predecessor, path)));
}

export function addressOf(point: ReturnType<typeof parseMpcKey>): string {
  const uncompressed = point.toBytes(false).slice(1);
  return "0x" + bytesToHex(keccak_256(uncompressed).slice(-20));
}

export function deriveEvmAddress(masterKey: string, predecessor: string, path: string): string {
  return addressOf(derivePublicKey(masterKey, predecessor, path));
}

// ---- RLP (matches the contract's encoder) ---------------------------------------------

function rlpBytes(b: Uint8Array): Uint8Array {
  if (b.length === 1 && b[0] < 0x80) return b;
  return new Uint8Array([...rlpLen(0x80, 0xb7, b.length), ...b]);
}
function rlpLen(short: number, long: number, len: number): number[] {
  if (len <= 55) return [short + len];
  const be = hexToBytes(len.toString(16).padStart(len.toString(16).length + (len.toString(16).length % 2), "0"));
  return [long + be.length, ...be];
}
function rlpUint(v: bigint): Uint8Array {
  if (v === 0n) return rlpBytes(new Uint8Array());
  const h = v.toString(16);
  return rlpBytes(hexToBytes(h.length % 2 ? "0" + h : h));
}
function rlpList(items: Uint8Array[]): Uint8Array {
  const payload = items.flatMap((i) => [...i]);
  return new Uint8Array([...rlpLen(0xc0, 0xf7, payload.length), ...payload]);
}

/** Fields as the contract returns them in the `evm_payment_signed` event. */
export interface EvmTx {
  chain_id: string | number;
  nonce: string | number;
  to: string;
  value: string;
  max_fee_per_gas: string;
  max_priority_fee_per_gas: string;
  gas_limit: string | number;
  payload: string;
}

export interface MpcSignature {
  big_r: { affine_point: string };
  s: { scalar: string };
  recovery_id: number;
}

function fields(tx: EvmTx): Uint8Array[] {
  return [
    rlpUint(BigInt(tx.chain_id)),
    rlpUint(BigInt(tx.nonce)),
    rlpUint(BigInt(tx.max_priority_fee_per_gas)),
    rlpUint(BigInt(tx.max_fee_per_gas)),
    rlpUint(BigInt(tx.gas_limit)),
    rlpBytes(hexToBytes(tx.to.slice(2))),
    rlpUint(BigInt(tx.value)),
    rlpBytes(new Uint8Array()),
    rlpList([]),
  ];
}

export function unsignedTx(tx: EvmTx): Uint8Array {
  return new Uint8Array([0x02, ...rlpList(fields(tx))]);
}

/** The signed raw transaction (`0x02…`) ready for `eth_sendRawTransaction`. */
export function signedTx(tx: EvmTx, sig: MpcSignature): string {
  const r = BigInt("0x" + sig.big_r.affine_point.slice(2));
  const s = BigInt("0x" + sig.s.scalar);
  const body = rlpList([...fields(tx), rlpUint(BigInt(sig.recovery_id)), rlpUint(r), rlpUint(s)]);
  return "0x02" + bytesToHex(body);
}

/** Address that produced `sig` over `payloadHex` (to check it is the rein's derived address). */
export function recoverSigner(payloadHex: string, sig: MpcSignature): string {
  const r = BigInt("0x" + sig.big_r.affine_point.slice(2));
  const s = BigInt("0x" + sig.s.scalar);
  const signature = new secp256k1.Signature(r, s).addRecoveryBit(sig.recovery_id);
  return addressOf(signature.recoverPublicKey(hexToBytes(payloadHex)));
}

export function payloadOf(tx: EvmTx): string {
  return bytesToHex(keccak_256(unsignedTx(tx)));
}
