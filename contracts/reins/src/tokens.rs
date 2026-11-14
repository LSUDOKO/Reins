//! NEP-141 budgets. Owners deposit a token with `ft_transfer_call(receiver_id = reins, msg = "")`;
//! a rein whose `terms.token` is set pays in that token with `ft_transfer`.
use crate::events::emit;
use crate::*;
use near_sdk::serde_json::json;
use near_sdk::{require, Gas, Promise, PromiseOrValue};

pub const FT_TRANSFER_GAS: Gas = Gas::from_tgas(15);

/// `ft_transfer` with the required 1 yoctoNEAR, paid by the contract.
pub(crate) fn ft_transfer(
    token: AccountId,
    receiver: AccountId,
    amount: u128,
    memo: Option<String>,
) -> Promise {
    Promise::new(token).function_call(
        "ft_transfer".to_string(),
        json!({ "receiver_id": receiver, "amount": U128(amount), "memo": memo })
            .to_string()
            .into_bytes(),
        NearToken::from_yoctonear(1),
        FT_TRANSFER_GAS,
    )
}

#[near]
impl Reins {
    /// Opt in to holding `token` in your vault. Attach storage (0.01 NEAR is plenty; the
    /// rest goes to your NEAR vault). Deposits of tokens you have not registered are refunded,
    /// so nobody can make the contract pay storage for arbitrary (sender, token) pairs.
    #[payable]
    pub fn register_token(&mut self, token: AccountId) {
        let before = self.usage();
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            deposit >= 1,
            "full_access_key_required: attach at least 1 yoctoNEAR"
        );
        let owner = env::predecessor_account_id();
        let v = self.vault(&owner);
        self.set_vault(&owner, v + deposit);
        let k = token_key(&owner, &token);
        if !self.token_vaults.contains_key(&k) {
            self.token_vaults.insert(k, 0);
        }
        self.charge_storage(&owner, before);
        emit(
            "token_registered",
            json!({ "owner": owner, "token": token }),
        );
    }

    /// NEP-141 receiver: credits the sender's token vault if they registered this token,
    /// otherwise refunds the whole amount. Writes no new state.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        require!(msg.is_empty(), "msg_must_be_empty");
        require!(amount.0 > 0, "zero_amount");
        let k = token_key(&sender_id, &token);
        let Some(v) = self.token_vaults.get(&k).copied() else {
            return PromiseOrValue::Value(amount);
        };
        self.token_vaults.insert(k, v + amount.0);
        emit(
            "token_deposit",
            json!({ "owner": sender_id, "token": token, "amount": amount, "vault": U128(v + amount.0) }),
        );
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
        emit(
            "token_withdraw",
            json!({ "owner": owner, "token": token, "amount": amount }),
        );
        ft_transfer(token.clone(), owner.clone(), amount.0, None).then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(5))
                .on_token_withdrawn(owner, token, amount),
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
