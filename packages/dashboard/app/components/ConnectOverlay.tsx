"use client";

// The connect overlay: "Connect agent" opens a scrim + centered floating panel
// (same language as the avatar menu) holding the rein's agent key and the
// per-harness install chips for the Reins MCP server. The agent's SECRET key is
// shown once, at creation; here it stays a placeholder. Esc / scrim / ✕ close it.
// Mount/unmount rides AnimatePresence at the call site.

import { useEffect } from "react";
import { motion } from "motion/react";
import type { CardState } from "@/lib/api";
import { ConnectChips, UrlBox } from "./Authority";
import { IconClose } from "./ui";

export function ConnectOverlay({
  card,
  secret,
  onClose,
}: {
  card: CardState;
  /** only known right after creation; otherwise the snippets carry a placeholder */
  secret?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <motion.div
      className="ovwrap"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      onClick={onClose}
    >
      <motion.div
        className="overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Connect an Agent"
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 380, damping: 30 } }}
        exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.16 } }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ovhead">
          <div>
            <span className="lbl">Connect an Agent</span>
            <h2 className="ovtitle">{card.name}</h2>
          </div>
          <button className="closex" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <UrlBox url={secret ?? card.agent_key} testid="card-key" />
        <ConnectChips owner={card.owner} secret={secret ?? "<agent secret shown at creation>"} cardName={card.name} />
        <div className="ovfoot">
          <p className="ovnote">
            {secret
              ? "This is the agent's secret key, shown once · it can only call pay, request_approval and issue_subrein, and cannot attach a deposit"
              : "The public key above is bound to this rein · its secret was shown once when the rein was created · lost it? revoke and create a new rein"}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
