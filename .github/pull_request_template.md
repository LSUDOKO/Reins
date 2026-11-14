## What changed

<!-- One logical change. Link the issue if there is one. -->

## How it was verified

<!-- Tests added or run, testnet transaction hashes, screenshots. -->

## Checklist

- [ ] `cargo test -p reins` passes
- [ ] `bun test packages/sdk packages/mcp packages/api` passes
- [ ] `bun run typecheck` is clean
- [ ] New contract rules have a test, and `preview_pay` returns the same code as `pay`
- [ ] Owner-only methods still require ≥ 1 yoctoNEAR attached
- [ ] No keys or secrets committed
- [ ] Docs updated where behaviour changed
