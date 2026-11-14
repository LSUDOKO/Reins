# Contributing to Reins

Thanks for helping. Reins moves money for AI agents, so changes are held to a simple standard:
**every behaviour change comes with a test, and every claim in the docs comes with a way to verify it.**

## Setup

Requirements: Rust (version pinned in `rust-toolchain.toml`, with the `wasm32-unknown-unknown` target),
[cargo-near](https://github.com/near/cargo-near), [bun](https://bun.sh) ≥ 1.3, and
[near-cli-rs](https://github.com/near/near-cli-rs) for deployments.

```bash
git clone https://github.com/LSUDOKO/Reins && cd Reins
bun install --linker hoisted
```

## Commands

| Purpose | Command | Expected |
| --- | --- | --- |
| Contract tests (offline) | `cargo test -p reins` | all pass |
| JS tests (offline) | `bun test packages/sdk packages/mcp packages/api` | all pass |
| Typecheck | `bun run typecheck` | no output |
| Format Rust | `cargo fmt --all` | no diff |
| Build wasm | `cd contracts/reins && cargo near build non-reproducible-wasm` | `target/near/reins/reins.wasm` |
| Build console | `bun run --cwd packages/dashboard build` | `packages/dashboard/out` |
| Verify the deployment (network, no keys) | `bun run verify` | every row `PASS` |
| Your own testnet deployment | `PREFIX=<name> ./scripts/deploy.sh`, then `PREFIX=<name> bun run demo` | logs in `demo/logs/` |

## Conventions

- **Error codes** live in `contracts/reins/src/errors.rs`. `preview_pay` must return exactly the code
  `pay` panics with. Add a test whenever you add a rule to `guard.rs`.
- **Owner methods** must require at least 1 yoctoNEAR attached (`full_access_owner`). That is what
  keeps function-call agent keys out of them.
- **Agent-callable methods** must not grow state without bound; charge any added storage to the
  owner's vault.
- **Keys and secrets** come from environment variables or `~/.near-credentials`, never from the
  repository. The Groq key exists only as a Cloudflare Worker secret.
- **Testnet only.** Do not point scripts at mainnet.
- **Docs:** if you change a behaviour that a document describes (README, JUDGES, SECURITY,
  INTEGRATIONS), update that document in the same pull request.

## Commits and pull requests

- Small commits with imperative subjects that say what changed, e.g. `Guard: check and book against the rein's own currency`.
- One logical change per pull request. Fill in the PR template checklist.
- CI must pass: contract tests, typecheck and JS tests.

## Reporting security issues

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).
