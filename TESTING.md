# Testing

Every number on this page comes from a real run whose output is committed in [`tests/results/`](tests/results).
Re-run any of them with the commands below.

## Summary (2026-11-14, contract v0.2.0 after the security fixes)

| Suite | Command | Result | Evidence |
| --- | --- | --- | --- |
| Contract unit tests | `cargo test -p reins` | **75 passed**, 0 failed | [contract.txt](tests/results/contract.txt) |
| Contract lint | `cargo clippy -p reins --target wasm32-unknown-unknown -- -D warnings` | 0 warnings | [clippy.txt](tests/results/clippy.txt) |
| Contract format | `cargo fmt --check` | clean | CI |
| JS unit tests (SDK, MCP, API, console logic) | `bun test packages/sdk packages/mcp packages/api packages/dashboard/lib` | **45 pass**, 0 fail, 110 assertions | [js.txt](tests/results/js.txt) |
| TypeScript | `bun run typecheck` | 0 errors | CI |
| Console build | `bun run --cwd packages/dashboard build` | static export OK | CI |
| Browser end-to-end (live site) | `node tests/e2e/console.e2e.mjs` | **8/8 PASS**, 0 console errors | [e2e-console.txt](tests/results/e2e-console.txt) |
| On-chain verification (no keys) | `bun run verify --tests` | **20/20 checks** | [verify.txt](tests/results/verify.txt) |
| Live adversarial run | `bun run attack` | 8/8 attacks stopped | [attack.log](demo/logs/attack.log) |
| Live feature run | `bun run demo`, `bun run crosschain`, `bun run mcp:smoke` | all steps as expected | [demo/logs](demo/logs) |

There is no line-coverage figure: none was measured, so none is claimed.

## What the contract tests cover (`contracts/reins/src/tests.rs`)

| Area | Tests (examples) |
| --- | --- |
| Authorization | `agent_key_cannot_withdraw`, `agent_key_cannot_raise_its_own_limits`, `agent_key_cannot_unfreeze`, `agent_key_cannot_override_blocklist`, `agent_key_cannot_approve_its_own_request`, `create_rein_without_deposit_fails`, `stranger_cannot_freeze_someone_elses_rein`, `call_relayed_through_another_contract_is_rejected`, `unknown_key_cannot_pay` |
| Spend rules | `per_tx_cap_is_enforced`, `budget_is_enforced_across_payments`, `budget_window_resets_after_the_period`, `merchant_allowlist_is_enforced`, `expiry_is_enforced`, `max_uses_is_enforced`, `frozen_rein_cannot_pay`, `cannot_pay_the_contract_itself`, `vault_must_cover_the_payment`, `terms_are_validated` |
| State transitions | approvals (`owner_approval_books_the_payment`, `rejected_request_moves_nothing`, `pending_requests_are_capped`, `expired_requests_free_their_slot`), freeze/unfreeze/revoke, `revoke_all_is_a_panic_button` |
| Sub-reins | `subrein_spending_counts_against_the_parent`, `parent_budget_caps_children`, `agent_cannot_mint_a_bigger_subrein`, `depth_is_bounded`, `revoking_a_parent_revokes_the_subtree` |
| Failure handling / rollback | `failed_transfer_restores_budget_and_vault`, `failed_token_transfer_restores_the_token_vault`, `failed_signature_restores_budget_and_nonce` |
| Storage economics | `storage_is_charged_to_the_vault`, `bond_is_stored_net_of_storage` |
| Blocklist | `reported_receiver_is_blocked`, `owner_can_allow_a_reported_receiver`, `report_needs_a_bond`, `report_needs_evidence_hash`, `retracting_the_last_report_unblocks` |
| NEP-141 | `token_deposit_credits_the_token_vault`, `token_rein_pays_from_the_token_vault_only`, `token_rein_limits_are_in_token_units`, `token_deposit_rejects_unknown_messages` |
| Chain Signatures | `evm_payment_books_value_plus_worst_case_fee_and_advances_the_nonce`, `evm_payment_respects_the_merchant_list`, `evm_payment_respects_the_cap`, `evm_fee_is_capped`, `near_rein_cannot_sign_evm_payments`, `evm_rein_cannot_pay_near`, `rlp_matches_known_vectors`, `eip1559_layout` |
| Sub-account agents | `sub_account_agent_pays_from_the_owner_vault`, `agent_account_must_be_a_sub_account_of_the_owner`, `sub_account_key_does_not_work_from_the_owner_account` |
| Preview consistency | `preview_agrees_with_pay` (the dry run returns the same code `pay` panics with) |
| Audit regressions | `audit_c1_*`, `audit_c2_*`, `audit_h1_*`, `audit_m1_*`, `audit_m2_*`, `audit_l1_*`, `audit_l3_*`, `audit_l4_*`: one or more per finding in [SECURITY.md](SECURITY.md) |

Arithmetic: the release profile has `overflow-checks = true`; tests exercise saturating window math and
rollback after window resets. Reentrancy: NEAR has no synchronous reentrancy; the tests cover the asynchronous
equivalent (state booked before the promise, rollback in `#[private]` callbacks, late callbacks after newer
state).

## JS tests

| File | Covers |
| --- | --- |
| `packages/sdk/test/policy.test.ts` | verdicts, look-alike detection, "unavailable never counts as risk" |
| `packages/sdk/test/counterparty.test.ts` | signal collection against fake RPC / NEARBlocks, offline behaviour |
| `packages/sdk/test/evm.test.ts` | EIP-1559 layout, signature recovery, derivation determinism |
| `packages/sdk/test/screen.test.ts`, `agent.test.ts`, `units.test.ts` | injection screen fallbacks, NEP-297 / panic parsing, unit conversion |
| `packages/mcp/test/server.test.ts` | tool surface (no owner tools), dry-only Intents quotes |
| `packages/api/test/api.test.ts` | model output → validated terms, clamping, plain-English summary, routes, CORS |
| `packages/dashboard/lib/*.test.ts` | draft parser, offline fallbacks, currency maths |

## Live / end-to-end

- **`tests/e2e/console.e2e.mjs`**: headless Chromium against the deployed console: one-click testnet account →
  deposit → wizard → create rein + key → `preview_pay` → freeze → unfreeze; fails on any console error.
- **`scripts/verify.ts`**: keyless; checks the deployed version, the blocklist, that the on-chain evidence hash
  equals the committed evidence file, and that every transaction in `demo/receipts.json` has its expected event
  or revert code.
- **`scripts/attack.ts`**, **`scripts/demo.ts`**, **`scripts/crosschain.ts`**, **`scripts/mcp-smoke.ts`**: real
  testnet transactions; logs in `demo/logs/`.

## Not covered

- No sandbox (near-workspaces) integration tests; cross-contract behaviour is covered by unit tests with mocked
  promise results plus the live testnet runs.
- No fuzzing or formal verification.
- Wallet-selector wallets (HOT, Intear, HERE, Sender) are wired but only the testnet demo-key sign-in is tested
  end to end.
