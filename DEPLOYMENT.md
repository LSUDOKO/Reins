# Deployment

## Live deployments (testnet)

| Component | Where | Verify |
| --- | --- | --- |
| Reins contract v0.2.0 | [`reins-near.testnet`](https://testnet.nearblocks.io/address/reins-near.testnet) | `near contract call-function as-read-only reins-near.testnet version json-args {} network-config testnet now` → `"0.2.0"` |
| tUSD (NEP-141 test token) | [`reins-near-tusd.testnet`](https://testnet.nearblocks.io/address/reins-near-tusd.testnet) | `ft_metadata` → `tUSD`, 6 decimals |
| Chain Signatures signer | `v1.signer-prod.testnet` (NEAR, not ours) | `mpc_contract` view on Reins |
| Console | <https://reins.adoranto737.workers.dev> | open it; `/app/?demo=1` is read-only |
| Reins API | <https://reins-api.adoranto737.workers.dev/health> | `{"ok":true,…}` |
| Demo accounts | `reins-near-owner`, `reins-near-shop`, `reins-near-drain` (`.testnet`) | used by `bun run demo` / `attack` |

Mainnet: not deployed. Previous v0.1 contract `reins-demo.testnet` is retired.

## Environment variables

| Variable | Used by | Default | Secret? |
| --- | --- | --- | --- |
| `PREFIX` | scripts | `reins-near` | no |
| `REINS_CONTRACT` | scripts, SDK, MCP | `reins-near.testnet` | no |
| `OWNER_KEY` | scripts (owner) | read from `~/.near-credentials/testnet/<owner>.json` | **yes** |
| `MERCHANT_KEY` | attack script (reporter) | `~/.near-credentials` | **yes** |
| `REINS_OWNER`, `REINS_AGENT_KEY` | MCP server | none | `REINS_AGENT_KEY` **yes** (function-call key only) |
| `NEAR_RPC`, `NEAR_ARCHIVAL_RPC`, `NEARBLOCKS_API` | SDK | FastNEAR testnet, archival-rpc.testnet.near.org, api-testnet.nearblocks.io | no |
| `REINS_API` | SDK screen | `https://reins-api.adoranto737.workers.dev` | no |
| `ONE_CLICK_API`, `ONE_CLICK_JWT` | MCP Intents quotes | 1click.chaindefuser.com; JWT optional | JWT yes |
| `BASE_SEPOLIA_RPC`, `EVM_MERCHANT` | crosschain script | sepolia.base.org, `0x…dEaD` | no |
| `GROQ_API_KEY` | API Worker | none | **yes**: `wrangler secret put GROQ_API_KEY`, never in a file |
| `NEXT_PUBLIC_REINS_API`, `NEXT_PUBLIC_BASE_PATH`, `NEXT_PUBLIC_NEAR_RPC` | console build | see `packages/dashboard/lib/chain.ts` | no |

## Deploy your own copy

Prerequisites: Rust (pinned by `rust-toolchain.toml`) with `wasm32-unknown-unknown`, `cargo-near`,
`near` CLI (near-cli-rs), bun ≥ 1.3, and for the Worker/console a Cloudflare account with `wrangler` logged in.

```bash
bun install --linker hoisted

# 1. contract + tUSD + demo accounts (faucet-funded, keys saved to ~/.near-credentials)
PREFIX=yourname-reins ./scripts/deploy.sh
#    builds with `cargo near build non-reproducible-wasm`, deploys reins (init on first deploy,
#    code-only upgrade afterwards), deploys tUSD once, registers storage, funds the owner's vault

# 2. exercise it
PREFIX=yourname-reins bun run demo
PREFIX=yourname-reins bun run attack
PREFIX=yourname-reins bun run crosschain
PREFIX=yourname-reins bun run verify

# 3. API Worker (needs a Groq key)
cd packages/api && npx wrangler deploy && npx wrangler secret put GROQ_API_KEY

# 4. console (static export on Workers static assets)
cd packages/dashboard && NEXT_PUBLIC_REINS_API=https://<your-api>.workers.dev bun run deploy:cf
```

Upgrading the contract: `./scripts/deploy.sh` redeploys code without re-initialising. A change to the stored
types needs a fresh account (`PREFIX=…`) or a migration method.

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull request: rustfmt, clippy on
wasm (`-D warnings`), contract tests, release wasm build, typecheck, JS tests, console build, gitleaks secret
scan and `cargo audit`. Deployments are done from a developer machine with the commands above; there is no
automatic deploy from CI, because deploying needs NEAR and Cloudflare credentials we do not store in GitHub.
