// Render docs/brand/src/*.html to docs/brand/*.png with Playwright (fonts from Google Fonts).
//   npx -y playwright@1.49.1 install chromium && node scripts/brand/render.mjs
import { chromium } from "playwright";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = process.env.BRAND_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "brand");
const sizes = { logo: [1024, 1024], mark: [512, 512], banner: [1600, 600], how: [1600, 900], wordmark: [1200, 340] };
const b = await chromium.launch();
for (const f of readdirSync(join(root, "src")).filter((f) => f.endsWith(".html"))) {
  const name = f.replace(".html", "");
  const [width, height] = sizes[name];
  const p = await b.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await p.goto("file://" + join(root, "src", f), { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(root, `${name}.png`), omitBackground: name === "wordmark" });
  console.log("rendered", name);
}
await b.close();
