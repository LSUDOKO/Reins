//! Read-only methods. `preview_pay` is the dry run an agent (or a judge) can call for free.
use crate::*;
#[near(serializers = [json])]
pub struct Stats {
    pub reins: u64,
    pub requests: u64,
    pub payments: u64,
    pub volume: U128,
    pub evm_signatures: u64,
}

#[near]
impl Reins {
    pub fn get_rein(&self, id: ReinId) -> Option<Rein> {
        self.reins.get(&id).cloned()
    }

    pub fn reins_of(&self, owner: AccountId) -> Vec<Rein> {
        self.owner_reins
            .get(&owner)
            .map(|ids| ids.iter().filter_map(|i| self.reins.get(i).cloned()).collect())
            .unwrap_or_default()
    }

    /// `account` is the account holding the key: the owner, or the rein's named sub-account.
    pub fn rein_for_key(&self, account: AccountId, public_key: PublicKey) -> Option<Rein> {
        self.key_index
            .get(&key_of(&account, &public_key))
            .and_then(|id| self.reins.get(id).cloned())
    }

    pub fn vault_of(&self, owner: AccountId) -> U128 {
        U128(self.vault(&owner))
    }

    pub fn token_vault_of(&self, owner: AccountId, token: AccountId) -> U128 {
        U128(self.vault_in(&owner, &Some(token)))
    }

    pub fn mpc_contract(&self) -> AccountId {
        self.mpc.clone()
    }

    pub fn get_request(&self, id: RequestId) -> Option<PayRequest> {
        self.requests.get(&id).cloned()
    }

    pub fn pending_requests_of(&self, owner: AccountId) -> Vec<PayRequest> {
        self.owner_requests
            .get(&owner)
            .map(|ids| {
                ids.iter()
                    .filter_map(|i| self.requests.get(i).cloned())
                    .filter(|r| r.state == RequestState::Pending)
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn reports_of(&self, account: AccountId) -> Vec<Report> {
        self.reports.get(&account).cloned().unwrap_or_default()
    }

    pub fn is_blocked(&self, owner: AccountId, receiver: AccountId) -> bool {
        self.blocked_for(&owner, &receiver)
    }

    /// Settled payments from `owner` to `receiver` through any rein.
    pub fn pair_count(&self, owner: AccountId, receiver: AccountId) -> u32 {
        self.pair_count.get(&pair_of(&owner, &receiver)).copied().unwrap_or(0)
    }

    /// What `pay` would do right now for this key, without doing it.
    /// `owner` is the account holding the key (the owner, or the rein's named sub-account).
    pub fn preview_pay(&self, owner: AccountId, public_key: PublicKey, receiver: AccountId, amount: U128) -> Preview {
        let Some(id) = self.key_index.get(&key_of(&owner, &public_key)).copied() else {
            let vault = U128(self.vault(&owner));
            return Preview { ok: false, code: Some(errors::UNKNOWN_KEY.into()), needs_approval: false,
                             rein_id: None, remaining: U128(0), vault };
        };
        let leaf = self.rein(id);
        let vault = U128(self.vault_in(&leaf.owner, &leaf.terms.token));
        let at = now();
        let remaining = U128(self.chain(id).iter().map(|r| crate::remaining(self.rein(*r), at)).min().unwrap_or(0));
        match self.check(id, &receiver, amount.0, false, at) {
            Ok(_) => Preview { ok: true, code: None, needs_approval: false, rein_id: Some(id), remaining, vault },
            Err(code) => Preview { ok: false, code: Some(code.into()), needs_approval: code == errors::NEEDS_APPROVAL,
                                   rein_id: Some(id), remaining, vault },
        }
    }

    pub fn stats(&self) -> Stats {
        Stats {
            reins: self.next_rein - 1,
            requests: self.next_request - 1,
            payments: self.payments,
            volume: U128(self.volume),
            evm_signatures: self.evm_signatures,
        }
    }

    pub fn version(&self) -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }
}
