# Shared shell helpers for Reins scripts. Keys stay in ~/.near-credentials, never in the repo.
set -euo pipefail
PREFIX="${PREFIX:-reins-demo}"
CONTRACT="${CONTRACT:-$PREFIX.testnet}"
OWNER="${OWNER:-$PREFIX-owner.testnet}"
MERCHANT="${MERCHANT:-$PREFIX-shop.testnet}"
SCAMMER="${SCAMMER:-$PREFIX-drain.testnet}"
RPC="${NEAR_RPC:-https://test.rpc.fastnear.com}"
NET=(network-config testnet)

# rpc_view_account <account>: prints the view_account result JSON (or an error object)
rpc_view_account() {
  curl -s "$RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}"
}
exists() { rpc_view_account "$1" | grep -q '"amount"'; }

# call <signer> <method> <json> [deposit]
call() {
  near contract call-function as-transaction "$CONTRACT" "$2" json-args "$3" \
    prepaid-gas '100.0 Tgas' attached-deposit "${4:-1 yoctoNEAR}" \
    sign-as "$1" "${NET[@]}" sign-with-legacy-keychain send
}
view() {
  near contract call-function as-read-only "$CONTRACT" "$1" json-args "$2" "${NET[@]}" now
}
