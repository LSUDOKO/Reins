# Roadmap

Plans, not promises. The "Now" section describes what is in this repository today; everything
after it is future work.

## Now (v0.2.0, NEAR testnet)

- Reins contract (`reins-near.testnet`) covering NEAR and NEP-141 budgets, per-payment caps,
  budget windows, approvals, merchant allowlists, expiry, use counts, sub-reins, a shared bonded
  blocklist, and Chain Signatures EVM value transfers.
- TypeScript SDK with a counterparty guard and prompt-injection screening; an MCP server with 9 tools.
- Owner CLI, console (Cloudflare), plain-English API (Cloudflare Worker + Groq).
- Internal security review, unit tests and testnet transaction proofs (see [SECURITY.md](SECURITY.md), [JUDGES.md](JUDGES.md)).

## Next 4 weeks

- **Broadcast relayer for Chain Signatures payments.** Fund derived addresses and send the signed
  EIP-1559 transaction automatically, recording the foreign tx hash in an event.
- **ERC-20 transfers through Chain Signatures.** Fixed `transfer(to, amount)` calldata built in the
  contract, with token allowlists per rein.
- **Wallet coverage.** Re-add Meteor once its Wallet Selector module supports near-api-js 7, and
  test HOT, Intear, HERE and Sender end to end.
- **Activity view in token and ETH units.** The console still shows non-NEAR activity in NEAR.
- **Policy templates.** Ready-made reins for common jobs (API credits, data purchases, sub-agent budgets).

## 3 months

- **Independent third-party audit** of the contract before any mainnet deployment.
- **Mainnet launch** with a conservative per-owner cap and a pause switch held by a multisig.
- **NEAR Intents execution** (not just quotes) for cross-chain merchant payouts on mainnet.
- **Blocklist dispute process.** A challenge window with bond slashing for false reports.
- **Protocol fee** (opt-in basis points on settled payments), designed and audited with the above.

## 6+ months

- **Attested guard.** Run the counterparty and injection guard in a TEE (for example NEAR AI Cloud
  private inference) and verify its attestation on-chain before accepting its verdict.
- **Hosted API with billing** for teams: metered screening, drafting and risk scoring.
- **More chains through Chain Signatures** (Bitcoin, Solana) under the same rein rules.
- **Agent marketplace integrations.** Reins as the budget layer for hired agents on NEAR Agent Market.
