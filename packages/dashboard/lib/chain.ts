// Public, client-safe NEAR configuration. Everything here is read at build time
// from NEXT_PUBLIC_* variables; the defaults point at the live testnet demo.

export const NETWORK = "testnet" as const;
export const CHAIN_NAME = "NEAR testnet";
export const CONTRACT_ID = process.env.NEXT_PUBLIC_REINS_CONTRACT ?? "reins-demo.testnet";
export const RPC_URL = process.env.NEXT_PUBLIC_NEAR_RPC ?? "https://test.rpc.fastnear.com";
/** The owner the console shows before anyone signs in (read-only). */
export const DEMO_OWNER = process.env.NEXT_PUBLIC_DEMO_OWNER ?? "reins-demo-owner.testnet";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Methods an agent key may call · nothing else is ever granted. */
export const AGENT_METHODS = ["pay", "request_approval", "issue_subrein"];
export const AGENT_ALLOWANCE_NEAR = "0.25";
export const STORAGE_DEPOSIT_NEAR = "0.02";

export const txUrl = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const accountUrl = (id: string) => `https://testnet.nearblocks.io/address/${id}`;
