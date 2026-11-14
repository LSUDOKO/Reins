"use client";

// /connect: connect an agent to a rein. Pick the rein, paste the agent secret you
// were shown when you created it (it stays in this tab: it is only used to derive
// the public key and fill in the command), and copy the MCP install command. The
// panel also spells out what the key can and cannot do, because that is the whole
// security model.

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyPair, type KeyPairString } from "near-api-js";
import { api, type CardState } from "@/lib/api";
import { AGENT_ALLOWANCE_NEAR, AGENT_METHODS, CONTRACT_ID, DEMO_OWNER } from "@/lib/chain";
import { useWallet } from "@/lib/near";
import { CopyButton, mcpCommands } from "../components/Authority";
import { capWord, IconCheck } from "../components/ui";

// inset surface for data strings · rides theme tokens
const inset: React.CSSProperties = {
  margin: "8px 0",
  padding: "10px 12px",
  background: "var(--float)",
  border: "1px solid var(--hairline)",
  borderLeft: "3px solid var(--accent)",
  borderRadius: 8,
  color: "var(--ink)",
  wordBreak: "break-all",
  whiteSpace: "pre-wrap",
};
const help: React.CSSProperties = { color: "var(--label)", fontSize: 12, lineHeight: 1.5 };
const body: React.CSSProperties = { color: "var(--body)", lineHeight: 1.5 };

export default function ConnectPage() {
  return (
    <main className="narrow">
      <Suspense fallback={<div className="panel" style={{ color: "var(--body)" }}>Loading…</div>}>
        <Connect />
      </Suspense>
    </main>
  );
}

function publicKeyOf(secret: string): string | null {
  try {
    return KeyPair.fromString(secret.trim() as KeyPairString).getPublicKey().toString();
  } catch {
    return null;
  }
}

function Connect() {
  const params = useSearchParams();
  const wallet = useWallet();
  const owner = params.get("owner") ?? wallet.accountId ?? DEMO_OWNER;
  const [cards, setCards] = useState<CardState[] | null>(null);
  const [picked, setPicked] = useState<string | null>(params.get("id"));
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .tree(owner)
      .then(({ tree }) => {
        const flat = (ns: typeof tree): CardState[] => ns.flatMap((n) => [n.card, ...flat(n.children)]);
        setCards(flat(tree).filter((c) => c.status === "active" || c.status === "frozen"));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [owner]);

  const card = cards?.find((c) => c.card_id === picked) ?? null;
  const derived = useMemo(() => (secret.trim() ? publicKeyOf(secret) : null), [secret]);
  const matches = !!card && !!derived && derived === card.agent_key;
  const cmds = card ? mcpCommands(owner, matches ? secret.trim() : "ed25519:<agent-secret>", `reins-${card.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`) : null;

  if (err && !cards) {
    return (
      <div className="panel">
        <p className="err">{err}</p>
        <p style={body}>
          Could not read reins for {owner}. <Link href="/app">Open the dashboard</Link> first.
        </p>
      </div>
    );
  }
  if (!cards) return <div className="panel" style={body}>Loading reins…</div>;

  return (
    <div className="panel" data-testid="connect">
      <h1>Connect an Agent</h1>
      <p style={body}>
        Your agent talks to the Reins MCP server, which signs with the rein&apos;s own key. Reins for <b>{owner}</b>:
      </p>
      {cards.length === 0 ? (
        <p style={body}>
          No live reins. <Link href="/app">Create one on the dashboard</Link>, then come back.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Rein to connect" style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0" }}>
          {cards.map((c) => {
            const on = picked === c.card_id;
            return (
              <div
                key={c.card_id}
                role="radio"
                aria-checked={on}
                tabIndex={0}
                onClick={() => setPicked(c.card_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setPicked(c.card_id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  border: `1px solid ${on ? "var(--accent)" : "var(--hairline)"}`,
                  boxShadow: on ? "0 0 0 3px var(--accent-tint)" : undefined,
                  borderRadius: 12,
                  cursor: "pointer",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18, height: 18, flex: "none", borderRadius: "50%",
                    border: on ? "none" : "1.5px solid var(--hairline-strong)",
                    background: on ? "var(--accent)" : "transparent",
                    color: "var(--on-ink)", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {on && <IconCheck />}
                </span>
                <span style={{ flex: 1 }}>
                  <b>
                    #{c.card_id} {c.name}
                  </b>{" "}
                  <span className={`chip ${c.status}`}>{capWord(c.status)}</span>
                  <br />
                  <span style={{ color: "var(--label)", fontSize: 12 }}>
                    {c.remaining_this_period !== null && `Ⓝ${c.remaining_this_period} left this window`}
                    {c.remaining_this_period === null && c.remaining_lifetime !== null && `Ⓝ${c.remaining_lifetime} lifetime left`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {card && cmds && (
        <>
          <p style={body}>Agent secret for this rein (shown once when you created it · it never leaves this tab):</p>
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="ed25519:…"
            spellCheck={false}
            style={{ width: "100%", fontFamily: "var(--font-mono)" }}
            data-testid="agent-secret"
          />
          <p style={help}>
            {!secret.trim()
              ? `Bound key: ${card.agent_key}`
              : !derived
                ? "That is not a NEAR secret key."
                : matches
                  ? "Matches this rein's key."
                  : `That key belongs to ${derived}, not to this rein.`}
          </p>
          <p className="mono" data-testid="mcp-command" style={inset}>
            {cmds.cli}
          </p>
          <div className="row" style={{ gap: 8 }}>
            <CopyButton text={cmds.cli} label="Copy for Claude Code" />
            <CopyButton text={cmds.codex} label="Copy for Codex" />
            <CopyButton text={cmds.json} label="Copy JSON" />
          </div>
        </>
      )}

      <h2 style={{ fontSize: 15, marginTop: 22 }}>What this key can do</h2>
      <ul style={{ ...body, paddingLeft: 18, marginTop: 6 }}>
        <li>
          Call only <span className="mono">{AGENT_METHODS.join(", ")}</span> on <span className="mono">{CONTRACT_ID}</span>.
        </li>
        <li>Never attach a deposit, so it can never withdraw, approve, unfreeze, change terms or override the blocklist.</li>
        <li>Never transfer NEAR or add keys: NEAR itself refuses those for a function-call key.</li>
        <li>
          Spend gas from a {AGENT_ALLOWANCE_NEAR} NEAR allowance; when that runs out the key stops signing until you replace it.
        </li>
        <li>Pay only inside the rein&apos;s terms: the contract checks every payment, whatever the agent was told.</li>
      </ul>
      <p style={{ ...help, marginTop: 8 }}>
        Lost the secret? Revoke the rein and create a new one · the old key dies with it.
      </p>
    </div>
  );
}
