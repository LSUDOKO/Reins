//! NEP-141 budgets. Owners deposit a token with `ft_transfer_call(receiver_id = reins, msg = "")`;
//! a rein whose `terms.token` is set pays in that token with `ft_transfer`.
use crate::events::emit;
use crate::*;
use near_sdk::serde_json::json;
use near_sdk::{require, Gas, Promise, PromiseOrValue};

pub const FT_TRANSFER_GAS: Gas = Gas::from_tgas(15);

/// `ft_transfer` with the required 1 yoctoNEAR, paid by the contract.
pub(crate) fn ft_transfer(token: AccountId, receiver: AccountId, amount: u128, memo: Option<String>) -> Promise {
    Promise::new(token).function_call(
        "ft_transfer".to_string(),
        json!({ "receiver_id": receiver, "amount": U128(amount), "memo": memo }).to_string().into_bytes(),
        NearToken::from_yoctonear(1),
        FT_TRANSFER_GAS,
    )
}

#[near]
impl Reins {
    /// NEP-141 receiver: credits the sender's token vault. Returns 0 (nothing refunded).
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        require!(msg.is_empty(), "msg_must_be_empty");
        let t = Some(token.clone());
        let v = self.vault_in(&sender_id, &t);
        self.set_vault_in(&sender_id, &t, v + amount.0);
        emit("token_deposit", json!({ "owner": sender_id, "token": token, "amount": amount, "vault": U128(v + amount.0) }));
        PromiseOrValue::Value(U128(0))
    }

    /// Withdraw tokens from your token vault (full-access key: attach 1 yoctoNEAR).
    #[payable]
    pub fn withdraw_token(&mut self, token: AccountId, amount: U128) -> Promise {
        near_sdk::assert_one_yocto();
        let owner = env::predecessor_account_id();
        let t = Some(token.clone());
        let v = self.vault_in(&owner, &t);
        require!(amount.0 > 0 && amount.0 <= v, "vault_insufficient");
        self.set_vault_in(&owner, &t, v - amount.0);
        emit("token_withdraw", json!({ "owner": owner, "token": token, "amount": amount }));
        ft_transfer(token.clone(), owner.clone(), amount.0, None).then(
            Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(5)).on_token_withdrawn(owner, token, amount),
        )
    }

    /// Re-credits the vault when the token transfer failed (e.g. the owner is not registered).
    #[private]
    pub fn on_token_withdrawn(&mut self, owner: AccountId, token: AccountId, amount: U128) -> bool {
        let ok = near_sdk::is_promise_success();
        if !ok {
            let t = Some(token);
            let v = self.vault_in(&owner, &t);
            self.set_vault_in(&owner, &t, v + amount.0);
        }
        ok
    }
}
