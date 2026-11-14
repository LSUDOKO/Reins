/** Shared config for the demo, attack and CLI scripts. Keys come from env or ~/.near-credentials. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { JsonRpcProvider, type KeyPairString } from "near-api-js";
import { DEFAULTS, ReinsClient } from "@reins/sdk";

const prefix = process.env.PREFIX ?? "reins-demo";
export const CFG = {
  contract: process.env.REINS_CONTRACT ?? `${prefix}.testnet`,
  owner: process.env.OWNER ?? `${prefix}-owner.testnet`,
  merchant: process.env.MERCHANT ?? `${prefix}-shop.testnet`,
  scammer: process.env.SCAMMER ?? `${prefix}-drain.testnet`,
  rpc: DEFAULTS.rpc,
  explorer: "https://testnet.nearblocks.io/txns/",
};

export const ROOT = join(import.meta.dir, "..");
export const provider = new JsonRpcProvider({ url: CFG.rpc });
export const reins = new ReinsClient(CFG.contract, CFG.rpc);

/** Secret key for `account`: env OWNER_KEY / MERCHANT_KEY, else the near-cli legacy keychain. */
export function secretFor(account: string, envName?: string): KeyPairString {
  const fromEnv = envName ? process.env[envName] : undefined;
  if (fromEnv) return fromEnv as KeyPairString;
  const file = join(homedir(), ".near-credentials", "testnet", `${account}.json`);
  if (!existsSync(file)) {
    throw new Error(`no key for ${account}: set ${envName ?? "a key env var"} or run scripts/deploy.sh first`);
  }
  return JSON.parse(readFileSync(file, "utf8")).private_key as KeyPairString;
}

/** Tee console output into demo/logs/<name>.log so the run can be committed as evidence. */
export function logTo(name: string) {
  const dir = join(ROOT, "demo", "logs");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.log`);
  writeFileSync(file, `# ${name} run at ${new Date().toISOString()} on ${CFG.contract}\n`);
  return (...parts: unknown[]) => {
    const line = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p, null, 2))).join(" ");
    console.log(line);
    appendFileSync(file, line + "\n");
  };
}

export interface Receipt {
  label: string;
  txHash: string;
  signer: string;
  expect: "payment" | "payment_failed" | "approval_requested" | "rein_created" | "panic";
  code?: string;
}

/** Record a transaction for scripts/verify.ts to re-check later without any keys. */
export function record(r: Receipt) {
  const file = join(ROOT, "demo", "receipts.json");
  const all: Receipt[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const rest = all.filter((x) => x.label !== r.label);
  writeFileSync(file, JSON.stringify([...rest, r], null, 2) + "\n");
}

export const link = (hash: string) => (hash ? `${CFG.explorer}${hash}` : "(no tx: refused before signing)");
