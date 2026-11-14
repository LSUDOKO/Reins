# tests/

| Path | What |
| --- | --- |
| [`e2e/console.e2e.mjs`](e2e/console.e2e.mjs) | browser end-to-end test of the live console |
| [`results/`](results) | committed output of every suite: contract, JS, clippy, verify, e2e |

Unit tests live next to the code they test:

- contract: `contracts/reins/src/tests.rs` (75), RLP vectors in `contracts/reins/src/evm.rs`
- SDK: `packages/sdk/test/`; MCP: `packages/mcp/test/`; API: `packages/api/test/`; console logic: `packages/dashboard/lib/*.test.ts`

See [TESTING.md](../TESTING.md) for methodology and results.
