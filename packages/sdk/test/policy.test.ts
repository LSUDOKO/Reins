import { expect, test } from "bun:test";
import { assess, editDistance, lookalikeOf, skeleton, type Signals } from "../src/policy";

const base: Signals = {
  receiver: "shop.testnet",
  exists: true,
  implicit: false,
  ageDays: 120,
  isContract: false,
  codeChangedRecently: null,
  priorPayments: 3,
  reportCount: 0,
  reportEvidence: [],
  blockedForOwner: false,
  allowlisted: false,
  known: [],
};

test("a known, old, unreported account is allowed", () => {
  expect(assess(base).verdict).toBe("allow");
});

test("a blocklisted account is blocked with its evidence", () => {
  const a = assess({ ...base, blockedForOwner: true, reportCount: 2, reportEvidence: ["ipfs://e"] });
  expect(a.verdict).toBe("block");
  expect(a.reasons.find((r) => r.signal === "blocklist")?.detail).toContain("ipfs://e");
});

test("a named account that does not exist is blocked", () => {
  expect(assess({ ...base, exists: false, ageDays: 0 }).verdict).toBe("block");
});

test("a young account warns", () => {
  expect(assess({ ...base, ageDays: 1 }).verdict).toBe("warn");
});

test("a first payment warns unless allowlisted", () => {
  expect(assess({ ...base, priorPayments: 0 }).verdict).toBe("warn");
  expect(assess({ ...base, priorPayments: 0, allowlisted: true }).verdict).toBe("allow");
});

test("a contract whose code changed this week warns", () => {
  expect(assess({ ...base, isContract: true, codeChangedRecently: true }).verdict).toBe("warn");
});

test("unavailable signals never count as risk", () => {
  const a = assess({ ...base, exists: null, ageDays: null, priorPayments: null, blockedForOwner: null, reportCount: null });
  expect(a.verdict).toBe("allow");
  expect(a.reasons.filter((r) => r.detail.includes("unavailable")).length).toBe(4);
});

test("look-alike of a known merchant is blocked", () => {
  const a = assess({ ...base, receiver: "sh0p.testnet", known: ["shop.testnet"] });
  expect(a.verdict).toBe("block");
  expect(a.reasons.find((r) => r.signal === "lookalike")?.detail).toContain("shop.testnet");
});

test("skeleton folds common homoglyph swaps", () => {
  expect(skeleton("rnarket-0ne.near")).toBe(skeleton("market-one.near"));
  expect(skeleton("pay_vvallet")).toBe("paywallet");
});

test("edit distance counts transpositions as one", () => {
  expect(editDistance("shop", "hsop")).toBe(1);
  expect(editDistance("abc", "abc")).toBe(0);
  expect(editDistance("kitten", "sitting")).toBe(3);
});

test("an identical name is not a look-alike", () => {
  expect(lookalikeOf("shop.testnet", ["shop.testnet"])).toBeNull();
  expect(lookalikeOf("totally-different.testnet", ["shop.testnet"])).toBeNull();
});
