import { expect, test } from "bun:test";
import { currencyFields, currencyOf, fromUnits, toUnits } from "./currency";

test("currency follows the terms", () => {
  expect(currencyOf({ budget: "1", period_secs: "0", per_tx_cap: "1" })).toBe("NEAR");
  expect(currencyOf({ budget: "1", period_secs: "0", per_tx_cap: "1", token: "t.testnet" })).toBe("tUSD");
  expect(currencyOf({ budget: "1", period_secs: "0", per_tx_cap: "1", evm_chain_id: "84532" })).toBe("ETH");
});

test("units round-trip per currency", () => {
  expect(toUnits("1.5", "tUSD")).toBe("1500000");
  expect(toUnits("0.01", "ETH")).toBe("10000000000000000");
  expect(toUnits("2", "NEAR")).toBe("2" + "0".repeat(24));
  expect(fromUnits("1500000", "tUSD")).toBe("1.5");
  expect(() => toUnits("1e3", "NEAR")).toThrow();
});

test("currency fields select the token or the chain", () => {
  expect(currencyFields("NEAR")).toEqual({ token: null, evm_chain_id: null });
  expect(currencyFields("ETH").evm_chain_id).toBe("84532");
});
