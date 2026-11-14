//! Agent methods. These are the only methods an agent's function-call key should be granted.
//! The rein is found from `(predecessor, signer_account_pk)`; the agent never names it.
use crate::errors::*;
use crate::events::emit;
use crate::*;
use near_sdk::serde_json::json;
use near_sdk::{require, Promise, PromiseOrValue};

impl Reins {
    /// The rein bound to the key that signed this call. Rejects calls relayed through
    /// another contract, so the signing key is always the owner's own access key.
    pub(crate) fn caller_rein(&self) -> ReinId {
        let holder = env::predecessor_account_id();
        if env::signer_account_id() != holder {
            fail(RELAYED);
        }
        let k = key_of(&holder, &env::signer_account_pk());
        *self.key_index.get(&k).unwrap_or_else(|| fail(UNKNOWN_KEY))
    }

    pub(crate) fn close_request(&mut self, id: RequestId, state: RequestState) {
        let req = self.requests.get_mut(&id).unwrap();
        req.state = state;
        let rein_id = req.rein_id;
        if let Some(r) = self.reins.get_mut(&rein_id) {
            r.pending_requests = r.pending_requests.saturating_sub(1);
        }
    }

    /// Mark this rein's expired requests so they stop counting against the cap.
    fn expire_stale(&mut self, owner: &AccountId, rein_id: ReinId, at: u64) {
        let ids = self.owner_requests.get(owner).cloned().unwrap_or_default();
        for id in ids {
            let r = self.requests.get(&id).unwrap();
            if r.rein_id == rein_id && r.state == RequestState::Pending && at >= r.expires_at.0 {
                self.close_request(id, RequestState::Expired);
            }
        }
    }
}

#[near]
impl Reins {
    /// Pay `amount` yoctoNEAR from the owner's vault to `receiver`, within the rein's terms.
    /// Panics with one of the codes in `errors.rs` when a rule is broken; nothing moves.
    pub fn pay(&mut self, receiver: AccountId, amount: U128, memo: Option<String>) -> Promise {
        let id = self.caller_rein();
        if let Some(m) = &memo {
            require!(m.len() <= MAX_MEMO, "memo_too_long");
        }
        require!(self.rein(id).terms.evm_chain_id.is_none(), "evm_rein_use_pay_evm");
        let at = now();
        if let Err(code) = self.check(id, &receiver, amount.0, false, at) {
            fail(code);
        }
        let owner = self.rein(id).owner.clone();
        let chain = self.book(id, amount.0, at);
        self.send(chain, owner, receiver, amount.0, memo, None)
    }

    /// Ask the owner to approve a payment above the rein's approval threshold. The request is
    /// checked against every other rule now, so the owner is only asked about payments that
    /// could actually go through. Expires after 24 hours.
    pub fn request_approval(&mut self, receiver: AccountId, amount: U128, memo: Option<String>) -> RequestId {
        let id = self.caller_rein();
        if let Some(m) = &memo {
            require!(m.len() <= MAX_MEMO, "memo_too_long");
        }
        let at = now();
        match self.check(id, &receiver, amount.0, false, at) {
            Err(NEEDS_APPROVAL) => {}
            Ok(_) => env::panic_str("within_limits_use_pay"),
            Err(code) => fail(code),
        }
        let owner = self.rein(id).owner.clone();
        self.expire_stale(&owner, id, at);
        require!(self.rein(id).pending_requests < MAX_PENDING_PER_REIN, "too_many_pending_requests");

        let before = self.usage();
        let rid = self.next_request;
        self.next_request += 1;
        self.requests.insert(rid, PayRequest {
            id: rid,
            rein_id: id,
            owner: owner.clone(),
            receiver: receiver.clone(),
            amount,
            memo: memo.clone(),
            state: RequestState::Pending,
            created_at: u64s(at),
            expires_at: u64s(at + REQUEST_TTL_NS),
        });
        let requests = &self.requests;
        let list = self.owner_requests.entry(owner.clone()).or_default();
        list.retain(|q| requests.get(q).is_some_and(|r| r.state == RequestState::Pending));
        list.push(rid);
        self.reins.get_mut(&id).unwrap().pending_requests += 1;
        self.charge_storage(&owner, before);
        emit("approval_requested", json!({ "request_id": rid, "rein_id": id, "owner": owner,
                                           "receiver": receiver, "amount": amount, "memo": memo }));
        rid
    }

    /// Hand a sub-agent a narrower rein. The agent registers the sub-agent's public key, but
    /// that key only works once the owner adds it to their account: an agent can split its
    /// own allowance, never mint a new one. Sub-rein spending also counts against this rein.
    pub fn issue_subrein(&mut self, agent_key: PublicKey, label: String, terms: Terms) -> ReinId {
        let parent = self.caller_rein();
        let owner = self.rein(parent).owner.clone();
        let before = self.usage();
        // A sub-agent's key lives on the owner's account unless the owner moves it.
        let id = self.insert_rein(&owner, agent_key, label, terms, Some(parent), None);
        self.charge_storage(&owner, before);
        id
    }

    /// Settles a payment: on failure the budget, uses and vault are restored.
    #[private]
    pub fn on_paid(
        &mut self,
        chain: Vec<ReinId>,
        owner: AccountId,
        receiver: AccountId,
        amount: U128,
        memo: Option<String>,
        request: Option<RequestId>,
    ) -> PromiseOrValue<bool> {
        let ok = near_sdk::is_promise_success();
        let leaf = chain[0];
        if !ok {
            self.unbook(&chain, &owner, amount.0);
            emit("payment_failed", json!({ "rein_id": leaf, "owner": owner, "receiver": receiver,
                                           "amount": amount, "request_id": request }));
            return PromiseOrValue::Value(false);
        }
        let before = self.usage();
        let k = pair_of(&owner, &receiver);
        let n = self.pair_count.get(&k).copied().unwrap_or(0) + 1;
        self.pair_count.insert(k, n);
        // Storage for the counter comes out of the vault; never fail a settled payment over it.
        let used = u128::from(self.usage().saturating_sub(before));
        let cost = env::storage_byte_cost().as_yoctonear() * used;
        let v = self.vault(&owner);
        self.set_vault(&owner, v.saturating_sub(cost));
        self.payments += 1;
        // `volume` is NEAR only; token payments are visible in their events.
        if self.reins.get(&leaf).is_some_and(|r| r.terms.token.is_none()) {
            self.volume += amount.0;
        }
        emit("payment", json!({ "rein_id": leaf, "chain": chain, "owner": owner, "receiver": receiver,
                                "amount": amount, "memo": memo, "request_id": request, "pair_count": n }));
        PromiseOrValue::Value(true)
    }
}
