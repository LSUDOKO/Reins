# Architecture

```mermaid
sequenceDiagram
    participant A as Agent (MCP)
    participant S as Reins SDK guard
    participant C as reins contract
    participant R as Receiver
    A->>S: pay(receiver, amount)
    S->>S: counterparty signals: blocklist, existence, age, code change, history, look-alike
    alt verdict block
        S-->>A: refused, nothing signed
    else verdict warn
        S->>A: ask the human (MCP elicitation)
    end
    S->>C: preview_pay (view)
    alt above approval threshold
        S->>C: request_approval (function-call key)
        Note over C: owner approves with full-access key
    else within limits
        S->>C: pay (function-call key on owner account)
        C->>C: check rules on rein + ancestors, book spend
        C->>R: transfer
        C->>C: on_paid callback: settle or roll back
    end
```

State (all `near_sdk::store::LookupMap`): `reins`, `key_index (owner|pk → rein)`, `owner_reins`, `vaults`, `requests`,
`owner_requests`, `reports`, `allow_overrides`, `pair_count`. Payment history is not stored; every change emits a
NEP-297 event with standard `reins`.
