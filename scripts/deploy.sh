#!/usr/bin/env bash
# Creates faucet-funded testnet accounts, builds the contract and deploys it.
# Usage: PREFIX=yourname-reins ./scripts/deploy.sh   (re-runnable; existing accounts are kept)
source "$(dirname "$0")/env.sh"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for acc in "$CONTRACT" "$OWNER" "$MERCHANT" "$SCAMMER" "$TOKEN"; do
  exists "$acc" && { echo "exists: $acc"; continue; }
  near account create-account sponsor-by-faucet-service "$acc" \
    autogenerate-new-keypair save-to-legacy-keychain "${NET[@]}" create
done

(cd "$ROOT/contracts/reins" && cargo near build non-reproducible-wasm)
(cd "$ROOT/contracts/test-token" && cargo near build non-reproducible-wasm)

if view version '{}' >/dev/null 2>&1; then
  near contract deploy "$CONTRACT" use-file "$ROOT/target/near/reins/reins.wasm" \
    without-init-call "${NET[@]}" sign-with-legacy-keychain send
else
  near contract deploy "$CONTRACT" use-file "$ROOT/target/near/reins/reins.wasm" \
    with-init-call new json-args '{}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
    "${NET[@]}" sign-with-legacy-keychain send
fi
# tUSD test stablecoin: deploy once, register the contract and merchant, give the owner a balance.
tcall() { near contract call-function as-transaction "$TOKEN" "$2" json-args "$3" prepaid-gas '100.0 Tgas' \
  attached-deposit "${4:-0 NEAR}" sign-as "$1" "${NET[@]}" sign-with-legacy-keychain send; }
if ! near contract call-function as-read-only "$TOKEN" ft_metadata json-args '{}' "${NET[@]}" now >/dev/null 2>&1; then
  near contract deploy "$TOKEN" use-file "$ROOT/target/near/test_token/test_token.wasm" \
    with-init-call new json-args '{}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
    "${NET[@]}" sign-with-legacy-keychain send
fi
for acc in "$CONTRACT" "$MERCHANT"; do
  tcall "$OWNER" storage_deposit "{\"account_id\":\"$acc\"}" '0.00125 NEAR'
done
tcall "$OWNER" mint '{"amount":"500000000"}'
call "$OWNER" register_token "{\"token\":\"$TOKEN\"}" '0.01 NEAR'
tcall "$OWNER" ft_transfer_call "{\"receiver_id\":\"$CONTRACT\",\"amount\":\"200000000\",\"msg\":\"\"}" '1 yoctoNEAR'
echo "Deployed reins to $CONTRACT, tUSD to $TOKEN"
