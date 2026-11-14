// Plain-language rein terms, parsed in the browser. No model and no server:
// what you type is matched by the patterns below, and you review the result.

/** "1 NEAR a day, 0.2 per payment, ask above 0.1, only shop.testnet, 30 days" -> draft terms */
export function draftFromText(text: string) {
  const t = text.toLowerCase();
  const num = "(\\d+(?:\\.\\d+)?)";
  const pick = (re: RegExp) => t.match(re)?.[1];
  const budget = pick(new RegExp(`${num}\\s*(?:near|n)?\\s*(?:a|per|\\/|every)\\s*(day|week|month)`));
  const per = t.match(new RegExp(`${num}\\s*(?:near|n)?\\s*(?:a|per|\\/|every)\\s*(day|week|month)`))?.[2];
  const lifetime = pick(new RegExp(`${num}\\s*(?:near|n)?\\s*(?:total|lifetime|in total)`));
  const perTx = pick(new RegExp(`${num}\\s*(?:near|n)?\\s*(?:per|each|a)\\s*(?:payment|charge|tx|call)`)) ??
    pick(new RegExp(`(?:max|at most|up to)\\s*${num}`));
  const approval = pick(new RegExp(`(?:ask|approval|approve|confirm)[a-z ]*(?:above|over|>)\\s*${num}`));
  const days = pick(new RegExp(`(?:expires?|for|lasts?)?\\s*(?:in\\s*)?${num}\\s*days?`));
  const uses = pick(new RegExp(`${num}\\s*(?:uses|payments max|times)`));
  const merchants = [...text.matchAll(/\b([a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:testnet|near))\b/gi)].map((m) => m[1].toLowerCase());
  return {
    amount: budget ?? "",
    period: per === "day" ? 86400 : per === "month" ? 2592000 : 604800,
    lifetime: budget ? "" : (lifetime ?? ""),
    perTx: perTx ?? "",
    approval: approval ?? "",
    expiryDays: days ? Number(days) : 30,
    maxUses: uses ?? "",
    merchants: merchants.join(", "),
  };
}

