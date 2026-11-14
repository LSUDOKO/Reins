import { expect, test } from "bun:test";
import { describe, termsFromDraft } from "../src/terms";
import { handle, type Env } from "../src/worker";

const NEAR = "000000000000000000000000";
const env: Env = { GROQ_API_KEY: "test", ALLOWED_ORIGINS: "https://reins.pages.dev", GROQ_MODEL: "m", GUARD_MODEL: "g" };

test("draft becomes contract terms", () => {
  const { label, terms } = termsFromDraft({ label: "research", budget_near: "1", period: "week", per_payment_near: "0.2", approval_above_near: "0.1", merchants: ["shop.testnet", "NOT AN ACCOUNT!"] }, 1000);
  expect(label).toBe("research");
  expect(terms.budget).toBe("1" + NEAR);
  expect(terms.period_secs).toBe("604800");
  expect(terms.per_tx_cap).toBe("2" + NEAR.slice(1));
  expect(terms.merchants).toEqual(["shop.testnet"]);
});

test("caps are clamped to what the contract accepts", () => {
  const { terms } = termsFromDraft({ budget_near: "1", per_payment_near: "5", approval_above_near: "9" });
  expect(terms.per_tx_cap).toBe(terms.budget);
  expect(terms.approval_above).toBeNull();
});

test("no budget is a clear error", () => {
  expect(() => termsFromDraft({ label: "x" })).toThrow(/budget/);
  expect(() => termsFromDraft({ budget_near: "-1" })).toThrow(/budget/);
});

test("describe is plain English", () => {
  const { terms } = termsFromDraft({ budget_near: "0.5", period: "day", per_payment_near: "0.2", approval_above_near: "0.1", max_uses: 10 });
  const s = describe(terms, "Research");
  expect(s).toContain("0.5 NEAR per day");
  expect(s).toContain("above 0.1 NEAR waits for you");
  expect(s).toContain("stops after 10 payments");
});

test("worker answers health and rejects unknown routes", async () => {
  const h = await handle(new Request("https://x/health"), env);
  expect((await h.json()).ok).toBe(true);
  const n = await handle(new Request("https://x/nope", { method: "POST", body: "{}" }), env);
  expect(n.status).toBe(404);
});

test("cors echoes only allowed origins", async () => {
  const ok = await handle(new Request("https://x/health", { headers: { origin: "https://reins.pages.dev" } }), env);
  expect(ok.headers.get("access-control-allow-origin")).toBe("https://reins.pages.dev");
  const bad = await handle(new Request("https://x/health", { headers: { origin: "https://evil.example" } }), env);
  expect(bad.headers.get("access-control-allow-origin")).toBe("https://reins.pages.dev");
});
