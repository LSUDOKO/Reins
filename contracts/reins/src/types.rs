use near_sdk::json_types::{U128, U64};
use near_sdk::{near, AccountId, PublicKey};

pub type ReinId = u64;
pub type RequestId = u64;

/// Lifecycle of a rein. Only `Active` reins can spend.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Active,
    Frozen,
    Revoked,
}

/// The terms an owner sets for one agent key. Amounts are yoctoNEAR.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Terms {
    /// Maximum spend per period (or for the whole life of the rein when `period_secs` is 0).
    pub budget: U128,
    /// Length of the budget window in seconds; 0 means the budget never resets.
    pub period_secs: U64,
    /// Largest single payment the agent may make on its own.
    pub per_tx_cap: U128,
    /// Payments above this need the owner's approval; `None` disables approvals (above-cap payments simply fail).
    pub approval_above: Option<U128>,
    /// Unix time in seconds after which the rein stops working.
    pub expires_at: Option<U64>,
    /// Maximum number of payments over the life of the rein.
    pub max_uses: Option<u32>,
    /// If set, the agent may only pay these accounts.
    pub merchants: Option<Vec<AccountId>>,
}

/// One rein: a set of terms bound to one public key on the owner's account.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Rein {
    pub id: ReinId,
    pub owner: AccountId,
    pub agent_key: PublicKey,
    pub label: String,
    pub parent: Option<ReinId>,
    pub children: Vec<ReinId>,
    pub terms: Terms,
    pub status: Status,
    /// Spent in the current window.
    pub spent: U128,
    /// Start of the current window, nanoseconds.
    pub window_start: U64,
    pub uses: u32,
    pub total_spent: U128,
    pub created_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RequestState {
    Pending,
    Approved,
    Rejected,
}

/// A payment the agent asked the owner to approve because it was above the rein's threshold.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct PayRequest {
    pub id: RequestId,
    pub rein_id: ReinId,
    pub owner: AccountId,
    pub receiver: AccountId,
    pub amount: U128,
    pub memo: Option<String>,
    pub state: RequestState,
    pub created_at: U64,
    pub expires_at: U64,
}

/// One bonded report against an account, kept in the shared blocklist.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Report {
    pub reporter: AccountId,
    /// sha256 (hex) of the evidence document.
    pub evidence_hash: String,
    /// Where the evidence lives (https or ipfs URI).
    pub evidence_uri: String,
    pub bond: U128,
    pub created_at: U64,
}

/// Answer of `preview_pay`: what `pay` would do right now, without doing it.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Preview {
    pub ok: bool,
    /// Machine-readable reason when `ok` is false (same codes `pay` panics with).
    pub code: Option<String>,
    pub needs_approval: bool,
    pub rein_id: Option<ReinId>,
    /// Smallest remaining budget along the rein's ancestry, yoctoNEAR.
    pub remaining: U128,
    pub vault: U128,
}
