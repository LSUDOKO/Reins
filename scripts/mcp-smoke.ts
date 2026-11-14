/**
 * Drive the Reins MCP server over stdio the way an MCP client (Claude Code, Codex) would.
 *   REINS_AGENT_KEY=ed25519:... bun run scripts/mcp-smoke.ts
 * Uses the owner from scripts/lib.ts. Pays 0.01 NEAR to the demo merchant once.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CFG, ROOT } from "./lib";

const key = process.env.REINS_AGENT_KEY;
if (!key) throw new Error("set REINS_AGENT_KEY (printed at the end of `bun run demo`)");
const transport = new StdioClientTransport({
  command: "bun",
  args: ["run", `${ROOT}/packages/mcp/src/index.ts`],
  env: { ...process.env, REINS_OWNER: CFG.owner, REINS_AGENT_KEY: key, REINS_CONTRACT: CFG.contract } as Record<string, string>,
});
// Declares elicitation, so the server can ask "the human" on a warn verdict. Here the
// human is this script, and it approves; a real client shows the question to the user.
const client = new Client({ name: "reins-smoke", version: "0" }, { capabilities: { elicitation: {} } });
client.setRequestHandler(ElicitRequestSchema, async (req) => {
  console.log(`\n[elicitation shown to the human]\n${req.params.message}\n[human clicks: approve]`);
  return { action: "accept", content: { approve: true } };
});
await client.connect(transport);
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r: any = await client.callTool({ name, arguments: args });
  console.log(`\n> ${name} ${JSON.stringify(args)}\n${r.content[0].text}`);
};
console.log("tools:", (await client.listTools()).tools.map((t) => t.name).join(", "));
await call("rein_status");
await call("check_counterparty", { receiver: CFG.scammer });
await call("preview_payment", { receiver: CFG.merchant, amount_near: "0.01" });
await call("pay", { receiver: CFG.scammer, amount_near: "0.01", memo: "injected" });
await call("pay", { receiver: CFG.merchant, amount_near: "0.01", memo: "mcp smoke" });
await client.close();
