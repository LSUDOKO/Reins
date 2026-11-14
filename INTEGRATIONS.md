# Integrations

Every external system Reins depends on, where it is used, and how to verify it. Status values:

- **live-verified**: exercised against the live network; a transaction or log in this repository proves it.
- **implemented, not broadcast**: the NEAR side runs live, but the resulting foreign-chain transaction was not sent.
- **quote-only**: read-only calls by design.

Transaction hashes are on NEAR testnet; open them at `https://testnet.nearblocks.io/txns/<hash>`. `bun run verify`
re-checks every hash recorded in `demo/receipts.json`.

## NEAR protocol features

| Integration | What Reins does with it | Code | Status | Verify |
| --- | --- | --- | --- | --- |
| **Function-call access keys** | The agent's only credential: a key on the owner's account (or the agent's sub-account) that may call only `pay`, `pay_evm`, `request_approval` and `issue_subrein` on the Reins contract, with a gas allowance | `OwnerClient.grantRein` (`packages/sdk/src/owner.ts`), `caller_rein` (`contracts/reins/src/agent.rs`), `createReinWithKey` (`packages/dashboard/lib/near.tsx`) | live-verified | `bun run attack`: the agent key's `withdraw` call is rejected by the network ("Deposit is not allowed with function call") and `set_allow` with "Access key does not allow method" |
| **Deposit rule as the owner/agent boundary** | Every owner method requires ≥ 1 yoctoNEAR; function-call keys cannot attach one | `full_access_owner` (`contracts/reins/src/owner.rs`) | live-verified | Unit tests `agent_key_cannot_*` in `contracts/reins/src/tests.rs` |
| **Promises and private callbacks** | Budget and vault are booked before the transfer; `on_paid` / `on_signed` / `on_token_withdrawn` roll back on failure | `contracts/reins/src/agent.rs`, `evm.rs`, `tokens.rs` | live-verified | Rolled-back transfer `6WFbMj19cMAR9datfLQRbwx2LXZDZBciMAU7VJtHFUPB`; tests `failed_transfer_restores_budget_and_vault`, `failed_signature_restores_budget_and_nonce` |
| **NEP-297 events** | Every state change emits `EVENT_JSON` under standard `reins`; the SDK, console and `verify` read them | `contracts/reins/src/events.rs`, `parseEvents` (`packages/sdk/src/tx.ts`) | live-verified | `bun run verify` checks the expected event per recorded transaction |
| **Storage staking** | Storage added by any call is charged to the owner's vault, never to the contract's own balance | `charge_storage` (`contracts/reins/src/lib.rs`) | live-verified | Test `storage_is_charged_to_the_vault` |
| **Named sub-accounts** | An agent can get its own account `x.owner.testnet`, created with only its function-call key (CreateAccount + Transfer + AddKey in one transaction) | `createAgentAccount` (`packages/sdk/src/owner.ts`), `insert_rein` (`owner.rs`) | live-verified | Payment `CKT6k4FVtghMugCbCYS3WKHA9H9MmRhH4VPjwPHbfwwN`; tests `sub_account_*` |
| **NEP-141 fungible tokens** | Budgets in a token: deposit with `ft_transfer_call` (`ft_on_transfer`), pay with `ft_transfer`, withdraw with rollback | `contracts/reins/src/tokens.rs`, test token `contracts/test-token` (tUSD, 6 decimals, `reins-near-tusd.testnet`) | live-verified | tUSD payment `FAGTDeELN65QGUt8g3SK5Ms1U55FMMYAEN4QDYVkTjuD`; tests `token_*` |
| **Chain Signatures (MPC)** | The contract builds an EIP-1559 value transfer, checks it against the rein, then calls `sign` on `v1.signer-prod.testnet` with `payload_v2`, path `reins-<id>`, `domain_id: 0` | `contracts/reins/src/evm.rs`; derivation and assembly in `packages/sdk/src/evm.ts`; `scripts/crosschain.ts` | implemented, not broadcast | Signed request `3y8qKiaonBMUUfgEykdZ9Af57W5qPxXFAbXtFpoyvd1G`; the script recovers the signer and checks it equals the rein's derived Base Sepolia address. It is not broadcast because that address holds no Base Sepolia ETH for gas |

## NEAR ecosystem services

| Integration | Use | Code | Status | Verify |
| --- | --- | --- | --- | --- |
| **NEAR Intents 1Click API** (`https://1click.chaindefuser.com/v0/quote`) | `quote_cross_chain` MCP tool: price a cross-chain payment. Always `dry: true`; Intents has no testnet | `packages/mcp/src/intents.ts` | quote-only | Test `1Click quote body is always a dry run` in `packages/mcp/test/server.test.ts` |
| **NEAR Wallet Selector** (HOT, Intear, HERE, Sender) | Owner sign-in and transaction signing in the console | `packages/dashboard/lib/near.tsx` | built; not exercised with a real extension in CI | MyNearWallet was removed: since 2026-11-01 it shows a notice that app approvals are switched off. Meteor was left out because its module requires an older near-api-js and broke the build |
| **Testnet faucet helper** (`https://helper.nearprotocol.com/account`) | One-click "testnet demo account" in the console; the key stays in the tab's `sessionStorage`. Also used by `near-cli` in `scripts/deploy.sh` | `createDemoAccount` (`packages/dashboard/lib/near.tsx`) | live-verified | Browser run in README "Web console": demo account → deposit → create rein → freeze/unfreeze |
| **FastNEAR RPC** (`https://test.rpc.fastnear.com`) | Default JSON-RPC for views and transactions | `packages/sdk/src/client.ts`, `packages/dashboard/lib/chain.ts` | live-verified | Every script |
| **Archival RPC** (`https://archival-rpc.testnet.near.org`) | Counterparty signal: compares a contract's `code_hash` now with ~1M blocks earlier | `packages/sdk/src/counterparty.ts` | live-verified | `collectSignals`; offline tests in `packages/sdk/test/counterparty.test.ts` |
| **NEARBlocks API v1** (`/v1/account/{id}`) | Counterparty signal: account age from `created.block_timestamp`. The v1 activity endpoints were retired, so activity counts are not claimed | `packages/sdk/src/counterparty.ts` | live-verified | `bun run attack` prints the age reasons |

## AI and agent integrations

| Integration | Use | Code | Status | Verify |
| --- | --- | --- | --- | --- |
| **Model Context Protocol** (`@modelcontextprotocol/sdk`) | Stdio server with 9 tools: `rein_status`, `check_counterparty`, `preview_payment`, `pay`, `pay_cross_chain`, `approval_status`, `issue_subrein`, `screen_text`, `quote_cross_chain`. There are deliberately no tools for withdraw, approve, freeze or allow. Warn verdicts ask the human through MCP elicitation | `packages/mcp/src/server.ts` | live-verified | `demo/logs/mcp-smoke.log`; browser-created agent key paid via MCP: `HZi89SfSqgfVpWcsT2YsBNeoZno96jEs9Tbc9rn2TZFT` |
| **Groq, `openai/gpt-oss-120b`** | `/draft` turns plain English into rein terms (validated and clamped in code); `/explain` describes terms in plain English | `packages/api/src/worker.ts`, `packages/api/src/terms.ts` | live-verified | `curl https://reins-api.adoranto737.workers.dev/health`; tests in `packages/api/test/api.test.ts` |
| **Groq, `meta-llama/llama-prompt-guard-2-86m`** | `/screen` scores the text behind a payment for prompt injection; ≥ 0.5 refuses before signing | `packages/api/src/worker.ts`, `screenText` (`packages/sdk/src/screen.ts`) | live-verified | `bun run attack`: the first attempt is refused with `prompt_injection_detected` |
| **Cloudflare Workers** | Hosts the API (`reins-api`, Groq key stored as a Worker secret) and the console as static assets (`reins`) | `packages/api/wrangler.jsonc`, `packages/dashboard/wrangler.jsonc` | live-verified | https://reins.adoranto737.workers.dev · https://reins-api.adoranto737.workers.dev/health |

## Foreign chains

| Integration | Use | Code | Status |
| --- | --- | --- | --- |
| **Base Sepolia** (chain id 84532, `https://sepolia.base.org`) | Target chain for Chain Signatures reins: nonce, gas price, and broadcast once the derived address is funded | `scripts/crosschain.ts`, `pay_cross_chain` in `packages/mcp/src/server.ts` | implemented, not broadcast |

## Libraries

near-sdk 5.30, near-contract-standards 5.30, near-api-js 7, @near-wallet-selector 10, @noble/curves and
@noble/hashes (secp256k1 recovery, keccak, sha3), @modelcontextprotocol/sdk, zod, Next.js, Framer Motion
(`motion`), wrangler.
