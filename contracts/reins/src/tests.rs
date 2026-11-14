//! Unit tests. Run with `cargo test -p reins`; no network, no sandbox.
use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, CurveType, PromiseResult, RuntimeFeesConfig};
use near_sdk::test_vm_config;

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const SEC: u64 = 1_000_000_000;
const T0: u64 = 1_800_000_000 * SEC;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn pk(n: u8) -> PublicKey {
    PublicKey::from_parts(CurveType::ED25519, vec![n; 32]).unwrap()
}
fn contract_id() -> AccountId {
    acc("reins.testnet")
}
fn owner() -> AccountId {
    acc("alice.testnet")
}
fn shop() -> AccountId {
    acc("shop.testnet")
}
fn scam() -> AccountId {
    acc("drain.testnet")
}

/// Owner signing with a full-access key, attaching `deposit` yocto.
fn as_owner(deposit: u128, at: u64) {
    let mut c = VMContextBuilder::new();
    c.current_account_id(contract_id())
        .predecessor_account_id(owner())
        .signer_account_id(owner())
        .signer_account_pk(pk(200))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(at)
        .account_balance(NearToken::from_near(100));
    testing_env!(c.build());
}

/// Owner account signing with agent key `k`. Function-call keys attach no deposit.
fn as_agent(k: u8, at: u64) {
    let mut c = VMContextBuilder::new();
    c.current_account_id(contract_id())
        .predecessor_account_id(owner())
        .signer_account_id(owner())
        .signer_account_pk(pk(k))
        .attached_deposit(NearToken::from_yoctonear(0))
        .block_timestamp(at)
        .account_balance(NearToken::from_near(100));
    testing_env!(c.build());
}

fn as_other(who: AccountId, deposit: u128, at: u64) {
    let mut c = VMContextBuilder::new();
    c.current_account_id(contract_id())
        .predecessor_account_id(who.clone())
        .signer_account_id(who)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(at)
        .account_balance(NearToken::from_near(100));
    testing_env!(c.build());
}

fn callback(result: PromiseResult, at: u64) {
    let mut c = VMContextBuilder::new();
    c.current_account_id(contract_id())
        .predecessor_account_id(contract_id())
        .signer_account_id(owner())
        .block_timestamp(at)
        .account_balance(NearToken::from_near(100));
    testing_env!(c.build(), test_vm_config(), RuntimeFeesConfig::test(), Default::default(), vec![result]);
}

fn terms(budget: u128, cap: u128) -> Terms {
    Terms {
        budget: U128(budget),
        period_secs: U64(86_400),
        per_tx_cap: U128(cap),
        approval_above: None,
        expires_at: None,
        max_uses: None,
        merchants: None,
    }
}

/// Fresh contract, 10 NEAR in the vault, rein 1 bound to key 1: 1 NEAR/day, 0.5 per tx.
fn setup() -> Reins {
    as_owner(0, T0);
    let mut c = Reins::new();
    as_owner(10 * NEAR, T0);
    c.deposit();
    as_owner(NEAR / 10, T0);
    let id = c.create_rein(pk(1), "research agent".into(), terms(NEAR, NEAR / 2));
    assert_eq!(id, 1);
    c
}

fn pay(c: &mut Reins, k: u8, to: AccountId, amount: u128, at: u64) {
    as_agent(k, at);
    let _ = c.pay(to, U128(amount), None);
}

fn spent(c: &Reins, id: ReinId) -> u128 {
    c.get_rein(id).unwrap().spent.0
}

fn preview_code(c: &Reins, k: u8, to: AccountId, amount: u128) -> Option<String> {
    c.preview_pay(owner(), pk(k), to, U128(amount)).code
}

// ---- access control -------------------------------------------------------------------

#[test]
fn agent_pays_within_limits_and_vault_is_debited() {
    let mut c = setup();
    let vault_before = c.vault_of(owner()).0;
    pay(&mut c, 1, shop(), NEAR / 4, T0 + SEC);
    assert_eq!(spent(&c, 1), NEAR / 4);
    assert_eq!(c.get_rein(1).unwrap().uses, 1);
    assert_eq!(c.vault_of(owner()).0, vault_before - NEAR / 4);
}

#[test]
#[should_panic(expected = "unknown_key")]
fn unknown_key_cannot_pay() {
    let mut c = setup();
    pay(&mut c, 9, shop(), 1, T0);
}

#[test]
#[should_panic(expected = "signer_must_be_owner")]
fn call_relayed_through_another_contract_is_rejected() {
    let mut c = setup();
    let mut ctx = VMContextBuilder::new();
    ctx.current_account_id(contract_id())
        .predecessor_account_id(acc("middleman.testnet"))
        .signer_account_id(owner())
        .signer_account_pk(pk(1))
        .block_timestamp(T0);
    testing_env!(ctx.build());
    let _ = c.pay(shop(), U128(1), None);
}

#[test]
#[should_panic(expected = "full_access_key_required")]
fn agent_key_cannot_withdraw() {
    let mut c = setup();
    as_agent(1, T0);
    let _ = c.withdraw(U128(NEAR));
}

#[test]
#[should_panic(expected = "full_access_key_required")]
fn agent_key_cannot_raise_its_own_limits() {
    let mut c = setup();
    as_agent(1, T0);
    c.update_terms(1, terms(100 * NEAR, 50 * NEAR));
}

#[test]
#[should_panic(expected = "full_access_key_required")]
fn agent_key_cannot_unfreeze() {
    let mut c = setup();
    as_owner(1, T0);
    c.freeze(1);
    as_agent(1, T0);
    c.unfreeze(1);
}

#[test]
#[should_panic(expected = "full_access_key_required")]
fn agent_key_cannot_override_blocklist() {
    let mut c = setup();
    as_agent(1, T0);
    c.set_allow(scam(), true);
}

#[test]
#[should_panic(expected = "full_access_key_required")]
fn agent_key_cannot_approve_its_own_request() {
    let mut c = with_approvals();
    as_agent(1, T0);
    let id = c.request_approval(shop(), U128(NEAR / 3), None);
    let _ = c.approve_request(id);
}

#[test]
#[should_panic(expected = "full_access_key_required")]
fn create_rein_without_deposit_fails() {
    let mut c = setup();
    as_agent(1, T0);
    c.create_rein(pk(2), "x".into(), terms(NEAR, NEAR));
}

#[test]
#[should_panic(expected = "not_owner")]
fn stranger_cannot_freeze_someone_elses_rein() {
    let mut c = setup();
    as_other(acc("mallory.testnet"), 1, T0);
    c.freeze(1);
}

// ---- spend rules ----------------------------------------------------------------------

#[test]
#[should_panic(expected = "over_per_tx_cap")]
fn per_tx_cap_is_enforced() {
    let mut c = setup();
    pay(&mut c, 1, shop(), NEAR / 2 + 1, T0);
}

#[test]
#[should_panic(expected = "over_budget")]
fn budget_is_enforced_across_payments() {
    let mut c = setup();
    pay(&mut c, 1, shop(), NEAR / 2, T0);
    pay(&mut c, 1, shop(), NEAR / 2, T0 + SEC);
    pay(&mut c, 1, shop(), 1, T0 + 2 * SEC);
}

#[test]
fn budget_window_resets_after_the_period() {
    let mut c = setup();
    pay(&mut c, 1, shop(), NEAR / 2, T0);
    pay(&mut c, 1, shop(), NEAR / 2, T0 + SEC);
    pay(&mut c, 1, shop(), NEAR / 2, T0 + 86_400 * SEC + 1);
    assert_eq!(spent(&c, 1), NEAR / 2);
    assert_eq!(c.get_rein(1).unwrap().total_spent.0, 3 * NEAR / 2);
}

#[test]
#[should_panic(expected = "merchant_not_allowed")]
fn merchant_allowlist_is_enforced() {
    let mut c = setup();
    let mut t = terms(NEAR, NEAR / 2);
    t.merchants = Some(vec![shop()]);
    as_owner(1, T0);
    c.update_terms(1, t);
    pay(&mut c, 1, shop(), 1, T0);
    pay(&mut c, 1, acc("elsewhere.testnet"), 1, T0);
}

#[test]
#[should_panic(expected = "rein_expired")]
fn expiry_is_enforced() {
    let mut c = setup();
    let mut t = terms(NEAR, NEAR / 2);
    t.expires_at = Some(U64(T0 / SEC + 60));
    as_owner(1, T0);
    c.update_terms(1, t);
    pay(&mut c, 1, shop(), 1, T0 + 30 * SEC);
    pay(&mut c, 1, shop(), 1, T0 + 61 * SEC);
}

#[test]
#[should_panic(expected = "uses_exhausted")]
fn max_uses_is_enforced() {
    let mut c = setup();
    let mut t = terms(NEAR, NEAR / 2);
    t.max_uses = Some(2);
    as_owner(1, T0);
    c.update_terms(1, t);
    pay(&mut c, 1, shop(), 1, T0);
    pay(&mut c, 1, shop(), 1, T0);
    pay(&mut c, 1, shop(), 1, T0);
}

#[test]
#[should_panic(expected = "rein_not_active")]
fn frozen_rein_cannot_pay() {
    let mut c = setup();
    as_owner(1, T0);
    c.freeze(1);
    pay(&mut c, 1, shop(), 1, T0);
}

#[test]
fn unfreeze_restores_spending() {
    let mut c = setup();
    as_owner(1, T0);
    c.freeze(1);
    as_owner(1, T0);
    c.unfreeze(1);
    pay(&mut c, 1, shop(), 1, T0);
    assert_eq!(spent(&c, 1), 1);
}

#[test]
#[should_panic(expected = "unknown_key")]
fn revoked_key_becomes_unknown() {
    let mut c = setup();
    as_owner(1, T0);
    c.revoke(1);
    pay(&mut c, 1, shop(), 1, T0);
}

#[test]
#[should_panic(expected = "self_payment")]
fn cannot_pay_the_contract_itself() {
    let mut c = setup();
    pay(&mut c, 1, contract_id(), 1, T0);
}

#[test]
#[should_panic(expected = "vault_insufficient")]
fn vault_must_cover_the_payment() {
    let mut c = setup();
    as_owner(1, T0);
    let v = c.vault_of(owner()).0;
    let _ = c.withdraw(U128(v - NEAR / 10));
    pay(&mut c, 1, shop(), NEAR / 5, T0);
}

#[test]
#[should_panic(expected = "per_tx_cap_above_budget")]
fn terms_are_validated() {
    let mut c = setup();
    as_owner(NEAR / 10, T0);
    c.create_rein(pk(2), "bad".into(), terms(NEAR, 2 * NEAR));
}

#[test]
fn storage_is_charged_to_the_vault() {
    as_owner(0, T0);
    let mut c = Reins::new();
    as_owner(NEAR, T0);
    c.deposit();
    as_owner(1, T0);
    c.create_rein(pk(1), "a".into(), terms(NEAR, NEAR / 2));
    let v = c.vault_of(owner()).0;
    assert!(v < NEAR + 1, "storage was not charged: {v}");
    assert!(v > NEAR - NEAR / 100, "charged too much: {v}");
}

// ---- approvals ------------------------------------------------------------------------

fn with_approvals() -> Reins {
    let mut c = setup();
    let mut t = terms(NEAR, NEAR / 2);
    t.approval_above = Some(U128(NEAR / 4));
    as_owner(1, T0);
    c.update_terms(1, t);
    c
}

#[test]
#[should_panic(expected = "needs_approval")]
fn above_threshold_needs_approval() {
    let mut c = with_approvals();
    pay(&mut c, 1, shop(), NEAR / 3, T0);
}

#[test]
fn owner_approval_books_the_payment() {
    let mut c = with_approvals();
    as_agent(1, T0);
    let id = c.request_approval(shop(), U128(NEAR / 3), Some("dataset".into()));
    assert_eq!(c.pending_requests_of(owner()).len(), 1);
    as_owner(1, T0 + SEC);
    let _ = c.approve_request(id);
    assert_eq!(spent(&c, 1), NEAR / 3);
    assert_eq!(c.get_request(id).unwrap().state, RequestState::Approved);
    assert!(c.pending_requests_of(owner()).is_empty());
}

#[test]
fn rejected_request_moves_nothing() {
    let mut c = with_approvals();
    as_agent(1, T0);
    let id = c.request_approval(shop(), U128(NEAR / 3), None);
    as_owner(1, T0);
    c.reject_request(id);
    assert_eq!(spent(&c, 1), 0);
    assert_eq!(c.get_rein(1).unwrap().pending_requests, 0);
}

#[test]
#[should_panic(expected = "within_limits_use_pay")]
fn approval_is_only_for_above_threshold_payments() {
    let mut c = with_approvals();
    as_agent(1, T0);
    c.request_approval(shop(), U128(NEAR / 10), None);
}

#[test]
#[should_panic(expected = "too_many_pending_requests")]
fn pending_requests_are_capped() {
    let mut c = with_approvals();
    for _ in 0..=MAX_PENDING_PER_REIN {
        as_agent(1, T0);
        c.request_approval(shop(), U128(NEAR / 3), None);
    }
}

#[test]
fn expired_requests_free_their_slot() {
    let mut c = with_approvals();
    for _ in 0..MAX_PENDING_PER_REIN {
        as_agent(1, T0);
        c.request_approval(shop(), U128(NEAR / 3), None);
    }
    as_agent(1, T0 + REQUEST_TTL_NS + 1);
    c.request_approval(shop(), U128(NEAR / 3), None);
    assert_eq!(c.get_rein(1).unwrap().pending_requests, 1);
}

// ---- sub-reins ------------------------------------------------------------------------

#[test]
fn subrein_spending_counts_against_the_parent() {
    let mut c = setup();
    as_agent(1, T0);
    let child = c.issue_subrein(pk(2), "sub-agent".into(), terms(NEAR / 2, NEAR / 4));
    pay(&mut c, 2, shop(), NEAR / 4, T0);
    assert_eq!(spent(&c, child), NEAR / 4);
    assert_eq!(spent(&c, 1), NEAR / 4);
}

#[test]
#[should_panic(expected = "over_budget")]
fn parent_budget_caps_children() {
    let mut c = setup();
    as_agent(1, T0);
    c.issue_subrein(pk(2), "sub".into(), terms(NEAR / 2, NEAR / 2));
    pay(&mut c, 1, shop(), NEAR / 2, T0);
    pay(&mut c, 1, shop(), NEAR / 4, T0);
    pay(&mut c, 2, shop(), NEAR / 2, T0);
}

#[test]
#[should_panic(expected = "child_budget_above_parent")]
fn agent_cannot_mint_a_bigger_subrein() {
    let mut c = setup();
    as_agent(1, T0);
    c.issue_subrein(pk(2), "greedy".into(), terms(5 * NEAR, NEAR / 2));
}

#[test]
fn revoking_a_parent_revokes_the_subtree() {
    let mut c = setup();
    as_agent(1, T0);
    let child = c.issue_subrein(pk(2), "sub".into(), terms(NEAR / 2, NEAR / 4));
    as_owner(1, T0);
    c.revoke(1);
    assert_eq!(c.get_rein(child).unwrap().status, Status::Revoked);
    assert!(c.rein_for_key(owner(), pk(2)).is_none());
}

#[test]
#[should_panic(expected = "too_deep")]
fn depth_is_bounded() {
    let mut c = setup();
    as_agent(1, T0);
    c.issue_subrein(pk(2), "l2".into(), terms(NEAR / 2, NEAR / 4));
    as_agent(2, T0);
    c.issue_subrein(pk(3), "l3".into(), terms(NEAR / 4, NEAR / 8));
    as_agent(3, T0);
    c.issue_subrein(pk(4), "l4".into(), terms(NEAR / 8, NEAR / 16));
}

#[test]
fn revoke_all_is_a_panic_button() {
    let mut c = setup();
    as_owner(NEAR / 10, T0);
    c.create_rein(pk(2), "second".into(), terms(NEAR, NEAR / 2));
    as_owner(1, T0);
    assert_eq!(c.revoke_all(), 2);
    assert!(c.reins_of(owner()).iter().all(|r| r.status == Status::Revoked));
}

// ---- shared blocklist -----------------------------------------------------------------

const EVIDENCE: &str = "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358";

fn reported() -> Reins {
    let mut c = setup();
    as_other(acc("watcher.testnet"), NEAR / 5, T0);
    c.report(scam(), EVIDENCE.into(), "ipfs://bafy-evidence".into());
    c
}

#[test]
#[should_panic(expected = "receiver_blocked")]
fn reported_receiver_is_blocked() {
    let mut c = reported();
    pay(&mut c, 1, scam(), 1, T0);
}

#[test]
fn owner_can_allow_a_reported_receiver() {
    let mut c = reported();
    as_owner(1, T0);
    c.set_allow(scam(), true);
    pay(&mut c, 1, scam(), 1, T0);
    assert_eq!(spent(&c, 1), 1);
}

#[test]
fn bond_is_stored_net_of_storage() {
    let c = reported();
    let r = &c.reports_of(scam())[0];
    assert!(r.bond.0 >= REPORT_BOND.as_yoctonear());
    assert!(r.bond.0 < NEAR / 5);
}

#[test]
#[should_panic(expected = "bond_too_small")]
fn report_needs_a_bond() {
    let mut c = setup();
    as_other(acc("watcher.testnet"), NEAR / 100, T0);
    c.report(scam(), EVIDENCE.into(), "ipfs://x".into());
}

#[test]
#[should_panic(expected = "evidence_hash_must_be_sha256_hex")]
fn report_needs_evidence_hash() {
    let mut c = setup();
    as_other(acc("watcher.testnet"), NEAR / 5, T0);
    c.report(scam(), "nope".into(), "ipfs://x".into());
}

#[test]
fn retracting_the_last_report_unblocks() {
    let mut c = reported();
    as_other(acc("watcher.testnet"), 1, T0);
    let _ = c.retract_report(scam());
    assert!(!c.is_blocked(owner(), scam()));
}

// ---- settlement -----------------------------------------------------------------------

#[test]
fn failed_transfer_restores_budget_and_vault() {
    let mut c = setup();
    let vault = c.vault_of(owner()).0;
    pay(&mut c, 1, acc("ghost.testnet"), NEAR / 4, T0);
    callback(PromiseResult::Failed, T0);
    let ok = c.on_paid(vec![1], owner(), acc("ghost.testnet"), U128(NEAR / 4), None, None);
    assert!(matches!(ok, near_sdk::PromiseOrValue::Value(false)));
    assert_eq!(spent(&c, 1), 0);
    assert_eq!(c.get_rein(1).unwrap().uses, 0);
    assert_eq!(c.vault_of(owner()).0, vault);
}

#[test]
fn settled_transfer_counts_the_pair() {
    let mut c = setup();
    pay(&mut c, 1, shop(), NEAR / 4, T0);
    callback(PromiseResult::Successful(vec![]), T0);
    let _ = c.on_paid(vec![1], owner(), shop(), U128(NEAR / 4), None, None);
    assert_eq!(c.pair_count(owner(), shop()), 1);
    assert_eq!(c.stats().payments, 1);
}

// ---- preview --------------------------------------------------------------------------

#[test]
fn preview_agrees_with_pay() {
    let mut c = reported();
    assert_eq!(preview_code(&c, 1, shop(), NEAR / 4), None);
    assert_eq!(preview_code(&c, 1, shop(), NEAR), Some("over_per_tx_cap".into()));
    assert_eq!(preview_code(&c, 1, scam(), 1), Some("receiver_blocked".into()));
    assert_eq!(preview_code(&c, 9, shop(), 1), Some("unknown_key".into()));
    pay(&mut c, 1, shop(), NEAR / 2, T0);
    pay(&mut c, 1, shop(), NEAR / 2, T0);
    assert_eq!(preview_code(&c, 1, shop(), 1), Some("over_budget".into()));
}
