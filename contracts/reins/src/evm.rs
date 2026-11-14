//! Cross-chain payments through NEAR Chain Signatures.
//!
//! A rein with `terms.evm_chain_id` set controls an EVM address derived from this contract's
//! account and the path `reins-<rein id>`. The agent asks for a plain value transfer; the
//! contract builds the EIP-1559 transaction itself, checks it against the rein exactly like a
//! NEAR payment (budget, cap, merchants, blocklist, approval threshold), books the worst-case
//! cost, and only then asks the MPC network to sign its hash. The agent never chooses the
//! bytes that get signed, so it cannot smuggle in calldata, another chain or a bigger fee.
use crate::errors::*;
use crate::events::emit;
use crate::*;
use near_sdk::serde_json::{json, Value};
use near_sdk::{require, Gas, Promise, PromiseOrValue};

pub const MPC_SIGN_GAS: Gas = Gas::from_tgas(100);
pub const MPC_CALLBACK_GAS: Gas = Gas::from_tgas(15);
/// Only plain ETH transfers: no calldata, so exactly the intrinsic gas.
pub const TRANSFER_GAS: u64 = 21_000;
/// 1000 gwei ceiling so a fee cannot be used to drain the budget.
pub const MAX_FEE_PER_GAS: u128 = 1_000_000_000_000;

pub fn is_evm_address(s: &str) -> bool {
    s.len() == 42
        && s.starts_with("0x")
        && s[2..]
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

// ---- minimal RLP ----------------------------------------------------------------------

fn rlp_len(prefix_short: u8, prefix_long: u8, len: usize) -> Vec<u8> {
    if len <= 55 {
        vec![prefix_short + len as u8]
    } else {
        let be: Vec<u8> = (len as u64)
            .to_be_bytes()
            .into_iter()
            .skip_while(|b| *b == 0)
            .collect();
        let mut out = vec![prefix_long + be.len() as u8];
        out.extend(be);
        out
    }
}

pub fn rlp_bytes(b: &[u8]) -> Vec<u8> {
    if b.len() == 1 && b[0] < 0x80 {
        return b.to_vec();
    }
    let mut out = rlp_len(0x80, 0xb7, b.len());
    out.extend_from_slice(b);
    out
}

pub fn rlp_uint(v: u128) -> Vec<u8> {
    let be: Vec<u8> = v
        .to_be_bytes()
        .into_iter()
        .skip_while(|b| *b == 0)
        .collect();
    rlp_bytes(&be)
}

pub fn rlp_list(items: &[Vec<u8>]) -> Vec<u8> {
    let payload: Vec<u8> = items.concat();
    let mut out = rlp_len(0xc0, 0xf7, payload.len());
    out.extend(payload);
    out
}

/// Unsigned EIP-1559 transaction `0x02 || rlp([...])` for a plain value transfer.
pub fn eip1559_unsigned(
    chain_id: u64,
    nonce: u64,
    max_priority: u128,
    max_fee: u128,
    to: &str,
    value: u128,
) -> Vec<u8> {
    let mut out = vec![0x02];
    out.extend(rlp_list(&[
        rlp_uint(chain_id as u128),
        rlp_uint(nonce as u128),
        rlp_uint(max_priority),
        rlp_uint(max_fee),
        rlp_uint(TRANSFER_GAS as u128),
        rlp_bytes(&unhex(&to[2..])),
        rlp_uint(value),
        rlp_bytes(&[]),
        rlp_list(&[]),
    ]));
    out
}

pub fn derivation_path(rein: ReinId) -> String {
    format!("reins-{rein}")
}

#[near]
impl Reins {
    /// Agent method: pay `value` wei to `to` on the rein's EVM chain. Returns the MPC
    /// signature plus the exact transaction fields; anyone can then broadcast it.
    pub fn pay_evm(
        &mut self,
        to: String,
        value: U128,
        nonce: U64,
        max_fee_per_gas: U128,
        max_priority_fee_per_gas: U128,
    ) -> Promise {
        let id = self.caller_rein();
        let rein = self.rein(id).clone();
        let chain_id = rein
            .terms
            .evm_chain_id
            .unwrap_or_else(|| env::panic_str("not_an_evm_rein"));
        let to = to.to_lowercase();
        require!(is_evm_address(&to), "to_must_be_0x_address");
        require!(max_fee_per_gas.0 <= MAX_FEE_PER_GAS, "fee_too_high");
        require!(
            max_priority_fee_per_gas.0 <= max_fee_per_gas.0,
            "priority_fee_above_max_fee"
        );
        require!(nonce.0 >= rein.evm_nonce.0, "nonce_already_used");
        // The budget is charged for the value plus the most the fee could cost.
        let cost = value.0 + max_fee_per_gas.0 * TRANSFER_GAS as u128;
        let receiver: AccountId = to
            .parse()
            .unwrap_or_else(|_| env::panic_str("to_must_be_0x_address"));
        let at = now();
        if let Err(code) = self.check(id, &receiver, cost, false, at) {
            fail(code);
        }
        let chain = self.book(id, cost, at);
        self.reins.get_mut(&id).unwrap().evm_nonce = U64(nonce.0 + 1);

        let unsigned = eip1559_unsigned(
            chain_id.0,
            nonce.0,
            max_priority_fee_per_gas.0,
            max_fee_per_gas.0,
            &to,
            value.0,
        );
        let payload = env::keccak256(&unsigned);
        let path = derivation_path(id);
        let request = json!({ "request": { "payload_v2": { "Ecdsa": hex(&payload) }, "path": path, "domain_id": 0 } });
        Promise::new(self.mpc.clone())
            .function_call("sign".to_string(), request.to_string().into_bytes(), NearToken::from_yoctonear(1), MPC_SIGN_GAS)
            .then(Self::ext(env::current_account_id()).with_static_gas(MPC_CALLBACK_GAS).on_signed(
                chain,
                rein.owner,
                to,
                U128(cost),
                json!({
                    "chain_id": chain_id, "nonce": nonce, "to": receiver, "value": value,
                    "max_fee_per_gas": max_fee_per_gas, "max_priority_fee_per_gas": max_priority_fee_per_gas,
                    "gas_limit": TRANSFER_GAS, "unsigned_tx": hex(&unsigned), "payload": hex(&payload), "path": path,
                }),
            ))
    }

    /// Settles a Chain Signatures request: returns the signature, or restores the budget.
    #[private]
    pub fn on_signed(
        &mut self,
        chain: Vec<ReinId>,
        owner: AccountId,
        to: String,
        cost: U128,
        tx: Value,
    ) -> PromiseOrValue<Value> {
        let sig = env::promise_result_checked(0, 2048)
            .ok()
            .and_then(|b| near_sdk::serde_json::from_slice::<Value>(&b).ok());
        let leaf = chain[0];
        match sig {
            Some(signature) => {
                self.evm_signatures += 1;
                emit(
                    "evm_payment_signed",
                    json!({ "rein_id": leaf, "owner": owner, "to": to, "cost": cost,
                                                   "tx": tx, "signature": signature }),
                );
                PromiseOrValue::Value(json!({ "signature": signature, "tx": tx }))
            }
            None => {
                self.unbook(&chain, &owner, cost.0);
                if let Some(r) = self.reins.get_mut(&leaf) {
                    r.evm_nonce = U64(r.evm_nonce.0.saturating_sub(1));
                }
                emit(
                    "evm_payment_failed",
                    json!({ "rein_id": leaf, "owner": owner, "to": to, "cost": cost }),
                );
                PromiseOrValue::Value(Value::Null)
            }
        }
    }

    pub fn evm_path(&self, rein_id: ReinId) -> String {
        derivation_path(rein_id)
    }
}

#[cfg(test)]
mod rlp_tests {
    use super::*;

    #[test]
    fn rlp_matches_known_vectors() {
        assert_eq!(rlp_uint(0), vec![0x80]);
        assert_eq!(rlp_uint(15), vec![0x0f]);
        assert_eq!(rlp_uint(1024), vec![0x82, 0x04, 0x00]);
        assert_eq!(rlp_bytes(b"dog"), vec![0x83, b'd', b'o', b'g']);
        assert_eq!(
            rlp_list(&[rlp_bytes(b"cat"), rlp_bytes(b"dog")]),
            vec![0xc8, 0x83, b'c', b'a', b't', 0x83, b'd', b'o', b'g']
        );
        assert_eq!(rlp_list(&[]), vec![0xc0]);
        let long = vec![0xaa; 56];
        assert_eq!(&rlp_bytes(&long)[..2], &[0xb8, 56]);
    }

    #[test]
    fn eip1559_layout() {
        let tx = eip1559_unsigned(
            84532,
            0,
            1,
            2,
            "0x1111111111111111111111111111111111111111",
            3,
        );
        assert_eq!(tx[0], 0x02);
        // list header, chain id 84532 = 0x014a34 (3 bytes)
        assert_eq!(&tx[2..6], &[0x83, 0x01, 0x4a, 0x34]);
        assert!(is_evm_address("0x1111111111111111111111111111111111111111"));
        assert!(!is_evm_address("0xABC"));
    }
}
