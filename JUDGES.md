# For judges

This page is written for reviewers, human or AI, who want to check Reins quickly. Every claim has a file, a
command and, where possible, a testnet transaction. Nothing here needs keys.

**Three commands, five minutes:**

```bash
cargo test -p reins                                   # 75 passed: rules, authorization, rollback, audit regressions
bun install --linker hoisted && bun test packages/sdk packages/mcp packages/api packages/dashboard/lib   # 45 pass
bun run verify                                        # re-checks the live contract and every recorded tx: 18/18 PASS (20/20 with --tests)
```

Then open the console: <https://reins.adoranto737.workers.dev> → **Create a testnet demo account** (one click,
faucet-funded, key stays in your tab) → Connect → type "0.5 NEAR a day, max 0.1 per payment".

---

## 1. Executive summary

AI agents that pay for APIs, data and compute either hold a funded key (one prompt injection drains it) or need
a human to approve every payment. **Reins** is the middle ground on NEAR: the owner keeps funds in a contract
vault and gives each agent a **rein**, spending rules bound to a NEAR **function-call access key** that can only
ask the contract to pay. The contract enforces the rules for NEAR, for NEP-141 stablecoins, and for payments on
other chains through **NEAR Chain Signatures**. An agent-side guard adds counterparty checks and prompt-injection
screening, and an MCP server plugs it into Claude Code, Codex or any MCP agent.

Tracks: **AI Security & Defense** (`security`), **Agent Economy** (`agents`).

## 2. The problem is real

| Evidence | Source |
| --- | --- |
| An AI agent guarding a prize pool was talked into sending $47K by a crafted message | [Cointelegraph, 2024-11-29](https://cointelegraph.com/news/crypto-user-convinced-ai-bot-transfer-47k) |
| AI agent AIXBT lost 55.5 ETH (~$100K) after an attacker reached its control dashboard | [The Block, 2025-03-18](https://www.theblock.co/news/regulation/2025-03-18-ai-crypto-bot-aixbt-lost-eth-hack-unauthorized-dashboard-access-346911) |
| Prompt injection is the #1 LLM application risk | [OWASP LLM01:2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) |
| Planted "memories" make Web3 agents send funds to attackers | [Princeton et al., arXiv 2503.16248](https://arxiv.org/html/2503.16248) · [Ars Technica](https://arstechnica.com/security/2025/05/ai-agents-that-autonomously-trade-cryptocurrency-arent-ready-for-prime-time/) |
| Practical attacks on crypto agents, "no silver bullet" | [IACR ePrint 2025/526](https://eprint.iacr.org/2025/526.pdf) |
| Agent payments are becoming infrastructure | [Google AP2](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol) · [Coinbase x402](https://www.coinbase.com/developer-platform/discover/launches/x402) · [Visa agent payments](https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.22276.html) |

The common failure: **the agent's judgement is the last line of defence.** Reins moves the last line into a
contract the agent cannot talk its way past.

## 3. Claims and evidence

Testnet transactions are on [nearblocks testnet](https://testnet.nearblocks.io); all are re-checked by
`bun run verify` ([output](tests/results/verify.txt)).

### Core security property

| # | Claim | How | Code | Verify |
| --- | --- | --- | --- | --- |
| 1 | An agent key **cannot** withdraw, raise limits, unfreeze, approve its own request or unblock a scammer | owner methods require ≥ 1 yoctoNEAR; NEAR forbids function-call keys to attach deposits | `owner.rs` `full_access_owner` | tests `agent_key_cannot_*`; live: `attack.log` row "withdraw vault → rejected: function-call keys cannot attach deposit" |
| 2 | The agent never names its rein; the contract finds it from `(predecessor, signer_account_pk)` and refuses relayed calls | `caller_rein` | `agent.rs` | tests `unknown_key_cannot_pay`, `call_relayed_through_another_contract_is_rejected` |
| 3 | Limits are enforced by the contract even if the agent-side guard is bypassed | `rawPay` skips the guard | `scripts/attack.ts` | reverts on-chain: [`sLmuZ8CT…` receiver_blocked](https://testnet.nearblocks.io/txns/sLmuZ8CT7bspVQKwaGgixZFDfBcKutvCnHJcagyHtA4), [`7AvSZyTM…` over_per_tx_cap](https://testnet.nearblocks.io/txns/7AvSZyTMvQn2MUjMhrSLUuAmazGh8p4DE2RBmDMrpi75), [`6C1bshc3…` child_budget_above_parent](https://testnet.nearblocks.io/txns/6C1bshc3q9gSXbAZwFVV4pXbznVVXdRonEdyGecMU2r9) |
| 4 | A failed transfer rolls back budget, uses and vault | `on_paid` + `Booking` | `agent.rs`, `guard.rs` | [`5DmnS2jM…` payment_failed](https://testnet.nearblocks.io/txns/5DmnS2jMokP9tvQN97LG3JGLgB1t4A5eejNL7sPF2zu6); test `failed_transfer_restores_budget_and_vault` |

### Features

| # | Claim | Code | Live evidence |
| --- | --- | --- | --- |
| 5 | Agent pays inside its rein through the guard | `agent.ts` `guardedPay` | [`DVuz9gUx…`](https://testnet.nearblocks.io/txns/DVuz9gUx69shV3hacNBXZLCLFFYsrxmiYbLKwptaXcst) |
| 6 | Above-threshold payments become an on-chain request the owner approves | `request_approval`, `approve_request` | request [`7CDLfU1P…`](https://testnet.nearblocks.io/txns/7CDLfU1Pbw9GU6cKZmRma45SES5wD3rxwJa2or1CrS4w) → approved & paid [`7V9YPRq2…`](https://testnet.nearblocks.io/txns/7V9YPRq2vwiwyHtxZP55BYEtUatdWrW8uT1TEWpdrY2w) |
| 7 | Agents can split their allowance for sub-agents but never mint new allowance; spend counts up the tree | `issue_subrein`, `check` over `chain(id)` | sub-rein [`7kZFS2wR…`](https://testnet.nearblocks.io/txns/7kZFS2wRgTydndL55pbapiqjry1yaejL76zGig2aL7SQ), sub-agent payment [`vqNbMCGb…`](https://testnet.nearblocks.io/txns/vqNbMCGbtD4sWHW53k9AKr6Uftbj99U3Re9dqmQfUSh) |
| 8 | **Named sub-account agents**: an agent gets its own account `x.owner.testnet` whose only key is the function-call key | `create_rein(…, agent_account)`, `OwnerClient.createAgentAccount` | [`EfaAS2oN…`](https://testnet.nearblocks.io/txns/EfaAS2oNty1jqNZhbDt5VmDazAsTSTVfvAF5uFoj6BW2) |
| 9 | **Stablecoin budgets** (NEP-141) | `tokens.rs`, `contracts/test-token` | 4 tUSD payment [`HJuKJAsM…`](https://testnet.nearblocks.io/txns/HJuKJAsM3ke3H8HfE9sFjbLHx1fqb5XioHpyu29ma1iG) |
| 10 | **Cross-chain payments via Chain Signatures**: the contract builds the EIP-1559 tx, checks it, and only then asks the MPC network to sign | `evm.rs` `pay_evm` | signed [`5ysnzgdo…`](https://testnet.nearblocks.io/txns/5ysnzgdoSBfXTQ4DRciGdMptpQFs8TFxA9rBhnfK7Qyd); refused before signing: [`GTfrw8jaJ…` merchant_not_allowed](https://testnet.nearblocks.io/txns/GTfrw8jaJaS5FXDuDAiz4cVbeh9ySgnP4QEFu182bMHQ), [`7Fif8tvs…` over_per_tx_cap](https://testnet.nearblocks.io/txns/7Fif8tvszGW4HYKH6wFvTjxNA1vZYosiETfAYJMGJfCx); `bun run crosschain` prints `recovered signer == rein address` ([log](demo/logs/crosschain.log)) |
| 11 | Shared, bonded blocklist with evidence; the on-chain evidence hash matches a committed file | `report`, `blocked_for` | `bun run verify` row "report evidence matches the file in this repo" |
| 12 | Prompt-injection screening of the text behind a payment | `packages/sdk/src/screen.ts`, `packages/api` (Llama Prompt Guard 2) | `attack.log` first row: `refused (prompt_injection_detected), nothing signed` |
| 13 | Counterparty verdict from 6 signals; unavailable signals never count as safe or risky | `policy.ts`, `counterparty.ts` | `packages/sdk/test/policy.test.ts`, `counterparty.test.ts` |
| 14 | Plain English → contract terms → plain-English explanation | `packages/api/src/terms.ts`, `/draft`, `/explain` | `curl -X POST https://reins-api.adoranto737.workers.dev/draft …` (see [API.md](API.md)) |
| 15 | MCP server for any agent; no owner tools | `packages/mcp/src/server.ts` | `mcp-smoke.log`: blocked → elicitation → paid |
| 16 | Full owner flow works in a browser with no wallet extension | `packages/dashboard/lib/near.tsx` demo session | `tests/e2e/console.e2e.mjs` 8/8 PASS ([result](tests/results/e2e-console.txt)) |
| 17 | NEAR Intents quotes for cross-chain pricing | `packages/mcp/src/intents.ts` | `dry: true` only; Intents has no testnet |

## 4. What is technically novel

1. **The NEAR access-key system is the policy boundary.** Most agent-wallet products enforce limits in a server
   or a policy engine. Reins uses two protocol facts: function-call keys are method-scoped, and they cannot
   attach deposits. So "the agent cannot withdraw" holds even if our code, our server or the key's method list
   were wrong.
2. **One rein, three currencies, one rule engine.** The same `check` gates native NEAR, NEP-141 tokens and EVM
   transactions signed by Chain Signatures. For EVM, the **contract builds the transaction bytes**; the agent
   supplies only `to`, `value`, `nonce` and capped fees, so it cannot smuggle calldata, change the chain id or
   inflate fees.
3. **Hierarchical budgets** (`book` along the ancestor chain) let agents delegate to sub-agents safely.
4. **Settlement carries a `Booking`**, so asynchronous rollbacks are exact even across budget windows (this came
   out of our own audit, findings C-2 and M-1).
5. **Defence in depth that degrades safely**: guard signals and injection screening only add caution; when a
   source is down it is reported as unavailable, and the contract rules still apply.

## 5. NEAR integration depth

| NEAR feature | Used for | Where |
| --- | --- | --- |
| Function-call access keys | the agent credential and the owner/agent boundary | `agent.rs`, `owner.rs`, `OwnerClient.grantRein` |
| Named sub-accounts | per-agent on-chain identity | `insert_rein`, `createAgentAccount` |
| Chain Signatures (MPC `v1.signer-prod.testnet`) | rein-gated payments on Base Sepolia | `evm.rs`, `sdk/src/evm.ts` |
| NEP-141 | stablecoin budgets (`ft_on_transfer`, `ft_transfer`) | `tokens.rs` |
| NEP-297 events | every state change, parsed by SDK and `verify` | `events.rs` |
| Promises + `#[private]` callbacks | settle or roll back | `on_paid`, `on_signed`, `on_token_withdrawn` |
| Storage staking | charged to the owner's vault, never the contract | `charge_storage` |
| NEAR Intents 1Click | cross-chain quotes | `mcp/src/intents.ts` |
| Wallet Selector (HOT, Intear, HERE, Sender) | owner sign-in | `dashboard/lib/near.tsx` |
| Faucet helper, FastNEAR RPC, archival RPC, NEARBlocks | demo accounts, reads, code-change and age signals | `near.tsx`, `counterparty.ts` |

More in [INTEGRATIONS.md](INTEGRATIONS.md).

## 6. AI integration (what it actually does)

| Where | Model / protocol | Purpose | Trust |
| --- | --- | --- | --- |
| Agent runtime | MCP (Claude Code, Codex, any client) | the agent pays through 9 Reins tools | untrusted: limited by the rein |
| Warn verdicts | MCP elicitation | ask the human mid-task | human decides |
| `/screen` | Llama Prompt Guard 2 (Groq) | detect injected instructions in the text behind a payment | advisory |
| `/draft`, `/explain` | gpt-oss-120b (Groq) | plain English ⇄ terms | model output is validated and clamped in code, shown before signing, and re-validated by the contract |

## 7. Security

Internal audit with 13 findings (2 critical, 1 high, 3 medium, 5 low, 2 informational); all critical, high and
technical medium findings are fixed, deployed and covered by regression tests. Not third-party audited; testnet
only. Full report: [SECURITY.md](SECURITY.md).

## 8. Deployment

Contract [`reins-near.testnet`](https://testnet.nearblocks.io/address/reins-near.testnet) v0.2.0 ·
console <https://reins.adoranto737.workers.dev> · API <https://reins-api.adoranto737.workers.dev/health>.
See [DEPLOYMENT.md](DEPLOYMENT.md).

## 9. Business

Who pays: teams running agents that buy APIs, data and compute, and the platforms that host them. Possible
revenue: hosted guard API, policy packs, a protocol fee (not implemented). No customers or revenue yet. See
[BUSINESS.md](BUSINESS.md) and [ROADMAP.md](ROADMAP.md).

## 10. Honest limitations

- Testnet only; internal audit only.
- Chain Signatures payments are signed and verified on every run but broadcast only when the derived Base Sepolia
  address holds gas (it currently holds none).
- Intents is quote-only.
- Only the testnet demo-key sign-in is tested end to end in the browser; other wallets are wired but untested.
- Blocklist governance is simple (one bonded report; per-owner override).

## Prior work

The spending-card idea was explored earlier by the same author on an EVM chain. All NEAR code here (contract,
SDK, MCP server, API, scripts) was written during the hackathon window; the console reuses that earlier
project's UI components, then restyled (own pre-hackathon code, disclosed per rules Q-002/Q-005).
