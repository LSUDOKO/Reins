"use client";

// Authority helpers + controls. allowance() reads the live budget, TermsGrid =
// the rein's term sheet as the contract holds it, RevokeButton = the revoke
// staircase (contract revoke, then the agent key leaves the owner's account),
// ConnectChips = the per-harness install affordances for the MCP server.

import { useState } from "react";
import type { CardState } from "@/lib/api";
import { CONTRACT_ID, txUrl } from "@/lib/chain";
import type { Wallet } from "@/lib/near";
import { IconCheck, IconCopy, IconRevoke, isDead, shortHex } from "./ui";
import { DangerModal, type DangerPhase } from "./Confirm";

export function caveatCount(card: CardState): number {
  const t = card.terms;
  let n = 1; // the per-payment cap is always set
  if (t.pay?.period) n++;
  if (t.pay?.lifetime) n++;
  if (t.expiry) n++;
  if (t.maxUses) n++;
  if (t.approvalAbove) n++;
  if (t.merchants?.length) n++;
  return n + 1; // + the shared blocklist, checked on every payment
}

export function allowance(card: CardState) {
  const capStr = card.terms.pay?.period?.amount ?? card.terms.pay?.lifetime?.amount ?? null;
  const remainingStr = card.remaining_this_period ?? card.remaining_lifetime;
  const cap = capStr ? parseFloat(capStr) : null;
  const remaining = remainingStr !== null && remainingStr !== undefined ? parseFloat(remainingStr) : null;
  const spent = cap !== null && remaining !== null ? Math.max(0, cap - remaining) : null;
  const spentPct = cap && spent !== null ? Math.min(100, (spent / cap) * 100) : 0;
  return { cap, remaining, spent, spentPct };
}

// ---------------------------------------------------------------------------
// TermsGrid: the rein term sheet (inside the foot accordion's sheet).
// Two grouped stacks of quiet rows · what the card can do (scope) left, how
// long it lives and who holds it (lifecycle + enforcement) right. Values
// humanized: "uncapped", "any merchant", "unlimited", real dates.
// ---------------------------------------------------------------------------

export function TermsGrid({ card, agentAddress }: { card: CardState; agentAddress?: string }) {
  const t = card.terms;
  const key = agentAddress ?? card.agent_key;
  const expires = card.expires_at
    ? `${new Date(card.expires_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}${
        !isDead(card.status) && card.expires_at * 1000 > Date.now()
          ? ` · ${Math.max(1, Math.ceil((card.expires_at * 1000 - Date.now()) / 86400000))}d left`
          : ""
      }`
    : "Never";

  const row = (label: string, value: React.ReactNode, opts?: { title?: string; mono?: boolean }) => (
    <div className="trow" title={opts?.title}>
      <span className="tl">{label}</span>
      <span className={`tv${opts?.mono ? " code" : ""}`}>{value}</span>
    </div>
  );

  return (
    <div className="termsheet">
      <div className="tcol">
        {row("Rail", "NEAR from the vault")}
        {row("Per-Payment Cap", t.perTxMax ? `Ⓝ${t.perTxMax}` : "Uncapped")}
        {row("Owner Approval", t.approvalAbove ? `Above Ⓝ${t.approvalAbove}` : "Never asked")}
        {row("Merchants", t.merchants?.length ? `${t.merchants.length} locked` : "Any merchant", {
          title: t.merchants?.join("\n"),
        })}
        {t.pay?.lifetime && row("Lifetime Cap", `Ⓝ${t.pay.lifetime.amount}`)}
        {row("Blocklist", "Shared · enforced on-chain")}
      </div>
      <div className="tcol">
        {row("Expires", expires)}
        {row("Uses Left", card.uses_remaining !== null ? card.uses_remaining : "Unlimited")}
        {row("Payments", `${card.uses} · Ⓝ${card.total_spent} total`)}
        {row("Agent Key", shortHex(key, 14, 4), { title: key, mono: true })}
        {row("Key Methods", "pay · request_approval · issue_subrein", { title: `function-call key for ${CONTRACT_ID}` })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revoke: the owner's wallet signs `revoke` (the rein and its whole subtree die
// in the contract), then deletes the agent key from the owner account so it
// stops burning gas allowance. The component stays mounted when the rein dies
// so the done state survives the status flip behind the scrim.
// ---------------------------------------------------------------------------

export function RevokeButton({
  card,
  revocable,
  wallet,
  canWrite,
  onDone,
}: {
  card: CardState;
  revocable: boolean;
  wallet: Wallet;
  canWrite: boolean;
  onDone: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<DangerPhase>("confirm");
  const [stage, setStage] = useState<"revoking" | "key">("revoking");
  const [tx, setTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isSub = !!card.parent_card_id;

  async function go() {
    setErr(null);
    try {
      setPhase("busy");
      setStage("revoking");
      setTx(await wallet.call("revoke", { id: Number(card.card_id) }));
      setStage("key");
      // best effort: an agent-issued key may never have been added to the account
      await wallet.deleteKey(card.agent_key).catch(() => null);
      setPhase("done");
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  return (
    <>
      <button
        className="vpill danger"
        disabled={!revocable || !canWrite}
        onClick={() => setOpen(true)}
        data-testid="revoke"
        title={canWrite ? "Revoke · signed by your NEAR wallet" : "Sign in as the owner to revoke"}
      >
        <IconRevoke size={13} />
        Revoke
      </button>
      <DangerModal
        open={open}
        phase={phase}
        prefix="revoke"
        title={isSub ? "Revoke this sub-rein?" : "Revoke this rein?"}
        body="The contract forgets this agent key for good, and every sub-rein beneath it dies with it. Then the key is deleted from your account."
        confirmLabel="Yes, Revoke"
        busyNote={stage === "revoking" ? "Revoking on-chain…" : "Deleting the agent key from your account…"}
        doneTitle="Rein Revoked"
        doneNote={
          <>
            Revoked. The key is dead.{" "}
            {tx && (
              <a href={txUrl(tx)} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                {shortHex(tx, 10, 0)}
              </a>
            )}
          </>
        }
        errorNote={err ? `Revoke failed: ${err}` : undefined}
        onConfirm={go}
        onClose={() => {
          setOpen(false);
          setPhase("confirm");
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Connect chips: per-harness install affordances for the card URL (#25).
// Rendered inside the connect overlay; the URL is the credential · every
// snippet embeds it; treat them all as secrets.
// ---------------------------------------------------------------------------

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="dbtn quiet"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <IconCheck /> : <IconCopy />}
      {copied ? "Copied" : label}
    </button>
  );
}

/** The credential surface: a quiet inset box, the copy action riding inside it. */
export function UrlBox({ url, testid }: { url: string; testid?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ovurl">
      <span className="u" data-testid={testid}>
        {url}
      </span>
      <button
        className={`ovcopy${copied ? " done" : ""}`}
        aria-label="Copy"
        title="Copy"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <IconCheck /> : <IconCopy />}
      </button>
    </div>
  );
}

/** The MCP server runs next to the agent and signs with the rein's key. */
export function mcpCommands(owner: string, secret: string, name: string) {
  const env = { REINS_OWNER: owner, REINS_AGENT_KEY: secret, REINS_CONTRACT: CONTRACT_ID };
  const server = "<path-to-Reins>/packages/mcp/src/index.ts";
  const envFlags = Object.entries(env).map(([k, v]) => `-e ${k}=${v}`).join(" ");
  return {
    cli: `claude mcp add ${name} ${envFlags} -- bun run ${server}`,
    codex: `codex mcp add ${name} ${Object.entries(env).map(([k, v]) => `--env ${k}=${v}`).join(" ")} -- bun run ${server}`,
    json: JSON.stringify({ mcpServers: { [name]: { command: "bun", args: ["run", server], env } } }, null, 2),
  };
}

export function ConnectChips({ owner, secret, cardName }: { owner: string; secret: string; cardName: string }) {
  const [done, setDone] = useState<string | null>(null);
  const slug = cardName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "rein";
  const { cli, codex, json } = mcpCommands(owner, secret, `reins-${slug}`);
  const copy = (key: string, text: string) => async () => {
    await navigator.clipboard.writeText(text);
    setDone(key);
    setTimeout(() => setDone((k) => (k === key ? null : k)), 1500);
  };
  const harnesses = [
    { key: "cc", label: "Claude Code", title: "Copy the claude mcp add command", text: cli },
    { key: "cdx", label: "Codex", title: "Copy the codex mcp add command", text: codex },
    { key: "json", label: "JSON", title: "Copy mcpServers JSON for any other client", text: json },
  ];

  return (
    <div data-testid="connect-panel">
      <div className="hlabel">Add to Your Agent</div>
      <div className="hgrid">
        {harnesses.map((h) => (
          <button key={h.key} className={`hrow${done === h.key ? " done" : ""}`} title={h.title} onClick={() => void copy(h.key, h.text)()}>
            <span>{h.label}</span>
            {done === h.key ? <IconCheck /> : <IconCopy />}
          </button>
        ))}
      </div>
      <p className="bchint">Each copies an install command for the Reins MCP server · it signs with the rein's key, never yours</p>
    </div>
  );
}
