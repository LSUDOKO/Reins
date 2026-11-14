// The logo lockup: a highlighter-yellow square carrying a hand-drawn "r"
// monogram in forest ink (rounded, deliberately imperfect strokes), followed by
// the wordmark in Inter 700. One component, three sizes, used by every nav.

import Link from "next/link";

export function Monogram({ size = 36 }: { size?: number }) {
  return (
    <span className="lgmark" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        {/* r: a slightly leaning stem, the arm pulled off it like a rein */}
        <path d="M14.6 13.4c.4 4.6.3 9.2-.2 13.8" />
        <path d="M14.8 18.6c1.9-3 4.9-4.6 8.2-4.2 1.5.2 2.8.8 3.9 1.7" />
        <path d="M27.4 16.4c.6 1.4.5 2.8-.3 4" />
      </svg>
    </span>
  );
}

export function Logo({ href = "/", size = "md" }: { href?: string; size?: "sm" | "md" | "lg" }) {
  const px = size === "lg" ? 44 : size === "sm" ? 30 : 36;
  return (
    <Link className={`logo logo-${size}`} href={href} aria-label="Reins">
      <Monogram size={px} />
      <span className="lgword">Reins</span>
    </Link>
  );
}
