import { expect, test } from "bun:test";
import { panicOf, parseEvents } from "../src/agent";

const ev = (event: string, data: object) => `EVENT_JSON:${JSON.stringify({ standard: "reins", version: "1.0.0", event, data: [data] })}`;

test("parseEvents keeps only reins NEP-297 events from all receipts", () => {
  const res = {
    transaction_outcome: { outcome: { logs: [] } },
    receipts_outcome: [
      { outcome: { logs: ["hello", ev("payment", { amount: "1" })] } },
      { outcome: { logs: [`EVENT_JSON:${JSON.stringify({ standard: "nep141", event: "ft_transfer", data: [] })}`] } },
    ],
  };
  const out = parseEvents(res);
  expect(out.map((e) => e.event)).toEqual(["payment"]);
  expect(out[0].data[0].amount).toBe("1");
});

test("panicOf extracts the contract's error code", () => {
  const res = {
    receipts_outcome: [{
      outcome: { status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: receiver_blocked" } } } } } },
    }],
  };
  expect(panicOf(res)).toBe("receiver_blocked");
  expect(panicOf({ receipts_outcome: [{ outcome: { status: { SuccessValue: "" } } }] })).toBeUndefined();
});
