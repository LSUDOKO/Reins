# Security model

## Trust boundaries

| Actor | Holds | Can |
| --- | --- | --- |
| Owner | full-access key of the owner account | everything: deposit, withdraw, create/update/freeze/revoke reins, approve requests, allow reported accounts |
| Agent | one function-call key on the owner account, restricted to `pay`, `request_approval`, `issue_subrein` on the Reins contract | spend inside its rein; ask for approval; split its allowance into sub-reins |
| Anyone | any NEAR account | report an account to the blocklist with a 0.1 NEAR bond and an evidence hash; read views |

## Why an agent key cannot reach owner methods

Every owner method requires `attached_deposit >= 1 yoctoNEAR`. The NEAR runtime rejects a function-call key transaction
with a non-zero deposit before it reaches the contract ("Deposit is not allowed with function call"). So even a key
granted all method names (empty `method_names`) cannot call them. Tests: `agent_key_cannot_withdraw`,
`agent_key_cannot_raise_its_own_limits`, `agent_key_cannot_unfreeze`, `agent_key_cannot_override_blocklist`,
`agent_key_cannot_approve_its_own_request`, `create_rein_without_deposit_fails`.

## Identifying the rein

`(predecessor_account_id, signer_account_pk)`. Calls where `signer_account_id != predecessor_account_id` are refused, so
another contract cannot relay a call that borrows the owner's identity. Revoking removes the key from the index, so a
revoked key is simply unknown even before the owner deletes it from the account.

## Money safety

- Budget, uses and vault are debited before the transfer; the private `on_paid` callback restores them if the transfer
  fails (`failed_transfer_restores_budget_and_vault`, and live tx `8qAQ3jUc…`).
- Sub-rein payments are checked and booked against every ancestor; a child cannot be created with a larger budget or cap.
- Storage added by any call (including agent calls) is charged to the owner's vault, never the contract's own balance.
- Agent-created state is bounded: 4 open approval requests per rein, 8 children, depth 3, 32 reins per owner,
  16 reports per account.

## Known gaps

- Blocklist reports are not adjudicated. A bonded report blocks the account for every owner who has not allowed it.
- Function-call key gas allowance can run out; the agent then stops (fails safe).
- The contract has no upgrade governance beyond the contract account's own keys.

## Chain Signatures payments

The agent never supplies bytes to sign. `pay_evm` takes only `to`, `value`, `nonce` and fee caps; the contract builds the
EIP-1559 transaction itself (fixed 21,000 gas, empty calldata, the rein's chain id), books `value + max_fee × 21000`
against the rein, and only then calls `sign` on the MPC contract with the keccak hash. Consequences:

- no calldata, so the derived address cannot be made to call a contract or approve a token;
- the chain id is the rein's, so a signature cannot be replayed on another chain;
- the fee is capped at 1000 gwei and counted in the budget, so fees cannot drain it;
- a nonce can be signed only once (`nonce_already_used`); a failed MPC call restores budget and nonce.

## Prompt-injection screening

`guardedPay` and the MCP `pay` tool accept the text that led to a payment and send it to the Reins API, which runs Llama
Prompt Guard 2. A score ≥ 0.5 refuses the payment before anything is signed. If the API is unreachable the screen is
reported as unavailable and does not decide the payment either way; the contract's limits still apply.
