# API reference

Reins has four interfaces: the **contract** (`reins-near.testnet`), the **TypeScript SDK** (`@reins/sdk`), the
**MCP server** (`@reins/mcp`) and the **Reins API** Worker (`https://reins-api.adoranto737.workers.dev`).
Amounts are strings in the smallest unit: yoctoNEAR (10^24 per NEAR), token units (tUSD has 6 decimals) or wei.

## Contract `reins-near.testnet`

Source: [`contracts/reins/src`](contracts/reins/src). Every state change emits a NEP-297 event
`EVENT_JSON:{"standard":"reins","version":"1.0.0","event":…}`.

### Agent methods (the only methods an agent's function-call key is granted)

The rein is found from `(predecessor_account_id, signer_account_pk)`; the agent never names it.
Calls relayed through another contract are refused (`signer_must_be_owner`).

| Method | Args | Returns | Notes |
| --- | --- | --- | --- |
| `pay` | `receiver`, `amount`, `memo?` | promise → `bool` | NEAR or token rein. Panics with an error code (below) if any rule fails. Settles in `on_paid`; on failure budget, uses and vault are restored. Event `payment` / `payment_failed` |
| `pay_evm` | `to` (0x…), `value` (wei), `nonce`, `max_fee_per_gas`, `max_priority_fee_per_gas` | promise → `{signature, tx}` | EVM reins only. The contract builds an EIP-1559 value transfer (21,000 gas, no calldata), books `value + max_fee × 21000`, and calls Chain Signatures `sign`. `nonce` must equal the rein's `evm_nonce`. Event `evm_payment_signed` |
| `request_approval` | `receiver`, `amount`, `memo?` | `request_id` | Only when `pay` would fail with `needs_approval`. Max 4 open per rein, 24 h TTL. Event `approval_requested` |
| `issue_subrein` | `agent_key`, `label`, `terms` | `rein_id` | Narrower rein for a sub-agent; budget and cap ≤ parent, same currency. Works only after the owner adds that key. Event `rein_created` |

### Owner methods (attach ≥ 1 yoctoNEAR; any deposit is credited to your vault)

| Method | Args | Notes |
| --- | --- | --- |
| `deposit` | — | add NEAR to your vault |
| `withdraw` | `amount` | |
| `register_token` | `token` | opt in to a NEP-141 token (attach ~0.01 NEAR for storage); unregistered deposits are refunded |
| `withdraw_token` | `token`, `amount` | rolls back if the transfer fails |
| `create_rein` | `agent_key`, `label`, `terms`, `agent_account?` | `agent_account`: optional named sub-account of yours that holds the key; attach ~0.02 NEAR for storage |
| `create_subrein` | `parent`, `agent_key`, `label`, `terms`, `agent_account?` | |
| `update_terms` | `id`, `terms` | currency (`token`, `evm_chain_id`) cannot change |
| `freeze` / `unfreeze` / `revoke` | `id` | applies to the whole subtree; revoked keys can never be re-bound |
| `revoke_all` | — | panic button |
| `approve_request` / `reject_request` | `id` | approval re-checks every rule except the threshold, then pays |
| `set_allow` | `receiver`, `allowed` | per-owner override of the shared blocklist |
| `reset_evm_nonce` | `id`, `nonce` | EVM reins |

### Anyone

| Method | Notes |
| --- | --- |
| `report(account, evidence_hash, evidence_uri)` | attach ≥ 0.1 NEAR bond + storage; `evidence_hash` is sha256 hex of the evidence file |
| `retract_report(account)` | 1 yocto; refunds your bond |
| `ft_on_transfer(sender_id, amount, msg)` | NEP-141 receiver; `msg` must be empty |

### Views (free)

`get_rein(id)`, `reins_of(owner)`, `rein_for_key(account, public_key)`, `vault_of(owner)`,
`token_vault_of(owner, token)`, `get_request(id)`, `pending_requests_of(owner)`, `reports_of(account)`,
`is_blocked(owner, receiver)`, `pair_count(owner, receiver)`, `stats()`, `version()`, `mpc_contract()`,
`evm_path(rein_id)`, and the dry run:

```bash
near contract call-function as-read-only reins-near.testnet preview_pay json-args \
  '{"owner":"reins-near-owner.testnet","public_key":"ed25519:…","receiver":"reins-near-shop.testnet","amount":"10000000000000000000000"}' \
  network-config testnet now
# {"ok":true,"code":null,"needs_approval":false,"rein_id":…,"remaining":"…","vault":"…"}
```

### Terms

```jsonc
{
  "budget": "500000000000000000000000",   // per window (or lifetime if period_secs = 0)
  "period_secs": "86400",
  "per_tx_cap": "200000000000000000000000",
  "approval_above": "100000000000000000000000", // optional; must be < per_tx_cap
  "expires_at": "1797256827",                   // optional, unix seconds
  "max_uses": 100,                              // optional
  "merchants": ["reins-near-shop.testnet"],     // optional allowlist (0x addresses for EVM reins)
  "token": null,                                // or a NEP-141 account, e.g. "reins-near-tusd.testnet"
  "evm_chain_id": null                          // or e.g. "84532" for Base Sepolia via Chain Signatures
}
```

### Error codes (`contracts/reins/src/errors.rs`)

`unknown_key`, `signer_must_be_owner`, `rein_not_active`, `rein_expired`, `uses_exhausted`,
`merchant_not_allowed`, `over_per_tx_cap`, `over_budget`, `receiver_blocked`, `vault_insufficient`,
`needs_approval`, `zero_amount`, `self_payment`. Owner-side validation: `full_access_key_required`,
`not_owner`, `currency_immutable`, `child_budget_above_parent`, `key_already_bound`, `wrong_nonce`,
`evm_rein_use_pay_evm`, `too_many_reins`, …

## TypeScript SDK `@reins/sdk` ([`packages/sdk/src`](packages/sdk/src))

```ts
import { ReinsClient, OwnerClient, AgentClient, toYocto } from "@reins/sdk";

const reins = new ReinsClient("reins-near.testnet");             // views, no keys
const owner = new OwnerClient("you.testnet", OWNER_KEY, reins.provider, "reins-near.testnet");
const g = await owner.grantRein("research", { budget: toYocto("1"), period_secs: "86400", per_tx_cap: toYocto("0.2") });
//   -> create_rein + AddKey (function-call, agent methods only); g.secretKey goes to the agent

const agent = new AgentClient("you.testnet", g.secretKey, reins.provider, "reins-near.testnet");
const out = await agent.guardedPay({ receiver: "shop.testnet", amountNear: "0.05", context: pageText, askHuman });
// out.status: "paid" | "refused" | "pending_approval" | "declined_by_human" | "transfer_failed"
```

| Module | Exports |
| --- | --- |
| `client.ts` | `ReinsClient`: all views, `previewPay`, `keyAllowance` |
| `owner.ts` | `OwnerClient`: `grantRein` (incl. `subAccount`), `createAgentAccount`, `registerToken`, `deposit`, `freeze`, `revoke`, `approve`, `report`, `raw` |
| `agent.ts` | `AgentClient`: `guardedPay`, `rawPay`, `rawPayUnits`, `payEvm`, `requestApproval`, `issueSubrein`, `preview` |
| `policy.ts` | `assess(signals)` → allow / warn / block with reasons; look-alike detection |
| `counterparty.ts` | `collectSignals`, `checkCounterparty` |
| `screen.ts` | `screenText` (prompt-injection check via the Reins API) |
| `evm.ts` | `deriveEvmAddress`, `signedTx`, `recoverSigner`, `payloadOf` |

## MCP server `@reins/mcp` ([`packages/mcp/src/server.ts`](packages/mcp/src/server.ts))

```bash
claude mcp add reins -e REINS_OWNER=you.testnet -e REINS_AGENT_KEY=ed25519:… -- bun run /path/to/Reins/packages/mcp/src/index.ts
```

| Tool | Purpose |
| --- | --- |
| `rein_status` | terms, budget left, vault, gas allowance, pending approvals |
| `check_counterparty` | allow / warn / block with reasons |
| `preview_payment` | `preview_pay` dry run |
| `pay` | guarded payment; `context` is screened for prompt injection; warn → MCP elicitation |
| `approval_status` | state of a request |
| `issue_subrein` | narrower rein for a sub-agent |
| `pay_cross_chain` | Chain Signatures payment on the rein's EVM chain |
| `screen_text` | prompt-injection check |
| `quote_cross_chain` | NEAR Intents 1Click quote with `dry: true` (no funds move) |

No tool can withdraw, approve, freeze, allow or change terms.

## Reins API (Cloudflare Worker, [`packages/api/src/worker.ts`](packages/api/src/worker.ts))

Base URL `https://reins-api.adoranto737.workers.dev`. JSON in, JSON out. CORS: the console origins.

| Endpoint | Body | Response |
| --- | --- | --- |
| `GET /health` | — | `{ok, models, key}` |
| `POST /draft` | `{text}` | `{label, terms, explanation}`: plain English → validated contract terms |
| `POST /explain` | `{terms, label?}` | `{text, facts}`: terms → plain English |
| `POST /screen` | `{text}` | `{injection, score, model}`: Llama Prompt Guard 2, threshold 0.5 |

```bash
curl -s -X POST https://reins-api.adoranto737.workers.dev/draft -H 'content-type: application/json' \
  -d '{"text":"My research agent can spend 2 NEAR a week, max 0.5 per purchase, ask me above 0.3"}'
```
