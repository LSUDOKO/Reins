import { expect, test } from "bun:test";
import { draftFromText } from "./draft";

test("drafts budget, cap, approval, expiry and merchants from one line", () => {
  const d = draftFromText("1 NEAR a day, 0.2 per payment, ask me above 0.1, only shop.testnet and api.near, expires in 14 days");
  expect(d).toMatchObject({ amount: "1", period: 86400, perTx: "0.2", approval: "0.1", expiryDays: 14, merchants: "shop.testnet, api.near" });
});

test("a lifetime cap without a window", () => {
  const d = draftFromText("5 NEAR total, max 1");
  expect(d).toMatchObject({ amount: "", lifetime: "5", perTx: "1", expiryDays: 30 });
});
