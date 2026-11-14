import { expect, test } from "bun:test";
import { fromYocto, toYocto } from "../src/units";

test("toYocto converts whole and fractional NEAR", () => {
  expect(toYocto("1")).toBe("1000000000000000000000000");
  expect(toYocto("0.25")).toBe("250000000000000000000000");
  expect(toYocto(2)).toBe("2000000000000000000000000");
});

test("toYocto rejects junk and over-precise input", () => {
  expect(() => toYocto("1e3")).toThrow();
  expect(() => toYocto("-1")).toThrow();
  expect(() => toYocto("0." + "1".repeat(25))).toThrow();
});

test("fromYocto round-trips and trims", () => {
  expect(fromYocto(toYocto("1.5"))).toBe("1.5");
  expect(fromYocto("1000000000000000000000000")).toBe("1");
  expect(fromYocto("1")).toBe("0");
});
