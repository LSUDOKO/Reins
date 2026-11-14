// The logo is the REINS wordmark with its sprig (see Brand.tsx). Kept as its own
// export so every nav keeps the same import.

import { Wordmark } from "./Brand";

export function Logo({ href = "/", size = "md" }: { href?: string; size?: "sm" | "md" | "lg" }) {
  return <Wordmark href={href} size={size === "lg" ? 32 : size === "sm" ? 20 : 25} />;
}
