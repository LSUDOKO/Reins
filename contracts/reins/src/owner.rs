//! Owner methods. Each one needs at least one yoctoNEAR attached. A function-call access key
//! cannot attach a deposit, so only a full-access key of the owner can reach these, even if
//! an agent key was (wrongly) granted every method name.
use crate::events::emit;
use crate::*;
use near_sdk::serde_json::json;
use near_sdk::{require, Gas, Promise};

pub const CALLBACK_GAS: Gas = Gas::from_tgas(10);

/// Requires a full-access signature and credits whatever was attached to the owner's vault.
fn full_access_owner(this: &mut Reins) -> AccountId {
    let deposit = env::attached_deposit().as_yoctonear();
    require!(
        deposit >= 1,
        "full_access_key_required: attach at least 1 yoctoNEAR"
    );
    let owner = env::predecessor_account_id();
    let v = this.vault(&owner);
    this.set_vault(&owner, v + deposit);
    owner
}

impl Reins {
    fn owned(&self, id: ReinId, owner: &AccountId) -> &Rein {
        let r = self.rein(id);
        require!(&r.owner == owner, "not_owner");
        r
    }

    pub(crate) fn validate_terms(terms: &Terms) {
        require!(terms.budget.0 > 0, "budget_must_be_positive");
        require!(terms.per_tx_cap.0 > 0, "per_tx_cap_must_be_positive");
        require!(
            terms.per_tx_cap.0 <= terms.budget.0,
            "per_tx_cap_above_budget"
        );
        if let Some(t) = terms.approval_above {
            require!(
                t.0 < terms.per_tx_cap.0,
                "approval_above_must_be_below_per_tx_cap"
            );
        }
        if let Some(m) = &terms.merchants {
            require!(
                !m.is_empty() && m.len() <= MAX_MERCHANTS,
                "merchants_list_size"
            );
        }
        if let Some(exp) = terms.expires_at {
            require!(
                exp.0.saturating_mul(1_000_000_000) > now(),
                "expiry_in_the_past"
            );
        }
        if terms.evm_chain_id.is_some() {
            require!(terms.token.is_none(), "evm_rein_cannot_have_token");
            if let Some(m) = &terms.merchants {
                require!(
                    m.iter().all(|a| crate::evm::is_evm_address(a.as_str())),
                    "evm_merchants_must_be_0x_addresses"
                );
            }
        }
    }

    /// Shared by the owner's `create_rein` and the agent's `issue_subrein`.
    pub(crate) fn insert_rein(
        &mut self,
        owner: &AccountId,
        agent_key: PublicKey,
        label: String,
        terms: Terms,
        parent: Option<ReinId>,
        agent_account: Option<AccountId>,
    ) -> ReinId {
        require!(label.len() <= MAX_LABEL, "label_too_long");
        Self::validate_terms(&terms);
        let holder = agent_account.unwrap_or_else(|| owner.clone());
        require!(
            &holder == owner || holder.as_str().ends_with(&format!(".{owner}")),
            "agent_account_must_be_owner_or_its_sub_account"
        );
        let k = key_of(&holder, &agent_key);
        require!(!self.key_index.contains_key(&k), "key_already_bound");
        let live = self
            .owner_reins
            .get(owner)
            .map(|ids| {
                ids.iter()
                    .filter(|i| self.rein(**i).status != Status::Revoked)
                    .count()
            })
            .unwrap_or(0);
        require!(live < MAX_REINS_PER_OWNER, "too_many_reins");
        let total = self
            .owner_reins
            .get(owner)
            .map(|ids| ids.len())
            .unwrap_or(0);
        require!(total < MAX_REINS_TOTAL_PER_OWNER, "too_many_reins_ever");

        if let Some(pid) = parent {
            let p = self.owned(pid, owner).clone();
            require!(p.status == Status::Active, "parent_not_active");
            require!(self.chain(pid).len() < MAX_DEPTH, "too_deep");
            require!(p.children.len() < MAX_CHILDREN, "too_many_children");
            require!(
                terms.budget.0 <= p.terms.budget.0,
                "child_budget_above_parent"
            );
            require!(
                terms.per_tx_cap.0 <= p.terms.per_tx_cap.0,
                "child_cap_above_parent"
            );
            require!(
                terms.token == p.terms.token && terms.evm_chain_id == p.terms.evm_chain_id,
                "child_must_use_parent_currency"
            );
        }

        let id = self.next_rein;
        self.next_rein += 1;
        let rein = Rein {
            id,
            owner: owner.clone(),
            agent_account: holder.clone(),
            agent_key: agent_key.clone(),
            label: label.clone(),
            parent,
            children: vec![],
            terms: terms.clone(),
            status: Status::Active,
            spent: u128s(0),
            window_start: u64s(now()),
            uses: 0,
            total_spent: u128s(0),
            created_at: u64s(now()),
            pending_requests: 0,
            evm_nonce: U64(0),
        };
        self.reins.insert(id, rein);
        self.key_index.insert(k, id);
        self.owner_reins.entry(owner.clone()).or_default().push(id);
        if let Some(pid) = parent {
            self.reins.get_mut(&pid).unwrap().children.push(id);
        }
        emit(
            "rein_created",
            json!({ "rein_id": id, "owner": owner, "agent_account": holder, "agent_key": agent_key, "label": label,
                    "parent": parent, "terms": terms }),
        );
        id
    }

    pub(crate) fn set_status_tree(&mut self, id: ReinId, status: Status) -> Vec<ReinId> {
        let mut stack = vec![id];
        let mut touched = vec![];
        while let Some(rid) = stack.pop() {
            let r = self.reins.get_mut(&rid).unwrap();
            if r.status == Status::Revoked {
                continue;
            }
            // Freeze, unfreeze and revoke all apply to the whole subtree. A revoked key stays
            // in the index pointing at its revoked rein, so it can never be bound again.
            r.status = status;
            stack.extend(r.children.iter().copied());
            touched.push(rid);
        }
        touched
    }

    pub(crate) fn send(
        &mut self,
        booking: Booking,
        owner: AccountId,
        receiver: AccountId,
        amount: u128,
        memo: Option<String>,
        request: Option<RequestId>,
    ) -> Promise {
        // EVM reins never move funds held by this contract.
        require!(!booking.evm, "evm_rein_use_pay_evm");
        let transfer = match booking.token.clone() {
            None => Promise::new(receiver.clone()).transfer(NearToken::from_yoctonear(amount)),
            Some(t) => crate::tokens::ft_transfer(t, receiver.clone(), amount, memo.clone()),
        };
        transfer.then(
            Self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_paid(booking, owner, receiver, U128(amount), memo, request),
        )
    }
}

#[near]
impl Reins {
    /// Add NEAR to the caller's vault.
    #[payable]
    pub fn deposit(&mut self) -> U128 {
        let before = self.usage();
        let owner = full_access_owner(self);
        // A first deposit creates the vault entry; its storage comes out of the deposit.
        self.charge_storage(&owner, before);
        let v = self.vault(&owner);
        emit(
            "deposit",
            json!({ "owner": owner, "amount": U128(env::attached_deposit().as_yoctonear()), "vault": U128(v) }),
        );
        U128(v)
    }

    /// Take NEAR back out of the vault.
    #[payable]
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        let owner = full_access_owner(self);
        let v = self.vault(&owner);
        require!(amount.0 > 0 && amount.0 <= v, "vault_insufficient");
        self.set_vault(&owner, v - amount.0);
        emit(
            "withdraw",
            json!({ "owner": owner, "amount": amount, "vault": U128(v - amount.0) }),
        );
        Promise::new(owner).transfer(NearToken::from_yoctonear(amount.0))
    }

    /// Bind `agent_key` to a new root rein. Attach enough to cover storage (about 0.01 NEAR);
    /// the rest stays in the vault. Then add the key to your account as a function-call key
    /// for this contract with methods `pay`, `request_approval`, `issue_subrein`.
    #[payable]
    ///
    /// `agent_account`: optional named sub-account of yours (e.g. `research.you.testnet`) that
    /// will hold the agent key instead of your own account.
    pub fn create_rein(
        &mut self,
        agent_key: PublicKey,
        label: String,
        terms: Terms,
        agent_account: Option<AccountId>,
    ) -> ReinId {
        let owner = full_access_owner(self);
        let before = self.usage();
        let id = self.insert_rein(&owner, agent_key, label, terms, None, agent_account);
        self.charge_storage(&owner, before);
        id
    }

    /// Owner-created sub-rein for a sub-agent. Its spending also counts against every ancestor.
    #[payable]
    pub fn create_subrein(
        &mut self,
        parent: ReinId,
        agent_key: PublicKey,
        label: String,
        terms: Terms,
        agent_account: Option<AccountId>,
    ) -> ReinId {
        let owner = full_access_owner(self);
        let before = self.usage();
        let id = self.insert_rein(&owner, agent_key, label, terms, Some(parent), agent_account);
        self.charge_storage(&owner, before);
        id
    }

    /// Replace a rein's terms (tighten or loosen). Spent amounts are kept.
    #[payable]
    pub fn update_terms(&mut self, id: ReinId, terms: Terms) {
        let owner = full_access_owner(self);
        let parent = self.owned(id, &owner).parent;
        Self::validate_terms(&terms);
        if let Some(pid) = parent {
            let p = self.rein(pid);
            require!(
                terms.budget.0 <= p.terms.budget.0,
                "child_budget_above_parent"
            );
            require!(
                terms.per_tx_cap.0 <= p.terms.per_tx_cap.0,
                "child_cap_above_parent"
            );
        }
        let before = self.usage();
        let r = self.reins.get_mut(&id).unwrap();
        require!(r.status != Status::Revoked, "rein_revoked");
        // The currency of a rein is fixed: a payment in flight settles in the currency it was
        // booked in, and pending requests and EVM nonces assume it does not change.
        require!(
            terms.token == r.terms.token && terms.evm_chain_id == r.terms.evm_chain_id,
            "currency_immutable"
        );
        r.terms = terms.clone();
        self.charge_storage(&owner, before);
        emit("terms_updated", json!({ "rein_id": id, "terms": terms }));
    }

    /// Set the next EVM nonce a Chain Signatures rein may sign, e.g. after transactions were
    /// sent from its derived address outside Reins or a signature was never broadcast.
    #[payable]
    pub fn reset_evm_nonce(&mut self, id: ReinId, nonce: U64) {
        let owner = full_access_owner(self);
        require!(
            self.owned(id, &owner).terms.evm_chain_id.is_some(),
            "not_an_evm_rein"
        );
        self.reins.get_mut(&id).unwrap().evm_nonce = nonce;
        emit("evm_nonce_reset", json!({ "rein_id": id, "nonce": nonce }));
    }

    /// Freeze a rein and its sub-reins. Reversible with `unfreeze`.
    #[payable]
    pub fn freeze(&mut self, id: ReinId) {
        let owner = full_access_owner(self);
        self.owned(id, &owner);
        let touched = self.set_status_tree(id, Status::Frozen);
        emit("frozen", json!({ "rein_ids": touched }));
    }

    #[payable]
    pub fn unfreeze(&mut self, id: ReinId) {
        let owner = full_access_owner(self);
        self.owned(id, &owner);
        let touched = self.set_status_tree(id, Status::Active);
        emit("unfrozen", json!({ "rein_ids": touched }));
    }

    /// Permanently revoke a rein and its whole subtree. Also delete the key from your account
    /// (`near account delete-keys`) so it stops burning gas allowance.
    #[payable]
    pub fn revoke(&mut self, id: ReinId) {
        let owner = full_access_owner(self);
        self.owned(id, &owner);
        let touched = self.set_status_tree(id, Status::Revoked);
        emit("revoked", json!({ "rein_ids": touched }));
    }

    /// Panic button: revoke every rein the caller owns.
    #[payable]
    pub fn revoke_all(&mut self) -> u32 {
        let owner = full_access_owner(self);
        let ids = self.owner_reins.get(&owner).cloned().unwrap_or_default();
        let mut touched = vec![];
        for id in ids {
            touched.extend(self.set_status_tree(id, Status::Revoked));
        }
        emit("revoked", json!({ "rein_ids": touched, "panic": true }));
        touched.len() as u32
    }

    /// Allow (or stop allowing) a receiver that has blocklist reports, for your reins only.
    #[payable]
    pub fn set_allow(&mut self, receiver: AccountId, allowed: bool) {
        let owner = full_access_owner(self);
        let before = self.usage();
        let k = pair_of(&owner, &receiver);
        if allowed {
            self.allow_overrides.insert(k, true);
        } else {
            self.allow_overrides.remove(&k);
        }
        self.charge_storage(&owner, before);
        emit(
            "allow_set",
            json!({ "owner": owner, "receiver": receiver, "allowed": allowed }),
        );
    }

    /// Approve an agent's request. All rules except the approval threshold are checked again.
    #[payable]
    pub fn approve_request(&mut self, id: RequestId) -> Promise {
        let owner = full_access_owner(self);
        let req = self
            .requests
            .get(&id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("request_not_found"));
        require!(req.owner == owner, "not_owner");
        require!(req.state == RequestState::Pending, "request_not_pending");
        require!(
            self.rein(req.rein_id).terms.evm_chain_id.is_none(),
            "evm_rein_use_pay_evm"
        );
        let at = now();
        if at >= req.expires_at.0 {
            self.close_request(id, RequestState::Expired);
            env::panic_str("request_expired");
        }
        if let Err(code) = self.check(req.rein_id, &req.receiver, req.amount.0, true, at) {
            env::panic_str(code);
        }
        self.close_request(id, RequestState::Approved);
        let booking = self.book(req.rein_id, req.amount.0, at);
        emit(
            "approved",
            json!({ "request_id": id, "rein_id": req.rein_id }),
        );
        self.send(
            booking,
            owner,
            req.receiver,
            req.amount.0,
            req.memo,
            Some(id),
        )
    }

    #[payable]
    pub fn reject_request(&mut self, id: RequestId) {
        let owner = full_access_owner(self);
        let req = self
            .requests
            .get(&id)
            .unwrap_or_else(|| env::panic_str("request_not_found"));
        require!(req.owner == owner, "not_owner");
        require!(req.state == RequestState::Pending, "request_not_pending");
        self.close_request(id, RequestState::Rejected);
        emit("rejected", json!({ "request_id": id }));
    }

    /// File a bonded report against an account, with a hash of and a link to the evidence.
    /// Every owner's reins refuse to pay a reported account unless that owner allows it.
    #[payable]
    pub fn report(&mut self, account: AccountId, evidence_hash: String, evidence_uri: String) {
        let reporter = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            evidence_hash.len() == 64 && evidence_hash.chars().all(|c| c.is_ascii_hexdigit()),
            "evidence_hash_must_be_sha256_hex"
        );
        require!(
            !evidence_uri.is_empty() && evidence_uri.len() <= 256,
            "evidence_uri_size"
        );
        let before = self.usage();
        let list = self.reports.entry(account.clone()).or_default();
        require!(list.len() < MAX_REPORTS_PER_ACCOUNT, "too_many_reports");
        require!(
            !list.iter().any(|r| r.reporter == reporter),
            "already_reported"
        );
        list.push(Report {
            reporter: reporter.clone(),
            evidence_hash: evidence_hash.clone(),
            evidence_uri: evidence_uri.clone(),
            bond: U128(0),
            created_at: u64s(now()),
        });
        let used = u128::from(self.usage().saturating_sub(before));
        let storage = env::storage_byte_cost().as_yoctonear() * used;
        let bond = deposit.saturating_sub(storage);
        require!(
            bond >= REPORT_BOND.as_yoctonear(),
            "bond_too_small: attach 0.1 NEAR plus storage"
        );
        self.reports
            .get_mut(&account)
            .unwrap()
            .last_mut()
            .unwrap()
            .bond = U128(bond);
        emit(
            "reported",
            json!({ "account": account, "reporter": reporter,
                                 "evidence_hash": evidence_hash, "evidence_uri": evidence_uri, "bond": U128(bond) }),
        );
    }

    /// Withdraw your report and get the bond back.
    #[payable]
    pub fn retract_report(&mut self, account: AccountId) -> Promise {
        near_sdk::assert_one_yocto();
        let reporter = env::predecessor_account_id();
        let list = self
            .reports
            .get_mut(&account)
            .unwrap_or_else(|| env::panic_str("no_reports"));
        let pos = list
            .iter()
            .position(|r| r.reporter == reporter)
            .unwrap_or_else(|| env::panic_str("no_report_by_you"));
        let r = list.remove(pos);
        if list.is_empty() {
            self.reports.remove(&account);
        }
        emit(
            "report_retracted",
            json!({ "account": account, "reporter": reporter }),
        );
        Promise::new(reporter).transfer(NearToken::from_yoctonear(r.bond.0 + 1))
    }
}
