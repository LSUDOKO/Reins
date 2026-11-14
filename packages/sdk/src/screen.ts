/**
 * Prompt-injection screening of the text that made an agent decide to pay (a web page, an
 * email, a tool result). Calls the Reins API, which runs Llama Prompt Guard 2 on Groq.
 * Returns null when the API is unreachable: "unavailable" never blocks or clears a payment.
 */
export const REINS_API = process.env.REINS_API ?? "https://reins-api.adoranto737.workers.dev";

export interface Screen {
  injection: boolean;
  score: number;
  model: string;
}

export async function screenText(text: string, api = REINS_API, f: typeof fetch = fetch): Promise<Screen | null> {
  if (!text.trim()) return null;
  try {
    const res = await f(`${api}/screen`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 2000) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Screen;
    return typeof body.score === "number" ? body : null;
  } catch {
    return null;
  }
}
