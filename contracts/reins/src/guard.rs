//! The spend rules. `check` is the single source of truth: `pay`, `approve_request` and the
//! `preview_pay` view all call it, so a preview can never disagree with the real payment.
use crate::errors::*;
use crate::*;

impl Reins {
    /// A receiver is blocked for an owner when it has at least one bonded report and the
    /// owner has not explicitly allowed it.
    pub(crate) fn blocked_for(&self, owner: &AccountId, receiver: &AccountId) -> bool {
        let reported = self.reports.get(receiver).is_some_and(|r| !r.is_empty());
        reported && !self.allow_overrides.get(&pair_of(owner, receiver)).copied().unwrap_or(false)
    }

    /// Validate a payment of `amount` from rein `id` to `receiver` at time `at`.
    /// `approved` skips the approval threshold (the owner already approved).
    /// Returns the smallest remaining budget along the chain.
    pub(crate) fn check(
        &self,
        id: ReinId,
        receiver: &AccountId,
        amount: u128,
        approved: bool,
        at: u64,
    ) -> Result<u128, &'static str> {
        if amount == 0 {
            return Err(ZERO_AMOUNT);
        }
        let leaf = self.rein(id);
        let owner = leaf.owner.clone();
        if receiver == &owner || receiver == &env::current_account_id() {
            return Err(SELF_PAYMENT);
        }
        let mut min_remaining = u128::MAX;
        for rid in self.chain(id) {
            let r = self.rein(rid);
            if r.status != Status::Active {
                return Err(NOT_ACTIVE);
            }
            if let Some(exp) = r.terms.expires_at {
                if at >= exp.0.saturating_mul(1_000_000_000) {
                    return Err(EXPIRED);
                }
            }
            if let Some(max) = r.terms.max_uses {
                if r.uses >= max {
                    return Err(USES_EXHAUSTED);
                }
            }
            if let Some(list) = &r.terms.merchants {
                if !list.contains(receiver) {
                    return Err(MERCHANT_NOT_ALLOWED);
                }
            }
            if amount > r.terms.per_tx_cap.0 {
                return Err(OVER_TX_CAP);
            }
            let rem = remaining(r, at);
            if amount > rem {
                return Err(OVER_BUDGET);
            }
            min_remaining = min_remaining.min(rem);
        }
        if self.blocked_for(&owner, receiver) {
            return Err(RECEIVER_BLOCKED);
        }
        // Cross-chain reins spend from their derived address on the other chain, not the vault.
        if leaf.terms.evm_chain_id.is_none() && self.vault_in(&owner, &leaf.terms.token) < amount {
            return Err(VAULT_EMPTY);
        }
        if !approved {
            if let Some(t) = leaf.terms.approval_above {
                if amount > t.0 {
                    return Err(NEEDS_APPROVAL);
                }
            }
        }
        Ok(min_remaining)
    }

    /// Book a checked payment on every rein in the chain and take it out of the vault.
    pub(crate) fn book(&mut self, id: ReinId, amount: u128, at: u64) -> Vec<ReinId> {
        let chain = self.chain(id);
        let mut owner = None;
        for rid in &chain {
            let r = self.reins.get_mut(rid).unwrap();
            if window_elapsed(r, at) {
                r.spent = u128s(0);
                r.window_start = u64s(at);
            }
            r.spent = u128s(r.spent.0 + amount);
            r.total_spent = u128s(r.total_spent.0 + amount);
            r.uses += 1;
            owner = Some(r.owner.clone());
        }
        let owner = owner.unwrap();
        let terms = self.rein(id).terms.clone();
        if terms.evm_chain_id.is_none() {
            let v = self.vault_in(&owner, &terms.token);
            self.set_vault_in(&owner, &terms.token, v - amount);
        }
        chain
    }

    /// Undo `book` after the transfer failed.
    pub(crate) fn unbook(&mut self, chain: &[ReinId], owner: &AccountId, amount: u128) {
        for rid in chain {
            if let Some(r) = self.reins.get_mut(rid) {
                r.spent = u128s(r.spent.0.saturating_sub(amount));
                r.total_spent = u128s(r.total_spent.0.saturating_sub(amount));
                r.uses = r.uses.saturating_sub(1);
            }
        }
        let terms = self.rein(chain[0]).terms.clone();
        if terms.evm_chain_id.is_none() {
            let v = self.vault_in(owner, &terms.token);
            self.set_vault_in(owner, &terms.token, v + amount);
        }
    }
}
