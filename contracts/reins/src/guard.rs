//! The spend rules. `check` is the single source of truth: `pay`, `approve_request` and the
//! `preview_pay` view all call it, so a preview can never disagree with the real payment.
use crate::errors::*;
use crate::*;

impl Reins {
    /// A receiver is blocked for an owner when it has at least one bonded report and the
    /// owner has not explicitly allowed it.
    pub(crate) fn blocked_for(&self, owner: &AccountId, receiver: &AccountId) -> bool {
        let reported = self.reports.get(receiver).is_some_and(|r| !r.is_empty());
        reported
            && !self
                .allow_overrides
                .get(&pair_of(owner, receiver))
                .copied()
                .unwrap_or(false)
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
        let mut needs_approval = false;
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
            // Every rein on the chain can require approval, not just the leaf.
            if !approved {
                if let Some(t) = r.terms.approval_above {
                    if amount > t.0 {
                        needs_approval = true;
                    }
                }
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
        if needs_approval {
            return Err(NEEDS_APPROVAL);
        }
        Ok(min_remaining)
    }

    /// Book a checked payment on every rein in the chain and take it out of the vault.
    pub(crate) fn book(&mut self, id: ReinId, amount: u128, at: u64) -> Booking {
        let chain = self.chain(id);
        let mut windows = Vec::with_capacity(chain.len());
        for rid in &chain {
            let r = self.reins.get_mut(rid).unwrap();
            if window_elapsed(r, at) {
                r.spent = u128s(0);
                r.window_start = u64s(at);
            }
            r.spent = u128s(r.spent.0 + amount);
            r.total_spent = u128s(r.total_spent.0 + amount);
            r.uses += 1;
            windows.push(r.window_start);
        }
        let leaf = self.rein(id);
        let owner = leaf.owner.clone();
        let booking = Booking {
            chain,
            windows,
            token: leaf.terms.token.clone(),
            evm: leaf.terms.evm_chain_id.is_some(),
        };
        if !booking.evm {
            let v = self.vault_in(&owner, &booking.token);
            self.set_vault_in(&owner, &booking.token, v - amount);
        }
        booking
    }

    /// Undo `book` after the transfer failed. Budget is given back only to a rein still in
    /// the window the payment was booked in (a refund must not top up a newer window); uses,
    /// lifetime totals and the vault in the booked currency are always restored.
    pub(crate) fn unbook(&mut self, b: &Booking, owner: &AccountId, amount: u128) {
        for (rid, ws) in b.chain.iter().zip(b.windows.iter()) {
            if let Some(r) = self.reins.get_mut(rid) {
                if r.window_start.0 == ws.0 {
                    r.spent = u128s(r.spent.0.saturating_sub(amount));
                }
                r.total_spent = u128s(r.total_spent.0.saturating_sub(amount));
                r.uses = r.uses.saturating_sub(1);
            }
        }
        if !b.evm {
            let v = self.vault_in(owner, &b.token);
            self.set_vault_in(owner, &b.token, v + amount);
        }
    }
}
