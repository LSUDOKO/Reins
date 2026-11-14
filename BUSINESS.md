# Reins: business case

> **Status, stated plainly:** Reins is a hackathon-stage product running on NEAR **testnet**. It has
> **no revenue, no customers, no partnerships and no mainnet deployment**. Everything under
> "Built today" can be checked in this repository; everything under "Opportunity" is a plan.

## 1. The problem

AI agents are being given money to spend on APIs, data, compute and purchases. The two common
setups both fail:

| Setup | What goes wrong | Real example |
| --- | --- | --- |
| The agent holds a funded key or wallet | One prompt injection, poisoned memory or compromised dashboard moves the whole balance | Freysa, an AI agent guarding a prize pool, was talked into transferring about $47K ([Cointelegraph](https://cointelegraph.com/news/crypto-user-convinced-ai-bot-transfer-47k)). AIXBT lost 55.5 ETH after an attacker reached its dashboard ([The Block](https://www.theblock.co/news/regulation/2025-03-18-ai-crypto-bot-aixbt-lost-eth-hack-unauthorized-dashboard-access-346911)) |
| A human approves every payment | Safe, but the agent is no longer autonomous, which defeats the purpose | — |

The underlying weakness is well documented. OWASP ranks prompt injection as the first risk in its
2025 LLM Top 10 ([LLM01:2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)).
Academic work shows practical attacks that make Web3 agents move funds by planting false memories
([Real AI Agents with Fake Memories](https://arxiv.org/html/2503.16248)) and concludes there is
"no silver bullet" at the model layer ([AI Agents in Cryptoland](https://eprint.iacr.org/2025/526.pdf)).

**Implication:** the limit must be enforced *outside* the model, by something the model cannot
talk its way past.

## 2. Why now

Payment networks are building rails for agents to pay:

- Google announced the Agent Payments Protocol, AP2 ([Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)).
- Visa launched a platform for AI-agent payments for businesses ([Visa press release](https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.22276.html)).
- Coinbase introduced x402 for internet-native, per-request payments ([Coinbase](https://www.coinbase.com/developer-platform/discover/launches/x402)), and Cloudflare co-founded the x402 Foundation ([Cloudflare blog](https://blog.cloudflare.com/x402/)).

At the same time, Gartner predicts that over 40% of agentic AI projects will be canceled by the
end of 2027, citing costs, unclear value and inadequate risk controls among the reasons
([Gartner](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)).
Rails for agents to pay are arriving faster than controls on *what* they may pay. Reins is
that control layer.

## 3. Customers

| Segment | Job to be done | Why Reins fits |
| --- | --- | --- |
| Agent developers (Claude Code, Codex, custom MCP agents) | Let an agent buy API credits, data or compute without a human per payment | MCP server with `pay`, `preview_payment`, `check_counterparty` (`packages/mcp`) |
| AI-native SaaS paying many vendors | Cap spend per agent, per vendor, per day | Budget windows, per-payment caps, merchant allowlists, approvals (`contracts/reins/src/guard.rs`) |
| DAOs and treasuries delegating to agents | Give an agent a bounded allowance without handing over the multisig | Vault plus revocable reins; owner-only methods need a full-access key |
| Agent marketplaces (e.g. NEAR's [Agent Market](https://market.near.ai/)) | Let hired agents spend on the buyer's behalf, within the job's budget | Sub-reins: an agent can split its allowance for sub-agents but never raise it |

None of these segments are customers today.

## 4. Competitive landscape

All rows below describe each product only by what its own pages state.

| Product | What it offers | Where the limit is enforced | Gap Reins addresses |
| --- | --- | --- | --- |
| Coinbase CDP Wallet Policies ([launch post](https://www.coinbase.com/developer-platform/discover/launches/policy-engine)) and Spend Permissions ([docs](https://docs.cdp.coinbase.com/wallets/using-wallets/spend-permissions)) | Programmable policies enforced "at the signing layer"; a trusted spender can spend from a Smart Account | CDP's signing service; Spend Permissions on Base smart accounts | Reins enforces in an open NEAR contract anyone can verify, with no hosted signer in the payment path |
| Turnkey ([AI agents](https://www.turnkey.com/solutions/ai-agents), [policy engine](https://www.turnkey.com/blog/turnkey-policy-engine-guardrails-web3-transactions)) | Wallets with policies that govern agent actions | Turnkey's secure enclave infrastructure | Same: a hosted policy service versus a public contract |
| Crossmint ([agent wallets](https://www.crossmint.com/products/agentic-wallets)) | Non-custodial agent wallets "within programmable spending limits", cards and stablecoins | Crossmint's wallet stack | No shared scam blocklist; no NEAR-native key model |
| Skyfire ([TechCrunch](https://techcrunch.com/2024/08/21/skyfire-lets-ai-agents-spend-your-money/)) | A payment network that lets agents spend money | Skyfire's network | A network operator rather than self-custody rules |
| Payman ([docs](https://docs.paymanai.com/overview/introduction)) | A platform where AI agents move money "with rules, and under human control" | Payman's platform | A hosted platform rather than an on-chain rule set |

**What Reins does differently.** These are facts of the implementation, each with a test or
transaction in [JUDGES.md](JUDGES.md):

1. **Contract-enforced, not service-enforced.** Limits live in a NEAR contract; no Reins server
   signs or relays payments.
2. **NEAR's key model is the security boundary.** The agent's credential is a NEAR function-call
   access key. NEAR forbids such keys from attaching deposits, so they can never reach owner methods.
3. **One rule set, many chains.** The same rein can gate an EVM payment that NEAR Chain Signatures
   signs only after the contract approves it (`contracts/reins/src/evm.rs`).
4. **A shared, bonded blocklist.** One owner's report protects every owner's agents, unless an
   owner explicitly allows the account. This creates a network effect.

## 5. Revenue model (opportunity; none is implemented)

| Model | Description | Status |
| --- | --- | --- |
| Protocol fee on `pay` | A small basis-point fee on settled payments | **Not implemented.** The contract takes no fee today |
| Hosted guard / API | Prompt-injection screening, plain-English drafting and counterparty scoring as a metered API (today's `packages/api` Worker) | The API runs free on testnet; there is no billing |
| Enterprise policy packs | Pre-built rein templates (vendor lists, approval chains), audit exports from NEP-297 events | Not built |
| Risk data | Curated feeds from the shared blocklist and payment-pattern signals | Not built; the blocklist exists on-chain |

## 6. Go-to-market

1. **Developers first.** One `claude mcp add` line gives any MCP agent a bounded wallet. The
   console's one-click testnet demo account removes wallet setup for evaluation.
2. **NEAR ecosystem distribution.** Agent Market listings, the NEAR Intents and Chain Signatures
   communities, and hackathon follow-ups.
3. **Template-led onboarding.** "Research agent: 1 NEAR/day, approval above 0.3" style presets,
   written in plain English through the `/draft` endpoint.

## 7. Cost model

| Cost | Driver | Reference |
| --- | --- | --- |
| Contract storage | Each rein, request and report is paid from the **owner's vault** at NEAR's storage staking rate, never from the contract's own balance (`charge_storage` in `contracts/reins/src/lib.rs`) | [NEAR storage staking](https://docs.near.org/protocol/storage/storage-staking) |
| Gas | Agent calls are paid from the agent key's own allowance (0.25 NEAR by default) | [NEAR access keys](https://docs.near.org/protocol/accounts-contracts/access-keys) |
| API hosting | Cloudflare Workers (`packages/api`, console static assets) | [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Model inference | Groq: `openai/gpt-oss-120b` for drafting, `meta-llama/llama-prompt-guard-2-86m` for screening | [Groq pricing](https://groq.com/pricing) |

The payment path is a single contract call, so payment volume costs Reins nothing beyond the
user's own gas and storage. The hosted API is the only variable cost, and it is optional.

## 8. Defensibility

- **Shared blocklist data.** Bonded reports with evidence hashes accumulate on-chain and become
  more useful as more owners use them.
- **Integration depth.** Function-call keys, Chain Signatures, NEP-141, sub-accounts and NEP-297
  events combine into a model that a wallet SDK cannot copy without a contract.
- **Open verifiability.** Anyone can audit the rules and replay `bun run verify`. This is a trust
  advantage over closed policy engines.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| No third-party audit yet | Internal review and tests are in [SECURITY.md](SECURITY.md); an external audit precedes mainnet ([ROADMAP.md](ROADMAP.md)) |
| Blocklist griefing | A bond per report plus a per-owner `set_allow` override; dispute resolution is future work |
| Chain Signatures payments are value transfers only | ERC-20 support and a broadcast relayer are on the roadmap |
| Dependence on Groq for the hosted screen | Screening fails open to "unavailable" and the contract limits still apply; the provider can be swapped |
| Wallet ecosystem churn (MyNearWallet stopped approving app transactions in November 2026) | Multiple wallets through Wallet Selector, plus a testnet demo-account path |

## 10. Milestones

See [ROADMAP.md](ROADMAP.md). In short: an external audit and mainnet launch, then ERC-20 and
broadcast via Chain Signatures, then the protocol fee and the hosted API with billing.
