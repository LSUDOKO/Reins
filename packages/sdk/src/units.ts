/** NEAR amount helpers. All on-chain amounts are yoctoNEAR strings (1 NEAR = 10^24). */
const YOCTO = 24;

export function toYocto(near: string | number): string {
  const s = String(near).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a NEAR amount: ${near}`);
  const [whole, frac = ""] = s.split(".");
  if (frac.length > YOCTO) throw new Error(`more than 24 decimals: ${near}`);
  return (BigInt(whole) * 10n ** BigInt(YOCTO) + BigInt(frac.padEnd(YOCTO, "0") || "0")).toString();
}

export function fromYocto(yocto: string | bigint, digits = 4): string {
  const v = BigInt(yocto);
  const whole = v / 10n ** BigInt(YOCTO);
  const frac = (v % 10n ** BigInt(YOCTO)).toString().padStart(YOCTO, "0").slice(0, digits).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export const SECONDS = { hour: 3600, day: 86400, week: 604800 } as const;
