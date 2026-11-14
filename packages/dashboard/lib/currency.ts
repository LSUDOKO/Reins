// What a rein spends in. A rein is in NEAR by default, in a NEP-141 token when
// `terms.token` is set (tUSD on the demo, 6 decimals), or in ETH on Base Sepolia
// when `terms.evm_chain_id` is set: those payments are signed by NEAR Chain
// Signatures from an address derived for the rein. Amounts on-chain are always
// integers in the currency's smallest unit.

import * as sdk from "@reins/sdk";
import { JsonRpcProvider } from "near-api-js";
import { CONTRACT_ID, RPC_URL } from "./chain";

export type Currency = "NEAR" | "tUSD" | "ETH";
export const TUSD = process.env.NEXT_PUBLIC_REINS_TOKEN ?? "reins-near-tusd.testnet";
export const BASE_SEPOLIA = "84532";
export const MPC = "v1.signer-prod.testnet";
export const DECIMALS: Record<Currency, number> = { NEAR: 24, tUSD: 6, ETH: 18 };
export const CURRENCY_LABEL: Record<Currency, string> = { NEAR: "NEAR", tUSD: "tUSD", ETH: "Base Sepolia ETH" };
export const BASESCAN = (a: string) => `https://sepolia.basescan.org/address/${a}`;

/** The new optional fields, typed loosely so this compiles before and after the SDK gains them. */
export type TermsV2 = sdk.Terms & { token?: string | null; evm_chain_id?: string | null };

export function currencyOf(t: TermsV2): Currency {
  if (t.evm_chain_id) return "ETH";
  if (t.token) return "tUSD";
  return "NEAR";
}

export function toUnits(v: string, c: Currency): string {
  const s = (v || "0").trim();
  if (!/^\d*(\.\d*)?$/.test(s)) throw new Error(`not an amount: ${v}`);
  const [w, f = ""] = s.split(".");
  const d = DECIMALS[c];
  return (BigInt(w || "0") * 10n ** BigInt(d) + BigInt((f + "0".repeat(d)).slice(0, d) || "0")).toString();
}

export function fromUnits(v: string | bigint | null | undefined, c: Currency, digits = 4): string {
  if (v == null || v === "") return "0";
  const d = DECIMALS[c];
  const n = BigInt(v);
  const w = n / 10n ** BigInt(d);
  const f = (n % 10n ** BigInt(d)).toString().padStart(d, "0").slice(0, digits).replace(/0+$/, "");
  return f ? `${w}.${f}` : `${w}`;
}

/** Fields that select a currency in Terms. */
export function currencyFields(c: Currency): { token: string | null; evm_chain_id: string | null } {
  return { token: c === "tUSD" ? TUSD : null, evm_chain_id: c === "ETH" ? BASE_SEPOLIA : null };
}

let master: Promise<string> | null = null;
/** The Base Sepolia address NEAR's MPC network controls for this rein, or null if it can't be derived here. */
export async function evmAddressOf(reinId: number): Promise<string | null> {
  const derive = (sdk as unknown as { deriveEvmAddress?: (m: string, p: string, path: string) => string }).deriveEvmAddress;
  if (!derive) return null;
  try {
    master ??= new JsonRpcProvider({ url: RPC_URL }).callFunction({ contractId: MPC, method: "public_key", args: {} }) as Promise<string>;
    return derive(await master, CONTRACT_ID, `reins-${reinId}`);
  } catch {
    master = null;
    return null;
  }
}
