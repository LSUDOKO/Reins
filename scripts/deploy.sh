#!/usr/bin/env bash
# Creates faucet-funded testnet accounts, builds the contract and deploys it.
# Usage: PREFIX=yourname-reins ./scripts/deploy.sh   (re-runnable; existing accounts are kept)
source "$(dirname "$0")/env.sh"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for acc in "$CONTRACT" "$OWNER" "$MERCHANT" "$SCAMMER"; do
  exists "$acc" && { echo "exists: $acc"; continue; }
  near account create-account sponsor-by-faucet-service "$acc" \
    autogenerate-new-keypair save-to-legacy-keychain "${NET[@]}" create
done

(cd "$ROOT/contracts/reins" && cargo near build non-reproducible-wasm)

if view version '{}' >/dev/null 2>&1; then
  near contract deploy "$CONTRACT" use-file "$ROOT/target/near/reins/reins.wasm" \
    without-init-call "${NET[@]}" sign-with-legacy-keychain send
else
  near contract deploy "$CONTRACT" use-file "$ROOT/target/near/reins/reins.wasm" \
    with-init-call new json-args '{}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
    "${NET[@]}" sign-with-legacy-keychain send
fi
echo "Deployed reins to $CONTRACT"
