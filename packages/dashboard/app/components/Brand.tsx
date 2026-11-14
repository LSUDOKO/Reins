"use client";

// Brand atoms: the REINS wordmark with its sprig, the lime brush stroke that sits
// behind headlines, the rotating badge, and a set of hand-drawn line doodles
// (reins, leaves, coins, a small agent, a key, a shield, chain links). All inline
// SVG in currentColor so they take the ink of wherever they sit.

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

type P = { className?: string; size?: number; style?: React.CSSProperties };
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function Sprig({ className = "", size = 26, style }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" style={style} aria-hidden>
      <g fill="currentColor">
        <path d="M6 9c3-5 9-6 11-4-1 4-6 7-11 4Z" />
        <path d="M15 4c4-3 10-1 11 2-3 3-9 3-11-2Z" />
        <path d="M5 19c2-6 8-8 11-6-1 5-6 8-11 6Z" />
        <path d="M17 13c5-2 10 1 10 4-4 2-9 1-10-4Z" />
        <path d="M9 28c1-6 6-9 9-8 0 5-4 8-9 8Z" />
      </g>
    </svg>
  );
}

export function Wordmark({ href = "/", onGreen = false, size = 26 }: { href?: string; onGreen?: boolean; size?: number }) {
  return (
    <Link href={href} className={`wordmark${onGreen ? " on-green" : ""}`} aria-label="Reins home">
      <span className="wm-t" style={{ fontSize: size }}>Reins</span>
      <Sprig className="wm-sprig" size={size} />
    </Link>
  );
}

/** A lime brush stroke behind its children. It paints in once, left to right. */
export function Brush({ children, delay = 0.2 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <span className="brush">
      <svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden>
        <motion.path
          d="M12 30c40-14 110-20 190-18 70 1 130 4 184 14 8 18 6 44 4 66-60 12-140 16-216 14-58-1-110-6-156-16-10-18-12-40-6-60Z M30 18c20-4 40-6 60-4M330 104c16 2 34 0 50-4"
          fill="currentColor"
          initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }}
          animate={{ clipPath: "inset(0 0% 0 0)" }}
          transition={{ duration: 0.9, delay, ease: [0.65, 0, 0.35, 1] }}
        />
      </svg>
      {children}
    </span>
  );
}

/** Circular badge text, slowly turning. */
export function SpinBadge({ text = "Built on NEAR • Agent safe • Keys stay home •", className = "" }: { text?: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      className={`badge-spin ${className}`}
      viewBox="0 0 140 140"
      animate={reduce ? undefined : { rotate: 360 }}
      transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
      aria-label={text}
      role="img"
    >
      <defs>
        <path id="badge-circle" d="M70 70m-52 0a52 52 0 1 1 104 0a52 52 0 1 1-104 0" />
      </defs>
      <text>
        <textPath href="#badge-circle">{text}</textPath>
      </text>
      <g transform="translate(57 57)" fill="currentColor">
        <Sprig size={26} />
      </g>
    </motion.svg>
  );
}

// ---- doodles -----------------------------------------------------------------------------

export function DReins({ className = "", size = 140, style }: P) {
  return (
    <svg className={`doodle ${className}`} width={size} height={size * 0.7} viewBox="0 0 140 98" style={style} aria-hidden {...stroke}>
      <path d="M8 70c18-30 40-44 66-40 22 3 36 18 56 14" />
      <path d="M10 78c20-24 44-34 68-30 20 3 34 16 52 12" />
      <circle cx="74" cy="34" r="9" />
      <path d="M118 44c6 2 10 6 12 12M126 58c-4 4-10 6-16 6" />
      <path d="M22 70c-6 2-10 8-10 14 6 2 12 0 16-4" />
    </svg>
  );
}

export function DLeaf({ className = "", size = 80, style }: P) {
  return (
    <svg className={`doodle ${className}`} width={size} height={size} viewBox="0 0 80 80" style={style} aria-hidden {...stroke}>
      <path d="M14 66C10 36 30 12 66 10c4 34-18 58-52 56Z" />
      <path d="M14 66C30 50 44 36 58 20" />
      <path d="M28 50l-2-10M38 40l-1-12M48 30l0-8M30 52l10 0M40 42l10 0" />
    </svg>
  );
}

export function DCoin({ className = "", size = 56, style }: P) {
  return (
    <svg className={`doodle ${className}`} width={size} height={size} viewBox="0 0 56 56" style={style} aria-hidden {...stroke}>
      <ellipse cx="28" cy="28" rx="22" ry="21" />
      <ellipse cx="28" cy="28" rx="15" ry="14" />
      <path d="M23 34V22l10 12V22" />
    </svg>
  );
}

export function DAgent({ className = "", size = 110, style }: P) {
  return (
    <svg className={`doodle ${className}`} width={size} height={size} viewBox="0 0 110 110" style={style} aria-hidden {...stroke}>
      <rect x="24" y="30" width="62" height="48" rx="16" />
      <path d="M55 30V16" />
      <circle cx="55" cy="12" r="4" />
      <circle cx="42" cy="52" r="5" />
      <circle cx="68" cy="52" r="5" />
      <path d="M44 66c7 5 15 5 22 0" />
      <path d="M24 54h-8M86 54h8M40 78v12M70 78v12M34 92h14M64 92h14" />
    </svg>
  );
}

export function DKey({ className = "", size = 90, style }: P) {
  return (
    <svg className={`doodle ${className}`} width={size} height={size * 0.5} viewBox="0 0 90 45" style={style} aria-hidden {...stroke}>
      <circle cx="18" cy="22" r="12" />
      <circle cx="18" cy="22" r="4" />
      <path d="M30 22h52M70 22v10M78 22v7" />
    </svg>
  );
}

export function DShield({ className = "", size = 80, style }: P) {
  return (
    <svg className={`doodle ${className}`} width={size} height={size} viewBox="0 0 80 80" style={style} aria-hidden {...stroke}>
      <path d="M40 8c10 6 20 8 30 8 0 26-8 46-30 56C18 62 10 42 10 16c10 0 20-2 30-8Z" />
      <path d="M27 40l9 9 17-19" />
    </svg>
  );
}

export function DChain({ className = "", size = 100, style }: P) {
  return (
    <svg className={`doodle ${className}`} width={size} height={size * 0.5} viewBox="0 0 100 50" style={style} aria-hidden {...stroke}>
      <rect x="6" y="14" width="40" height="22" rx="11" />
      <rect x="54" y="14" width="40" height="22" rx="11" />
      <path d="M38 25h24" />
    </svg>
  );
}

export function DDots({ className = "", size = 60, style }: P) {
  return (
    <svg className={`doodle ${className}`} width={size} height={size} viewBox="0 0 60 60" style={style} aria-hidden fill="currentColor">
      {[[8, 10], [22, 6], [36, 12], [14, 24], [30, 26], [46, 22], [8, 40], [24, 44], [40, 40], [52, 50]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />
      ))}
    </svg>
  );
}

/** A filled leafy branch, for sage/green panels (the poster doodles in the brief). */
export function DBranch({ className = "", size = 160, style }: P) {
  return (
    <svg className={`doodle ${className}`} width={size} height={size} viewBox="0 0 160 160" style={style} aria-hidden fill="currentColor">
      <path d="M78 156c2-40 4-82 2-130" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M80 120c-18-6-34-18-40-34 18 2 34 14 40 34Z" />
      <path d="M80 98c16-8 30-22 34-38-16 4-30 18-34 38Z" />
      <path d="M80 70c-14-6-26-18-30-32 14 2 26 14 30 32Z" />
      <path d="M80 48c12-6 22-18 24-30-12 2-22 14-24 30Z" />
      <path d="M80 30c-6-8-8-18-6-26 6 6 8 16 6 26Z" />
    </svg>
  );
}
