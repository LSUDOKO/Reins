# AGENTS.md

Reins: per-agent spending limits on NEAR. Rust contract + TypeScript SDK + MCP server + web console.

## Commands

| Purpose | Command | Expected |
| --- | --- | --- |
| Install JS deps | `bun install --linker hoisted` | no errors |
| Contract tests (offline) | `cargo test -p reins` | `75 passed` |
| JS tests (offline) | `bun test packages/sdk packages/mcp packages/api packages/dashboard/lib` | `45 pass` |
| Typecheck | `bun run typecheck` | no output |
| Verify deployment, no keys | `bun run verify` | every row `PASS` (needs network) |
| Build web console | `bun run --cwd packages/dashboard build` | static site in `packages/dashboard/out` |
| Build wasm | `cd contracts/reins && cargo near build non-reproducible-wasm` | `target/near/reins/reins.wasm` |
| Browser e2e (live console) | `node tests/e2e/console.e2e.mjs` (needs playwright) | 8/8 PASS |
| Chain Signatures demo | `bun run crosschain` | MPC-signed Base Sepolia tx, signer == rein address |
| Own testnet deploy | `PREFIX=<name> ./scripts/deploy.sh` then `PREFIX=<name> bun run demo` / `bun run attack` | logs in `demo/logs/` |

## Layout

- `contracts/reins/src`: `lib.rs` state, `guard.rs` spend rules, `owner.rs` owner methods (need ≥1 yoctoNEAR), `agent.rs` agent methods + settlement callback, `tokens.rs` NEP-141, `evm.rs` Chain Signatures, `views.rs`, `tests.rs`.
- `packages/sdk/src`: `client.ts` views, `owner.ts`, `agent.ts` (`guardedPay`), `policy.ts` verdicts, `counterparty.ts` signal sources, `tx.ts`.
- `packages/api/src`: Cloudflare Worker (Groq): draft, explain, screen.
- `packages/mcp/src`: `server.ts` tools, `intents.ts` 1Click dry quotes.
- `packages/dashboard`: Next.js console (static export, NEAR Wallet Selector).
- `scripts/`: deploy, demo, attack, verify, owner CLI.

## Conventions

- Keys only from env or `~/.near-credentials`; never commit them.
- Contract error codes live in `contracts/reins/src/errors.rs`; `preview_pay` must return the same code `pay` panics with.
- Testnet only. Default contract `reins-near.testnet`.
