"use client";

// The sage "plain English" box: what a rein lets its agent do, in words, with a
// note on where the words came from (the Reins API, the browser, or the chain).

import { motion } from "motion/react";

export function Plain({ text, source, title = "What this rein does" }: { text: string; source: string; title?: string }) {
  return (
    <motion.div className="plain" style={{ marginTop: 16 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="ph">{title}</div>
      {text}
      <div className="src">{source === "api" ? "Written by the Reins API from the on-chain terms" : source === "chain" ? "Answer from the contract's preview_pay" : "Written from the terms in your browser"}</div>
    </motion.div>
  );
}

