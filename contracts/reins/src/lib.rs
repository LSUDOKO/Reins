//! Reins: spending limits for AI agents on NEAR.
//!
//! An owner keeps NEAR in a vault inside this contract and gives each agent a *rein*: a set
//! of terms bound to one public key. The owner adds that key to their own account as a
//! function-call access key that may call only this contract's agent methods. When the agent
//! signs with it, the call arrives with `predecessor = owner` and `signer_account_pk = agent
//! key`, and the contract looks up the rein by that pair.
//!
//! Function-call keys cannot attach a deposit. Every owner method therefore requires at
//! least one yoctoNEAR attached: an agent key can never withdraw, raise its own limits,
//! unfreeze, approve its own request or override the blocklist, whatever method names the
//! key was granted.
use near_sdk::json_types::{U128, U64};
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, NearToken, PanicOnDefault, PublicKey};

mod agent;
mod errors;
mod events;
mod evm;
mod guard;
mod owner;
mod tokens;
mod types;
mod views;

#[cfg(test)]
mod tests;

pub use types::*;

/// Deepest allowed chain: root rein plus two levels of sub-reins.
pub const MAX_DEPTH: usize = 3;
pub const MAX_CHILDREN: usize = 8;
pub const MAX_REINS_PER_OWNER: usize = 32;
/// Reins ever created per owner, revoked included, so per-owner loops stay bounded.
pub const MAX_REINS_TOTAL_PER_OWNER: usize = 128;
pub const MAX_PENDING_PER_REIN: u8 = 4;
pub const MAX_REPORTS_PER_ACCOUNT: usize = 16;
pub const MAX_LABEL: usize = 64;
pub const MAX_MEMO: usize = 128;
pub const MAX_MERCHANTS: usize = 16;
/// Approval requests expire after a day.
pub const REQUEST_TTL_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
/// Bond a reporter locks for each blocklist report.
pub const REPORT_BOND: NearToken = NearToken::from_millinear(100);

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Reins {
    reins: LookupMap<ReinId, Rein>,
    /// `owner|public_key` -> rein id. Removed on revoke, so a revoked key is simply unknown.
    key_index: LookupMap<String, ReinId>,
    owner_reins: LookupMap<AccountId, Vec<ReinId>>,
    /// Spendable yoctoNEAR held for each owner.
    vaults: LookupMap<AccountId, u128>,
    requests: LookupMap<RequestId, PayRequest>,
    owner_requests: LookupMap<AccountId, Vec<RequestId>>,
    /// Shared blocklist: bonded reports per account.
    reports: LookupMap<AccountId, Vec<Report>>,
    /// `owner|receiver` the owner has explicitly allowed despite reports.
    allow_overrides: LookupMap<String, bool>,
    /// `owner|receiver` -> settled payments, the "prior interactions" signal.
    pair_count: LookupMap<String, u32>,
    /// `owner|token` -> spendable token units (NEP-141 budgets).
    token_vaults: LookupMap<String, u128>,
    /// Chain Signatures MPC contract that signs cross-chain payments.
    mpc: AccountId,
    next_rein: ReinId,
    next_request: RequestId,
    payments: u64,
    volume: u128,
    evm_signatures: u64,
}

#[near]
impl Reins {
    /// `mpc` defaults to the testnet Chain Signatures signer `v1.signer-prod.testnet`.
    #[init]
    pub fn new(mpc: Option<AccountId>) -> Self {
        Self {
            reins: LookupMap::new(b"r"),
            key_index: LookupMap::new(b"k"),
            owner_reins: LookupMap::new(b"o"),
            vaults: LookupMap::new(b"v"),
            requests: LookupMap::new(b"q"),
            owner_requests: LookupMap::new(b"Q"),
            reports: LookupMap::new(b"b"),
            allow_overrides: LookupMap::new(b"a"),
            pair_count: LookupMap::new(b"p"),
            token_vaults: LookupMap::new(b"t"),
            mpc: mpc.unwrap_or_else(|| "v1.signer-prod.testnet".parse().unwrap()),
            next_rein: 1,
            next_request: 1,
            payments: 0,
            volume: 0,
            evm_signatures: 0,
        }
    }
}

// ---- shared helpers -------------------------------------------------------------------

/// Index key of an agent key: the account that holds the key plus the key itself.
pub(crate) fn key_of(holder: &AccountId, pk: &PublicKey) -> String {
    format!("{}|{}", holder, String::from(pk))
}

pub(crate) fn token_key(owner: &AccountId, token: &AccountId) -> String {
    format!("{owner}|{token}")
}

pub(crate) fn pair_of(owner: &AccountId, receiver: &AccountId) -> String {
    format!("{owner}|{receiver}")
}

pub(crate) fn now() -> u64 {
    env::block_timestamp()
}

/// Spent in the rein's current window, as of `at`. A window that has elapsed counts as 0.
pub(crate) fn window_spent(r: &Rein, at: u64) -> u128 {
    if window_elapsed(r, at) {
        0
    } else {
        r.spent.0
    }
}

pub(crate) fn window_elapsed(r: &Rein, at: u64) -> bool {
    let p = r.terms.period_secs.0;
    p > 0
        && at
            >= r.window_start
                .0
                .saturating_add(p.saturating_mul(1_000_000_000))
}

pub(crate) fn remaining(r: &Rein, at: u64) -> u128 {
    r.terms.budget.0.saturating_sub(window_spent(r, at))
}

pub(crate) fn u128s(v: u128) -> U128 {
    U128(v)
}

pub(crate) fn u64s(v: u64) -> U64 {
    U64(v)
}

impl Reins {
    pub(crate) fn rein(&self, id: ReinId) -> &Rein {
        self.reins
            .get(&id)
            .unwrap_or_else(|| env::panic_str("rein_not_found"))
    }

    /// The rein followed by its ancestors, leaf first.
    pub(crate) fn chain(&self, id: ReinId) -> Vec<ReinId> {
        let mut out = vec![id];
        let mut cur = self.rein(id).parent;
        while let Some(p) = cur {
            out.push(p);
            cur = self.rein(p).parent;
        }
        out
    }

    pub(crate) fn vault(&self, owner: &AccountId) -> u128 {
        self.vaults.get(owner).copied().unwrap_or(0)
    }

    pub(crate) fn set_vault(&mut self, owner: &AccountId, v: u128) {
        self.vaults.insert(owner.clone(), v);
    }

    /// Vault balance in the rein's denomination: NEAR, or a NEP-141 token.
    pub(crate) fn vault_in(&self, owner: &AccountId, token: &Option<AccountId>) -> u128 {
        match token {
            None => self.vault(owner),
            Some(t) => self
                .token_vaults
                .get(&token_key(owner, t))
                .copied()
                .unwrap_or(0),
        }
    }

    pub(crate) fn set_vault_in(&mut self, owner: &AccountId, token: &Option<AccountId>, v: u128) {
        match token {
            None => self.set_vault(owner, v),
            Some(t) => {
                self.token_vaults.insert(token_key(owner, t), v);
            }
        }
    }

    /// Write pending collection changes so `env::storage_usage` reflects them.
    pub(crate) fn flush(&mut self) {
        self.reins.flush();
        self.key_index.flush();
        self.owner_reins.flush();
        self.vaults.flush();
        self.requests.flush();
        self.owner_requests.flush();
        self.reports.flush();
        self.allow_overrides.flush();
        self.pair_count.flush();
        self.token_vaults.flush();
    }

    /// Storage in use, counting changes not yet written by the collections.
    pub(crate) fn usage(&mut self) -> u64 {
        self.flush();
        env::storage_usage()
    }

    /// Charge the storage a call added since `before` to the owner's vault.
    pub(crate) fn charge_storage(&mut self, owner: &AccountId, before: u64) {
        let after = self.usage();
        if after <= before {
            return;
        }
        let cost = env::storage_byte_cost().as_yoctonear() * u128::from(after - before);
        let v = self.vault(owner);
        if v < cost {
            env::panic_str("vault_insufficient_for_storage");
        }
        self.set_vault(owner, v - cost);
    }
}
