# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Brand assets (logo, mark, banner, how-it-works diagram) in `docs/brand`, rendered from the console's type and doodles.
- Project documentation: business case, integrations, roadmap, contributing guide, issue and PR templates.

### Changed
- Contracts formatted with `rustfmt`.

### Security
Fixes from the internal audit (see [SECURITY.md](SECURITY.md)), deployed to `reins-near.testnet` as a code
upgrade; all demos re-run on the fixed contract.
- C-1: EVM reins can no longer file or receive NEAR approval requests (could pay out pooled NEAR).
- C-2: rein currency is immutable; settlement callbacks roll back using the booked currency and window.
- H-1: token deposits require `register_token`; unregistered and zero deposits are refunded without state.
- M-1: refunds never top up a newer budget window.
- M-2: `pay_evm` requires the exact next nonce; precise rollback; owner `reset_evm_nonce`.
- L-1/L-3/L-4/L-5: approval thresholds bind the whole chain; freeze applies to the subtree; revoked keys cannot
  be re-bound; at most 128 reins ever per owner.

### Added (testing)
- 12 audit regression tests (75 contract tests total), browser end-to-end test `tests/e2e/console.e2e.mjs`,
  committed results in `tests/results/`, CI: rustfmt, clippy on wasm, wasm build, console build, gitleaks,
  cargo audit.

## [0.2.0] - 2026-11-14

Contract redeployed to a fresh account, `reins-near.testnet` (the state layout changed).

### Added
- **Chain Signatures payments.** `pay_evm` builds an EIP-1559 value transfer in the contract,
  checks it against the rein (value plus worst-case fee), and requests an MPC signature from
  `v1.signer-prod.testnet`. A failed signature restores the budget and the nonce.
- **NEP-141 budgets.** `ft_on_transfer` deposits, `ft_transfer` payments, and `withdraw_token`
  with rollback. Includes the tUSD test token (`contracts/test-token`).
- **Named sub-account agents.** `create_rein(..., agent_account)` binds a key held by `x.owner.testnet`.
- SDK: Chain Signatures address derivation, signature recovery, signed transaction assembly,
  token-unit payments and sub-account grants.
- MCP: `pay_cross_chain` and `screen_text` tools; the `pay` tool screens its `context` for prompt injection.
- Reins API (Cloudflare Worker + Groq): `/draft`, `/explain`, `/screen`.
- Console redesign: brand theme, scroll motion, sign-in gate, a six-step Connect Agent wizard,
  token and cross-chain reins, and a one-click testnet demo account.
- Demos: `bun run crosschain`, sub-account and tUSD steps in `bun run demo`.

### Changed
- The console is hosted on Cloudflare Workers static assets instead of GitHub Pages.
- Only NEAR payments count toward the `volume` stat.

### Removed
- MyNearWallet from the console's wallet list (it stopped approving app transactions on 2026-11-01).

## [0.1.0] - 2026-11-14

First version, deployed to `reins-demo.testnet` (now retired).

### Added
- Reins contract:
  - vault, reins bound to function-call keys, owner methods gated on an attached yoctoNEAR
  - budget windows, per-payment caps, merchant allowlists, expiry and use limits
  - approval requests, sub-reins counted against every ancestor
  - shared bonded blocklist and `preview_pay`
  - NEP-297 events, and settlement callbacks with rollback
- TypeScript SDK: views, `OwnerClient`, `AgentClient.guardedPay` with a counterparty policy
  (blocklist, existence, age, code changes, history, look-alike names).
- MCP server, owner CLI, `scripts/deploy.sh`, `demo`, `attack`, a keyless `verify`, and an MCP smoke client.
- Web console ported from the author's earlier UI and wired to NEAR.
- CI for contract tests, typecheck and JS tests.

[Unreleased]: https://github.com/LSUDOKO/Reins/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/LSUDOKO/Reins/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/LSUDOKO/Reins/releases/tag/v0.1.0
