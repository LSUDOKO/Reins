/**
 * End-to-end test of the Reins console in a real browser (headless Chromium), against the
 * live deployment or a local static build. Spends only faucet testnet NEAR.
 *
 *   npm i --no-save playwright@1.49.1 && npx playwright install chromium
 *   node tests/e2e/console.e2e.mjs [https://reins.adoranto737.workers.dev]
 *
 * Flow: one-click testnet demo account -> deposit 1 NEAR -> Connect wizard with
 * "0.5 NEAR a day, max 0.1 per payment" -> create rein + agent key -> preview_pay says the
 * contract would pay -> freeze -> unfreeze. Exits 1 on a failed expectation or console error.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://reins.adoranto737.workers.dev";
const fails = [];
const expect = (ok, what) => {
  if (!ok) fails.push(what);
  console.log(ok ? "PASS" : "FAIL", what);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const body = () => page.locator("body").innerText();
const button = (name) => page.locator("button", { hasText: name }).first();

// 1. sign in with a fresh faucet account (key kept in this tab's sessionStorage)
await page.goto(`${BASE}/app/`, { waitUntil: "load", timeout: 90000 });
await page.getByTestId("demo-account").click({ timeout: 60000 });
await page.waitForFunction(() => sessionStorage.getItem("reins-key-session"), null, { timeout: 60000 });
const owner = await page.evaluate(() => JSON.parse(sessionStorage.getItem("reins-key-session")).accountId);
expect(/\.testnet$/.test(owner), `demo account created: ${owner}`);

// 2. deposit 1 NEAR into the vault
await page.goto(`${BASE}/settings/`, { waitUntil: "load", timeout: 90000 });
await page.locator("button", { hasText: /^Deposit$/ }).first().click();
await page.waitForTimeout(10000);
expect((await body()).includes("Ⓝ1"), "vault shows 1 NEAR after deposit");

// 3. connect wizard: plain English -> terms -> create rein + key
await page.goto(`${BASE}/connect/`, { waitUntil: "load", timeout: 90000 });
await page.locator("textarea").fill("0.5 NEAR a day, max 0.1 per payment");
await button("Turn into terms").click();
await page.waitForTimeout(6000);
await button("Looks right").click();
await page.waitForTimeout(1500);
await button("Create rein and key").click();
await page.waitForTimeout(18000);
const secret = (await body()).match(/ed25519:[1-9A-HJ-NP-Za-km-z]{60,}/)?.[0];
expect(Boolean(secret), "wizard shows the agent secret once");
expect((await body()).includes("claude mcp add"), "wizard shows the Claude Code command");

// 4. free preview_pay test
await button("Test it").click();
await page.waitForTimeout(1500);
await button("Run preview_pay").click();
await page.waitForTimeout(6000);
expect((await body()).includes("The contract would pay"), "preview_pay: the contract would pay");

// 5. freeze and unfreeze on the dashboard
await page.goto(`${BASE}/app/`, { waitUntil: "load", timeout: 90000 });
await page.waitForTimeout(4000);
await page.locator("button", { hasText: /^\W*Freeze$/ }).first().click();
await page.waitForTimeout(12000);
expect((await body()).includes("Frozen"), "rein shows Frozen");
await page.locator("button", { hasText: /Unfreeze/ }).first().click();
await page.waitForTimeout(12000);
expect((await body()).includes("Active"), "rein shows Active after unfreeze");

expect(errors.length === 0, `no console errors (${errors.length}) ${errors.join(" | ")}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : "\nall passed");
process.exit(fails.length ? 1 : 0);
