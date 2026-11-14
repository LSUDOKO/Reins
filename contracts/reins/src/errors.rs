//! Error codes. `pay` panics with exactly one of these, and `preview_pay` returns the same
//! code without panicking, so an agent can branch on a stable string.
pub const UNKNOWN_KEY: &str = "unknown_key";
pub const NOT_ACTIVE: &str = "rein_not_active";
pub const EXPIRED: &str = "rein_expired";
pub const USES_EXHAUSTED: &str = "uses_exhausted";
pub const MERCHANT_NOT_ALLOWED: &str = "merchant_not_allowed";
pub const OVER_TX_CAP: &str = "over_per_tx_cap";
pub const NEEDS_APPROVAL: &str = "needs_approval";
pub const OVER_BUDGET: &str = "over_budget";
pub const VAULT_EMPTY: &str = "vault_insufficient";
pub const RECEIVER_BLOCKED: &str = "receiver_blocked";
pub const ZERO_AMOUNT: &str = "zero_amount";
pub const SELF_PAYMENT: &str = "self_payment";
pub const RELAYED: &str = "signer_must_be_owner";

pub fn fail(code: &str) -> ! {
    near_sdk::env::panic_str(code)
}
