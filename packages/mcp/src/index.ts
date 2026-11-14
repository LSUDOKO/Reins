#!/usr/bin/env bun
/**
 * Reins MCP server over stdio.
 *   REINS_OWNER=you.testnet REINS_AGENT_KEY=ed25519:... bun run packages/mcp/src/index.ts
 * Claude Code:
 *   claude mcp add reins -e REINS_OWNER=you.testnet -e REINS_AGENT_KEY=ed25519:... -- bun run /path/to/Reins/packages/mcp/src/index.ts
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { KeyPairString } from "near-api-js";
import { buildServer } from "./server";

const owner = process.env.REINS_OWNER;
const agentKey = process.env.REINS_AGENT_KEY as KeyPairString | undefined;
if (!owner || !agentKey) {
  console.error("Set REINS_OWNER (owner account id) and REINS_AGENT_KEY (the agent's function-call secret key).");
  process.exit(1);
}
const server = buildServer({ owner, agentKey, contract: process.env.REINS_CONTRACT, rpc: process.env.NEAR_RPC });
await server.connect(new StdioServerTransport());
