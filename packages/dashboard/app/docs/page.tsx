"use client";

// /docs: the reference, in the house style. A quiet left TOC rail (scroll-spy,
// theme toggle + back-to-app at the foot) beside one prose column. Public route,
// no auth. Everything here is grounded in the contract, SDK and MCP server code.

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { ThemeToggle } from "../components/Theme";
import { Logo } from "../components/Logo";
import { IconCheck, IconCopy, copyText } from "../components/ui";
import { CONTRACT_ID } from "@/lib/chain";

// ---------------------------------------------------------------------------
// Table of contents: grouped into proper sections (drives the nav). The groups
// follow the body's reading order exactly, so the scroll-spy and the clicks
// never jump out of sequence.
// ---------------------------------------------------------------------------

const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  {
    group: "Concepts",
    items: [
      { id: "overview", label: "Overview" },
      { id: "lifecycle", label: "How a Payment Works" },
    ],
  },
  {
    group: "Reins",
    items: [
      { id: "creating", label: "Creating a Rein" },
      { id: "terms", label: "Rein Terms" },
      { id: "errors", label: "Error Codes" },
    ],
  },
  {
    group: "Connect",
    items: [
      { id: "connect", label: "Connecting an Agent" },
      { id: "tools", label: "MCP Tools" },
      { id: "keys", label: "Function-Call Key Limits" },
    ],
  },
  {
    group: "Advanced",
    items: [
      { id: "approvals", label: "Owner Approvals" },
      { id: "subreins", label: "Sub-Reins & Revocation" },
      { id: "guard", label: "Counterparty Guard" },
      { id: "currencies", label: "Tokens, Chains & Accounts" },
      { id: "intents", label: "Cross-Chain Quotes" },
    ],
  },
  {
    group: "Reference",
    items: [
      { id: "contract", label: "Contract Methods" },
      { id: "events", label: "Events" },
      { id: "sdk", label: "SDK & CLI" },
      { id: "verify", label: "Verify It Yourself" },
    ],
  },
];
const FLAT = NAV.flatMap((g) => g.items);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Code({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="doccode">
      <pre>{code}</pre>
      <button
        className={`doccopy${done ? " done" : ""}`}
        aria-label="Copy to clipboard"
        title="Copy"
        onClick={async () => {
          if (await copyText(code)) {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }
        }}
      >
        {done ? <IconCheck /> : <IconCopy />}
      </button>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="doctablewrap">
      <table className="doctable">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Note({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`docnote${warn ? " warn" : ""}`}>
      <span className="ni" aria-hidden>
        {warn ? (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1.6 15 13.5H1z" />
            <path d="M8 6.2v3.6M8 11.6v.1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6.6" />
            <path d="M8 7.4v4M8 4.7v.1" />
          </svg>
        )}
      </span>
      <p>{children}</p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="docsec" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocsPage() {
  const [active, setActive] = useState(FLAT[0].id);

  // scroll-spy: highlight the section whose top sits in the upper band of the viewport
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-12% 0px -72% 0px", threshold: 0 },
    );
    for (const s of FLAT) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  return (
    <div className="docs">
      {/* the aurora: subtle page weather behind the chrome */}
      <div className="docaurora" aria-hidden>
        <i className="docbeamA" />
        <i className="docbeamB" />
        <i className="docbeamC" />
      </div>
      <aside className="docnav">
        <Logo href="/" />
        <span className="docnavlabel">Documentation</span>
        <nav className="docnavlist">
          {NAV.map((g) => (
            <Fragment key={g.group}>
              <div className="docnavgroup">{g.group}</div>
              {g.items.map((s) => (
                <a key={s.id} className={`docnavitem${active === s.id ? " on" : ""}`} href={`#${s.id}`}>
                  {s.label}
                </a>
              ))}
            </Fragment>
          ))}
        </nav>
        <div className="docnavfoot">
          <ThemeToggle />
          <Link className="docback" href="/app">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <span>Open the App</span>
          </Link>
        </div>
      </aside>

      <main className="docbody">
        <div className="docwrap">
          {/* hero */}
          <header className="dochero">
            <span className="doceyebrow">Spending limits for agents</span>
            <h1>Documentation</h1>
            <p className="docsub">
              Reins gives an AI agent a NEAR function-call key instead of your keys. The Reins contract holds the rules and
              checks every payment; the agent can spend inside them and nothing else. Here is how it works, end to end.
            </p>
          </header>

          {/* ---- Overview ---- */}
          <Section id="overview" title="Overview">
            <p className="docp">
              Agents need to spend money. Handing one a full-access key is reckless; funding a separate wallet gives up your
              limits. Reins uses what NEAR already has: an account can hold <b>function-call access keys</b> that may call
              only named methods of one contract and can never attach a deposit.
            </p>
            <ul className="docul">
              <li className="docli">
                <b>The vault is the account.</b> You deposit NEAR into the Reins contract; it is held for you and only your
                full-access key can withdraw it.
              </li>
              <li className="docli">
                <b>A rein is terms bound to a key.</b> Budget per window, per-payment cap, approval threshold, merchant
                lock, expiry, usage count — stored on-chain against one public key.
              </li>
              <li className="docli">
                <b>The agent holds a function-call key.</b> It lives on your account but can call only <code>pay</code>,{" "}
                <code>request_approval</code> and <code>issue_subrein</code>.
              </li>
              <li className="docli">
                <b>Revoke kills it.</b> Freeze, revoke a rein and its subtree, or revoke every rein you own in one
                transaction.
              </li>
            </ul>

            <div className="docdiagram">
              {`you.testnet  `}<span className="mut">(full-access key: deposits, approvals, revokes)</span>{`
   ├── vault in reins-near.testnet   `}<span className="mut">Ⓝ1.7</span>{`
   └── `}<b>rein #2</b>{`   `}<span className="mut">Ⓝ0.5 / day · Ⓝ0.2 per payment · ask above Ⓝ0.1</span>{`   ← function-call key on you.testnet
        └── `}<b>sub-rein #3</b>{`   `}<span className="mut">Ⓝ0.1 / day</span>{`   ← issued by the agent, key added by you`}
            </div>

            <div className="docfacts">
              <div className="docfact">
                <div className="fk">Contract</div>
                <div className="fv">
                  <code>{CONTRACT_ID}</code>
                </div>
              </div>
              <div className="docfact">
                <div className="fk">Network</div>
                <div className="fv">
                  <span>NEAR testnet</span>
                </div>
              </div>
              <div className="docfact">
                <div className="fk">Source</div>
                <div className="fv">
                  <a href="https://github.com/LSUDOKO/Reins" target="_blank" rel="noreferrer">
                    github.com/LSUDOKO/Reins
                  </a>
                </div>
              </div>
            </div>
          </Section>

          {/* ---- Lifecycle ---- */}
          <Section id="lifecycle" title="How a Payment Works">
            <ol className="docul">
              <li className="docli">
                <b>Check the receiver.</b> The MCP server scores it: shared blocklist, existence, age, recent contract code
                changes, your history with it, look-alike names. <i>block</i> refuses to sign; <i>warn</i> asks you.
              </li>
              <li className="docli">
                <b>Dry run.</b> <code>preview_pay</code> is a free view that runs the exact same check as <code>pay</code>.
              </li>
              <li className="docli">
                <b>Pay.</b> The agent signs <code>pay</code> with its key. The contract finds the rein from the signing key,
                checks every rule along the rein and its ancestors, books the spend, and transfers from your vault.
              </li>
              <li className="docli">
                <b>Settle.</b> A callback confirms the transfer. If it failed (say, the account does not exist), budget, uses
                and vault are restored and a <code>payment_failed</code> event is emitted.
              </li>
            </ol>
          </Section>

          {/* ---- Creating ---- */}
          <Section id="creating" title="Creating a Rein">
            <p className="docp">
              In the <Link href="/app">console</Link>, press + on the deck and describe the rein, or set the terms yourself.
              Your wallet signs two transactions:
            </p>
            <Code code={`# 1. bind a fresh key to the terms (deposit covers storage; the rest stays in the vault)
create_rein { agent_key, label, terms }   attached: 0.02 NEAR

# 2. add that key to your account, for the agent methods only
AddKey ed25519:… FunctionCall { receiver: ${CONTRACT_ID}, methods: [pay, request_approval, issue_subrein], allowance: 0.25 NEAR }`} />
            <Note>The agent&apos;s secret key is generated in your browser and shown once. Reins never stores it.</Note>
          </Section>

          {/* ---- Terms ---- */}
          <Section id="terms" title="Rein Terms">
            <Table
              head={["Term", "Meaning", "Checked"]}
              rows={[
                [<code key="b">budget</code>, "Max spend per window (or lifetime when period_secs is 0)", "every rein up the chain"],
                [<code key="p">period_secs</code>, "Window length; the window resets after it elapses", "every rein up the chain"],
                [<code key="c">per_tx_cap</code>, "Largest single payment, approval or not", "every rein up the chain"],
                [<code key="a">approval_above</code>, "Above this the agent must file a request", "the paying rein"],
                [<code key="e">expires_at</code>, "Unix seconds after which the rein stops", "every rein up the chain"],
                [<code key="u">max_uses</code>, "Payments over the rein's life", "every rein up the chain"],
                [<code key="m">merchants</code>, "If set, the only accounts the rein may pay", "every rein up the chain"],
                ["blocklist", "Accounts with a bonded report, unless you allowed them", "every payment"],
                ["vault", "Your balance must cover the payment", "every payment"],
              ]}
            />
          </Section>

          {/* ---- Errors ---- */}
          <Section id="errors" title="Error Codes">
            <p className="docp">
              <code>pay</code> panics with exactly one of these, and <code>preview_pay</code> returns the same code without
              moving anything, so an agent can relay the reason instead of guessing.
            </p>
            <Table
              head={["Code", "Meaning"]}
              rows={[
                ["unknown_key", "The signing key is not bound to a rein (never was, or revoked)"],
                ["signer_must_be_owner", "The call was relayed through another contract"],
                ["rein_not_active", "This rein or an ancestor is frozen or revoked"],
                ["rein_expired", "Past expires_at"],
                ["uses_exhausted", "max_uses reached"],
                ["merchant_not_allowed", "Receiver not in the merchant lock"],
                ["over_per_tx_cap", "Above the per-payment cap"],
                ["over_budget", "Not enough left in this window, here or up the chain"],
                ["receiver_blocked", "Receiver is on the shared blocklist for this owner"],
                ["vault_insufficient", "The vault cannot cover it"],
                ["needs_approval", "Above approval_above · use request_approval"],
                ["self_payment", "Paying the owner or the contract itself"],
                ["zero_amount", "Amount is zero"],
              ].map(([c, m]) => [<code key={c}>{c}</code>, m])}
            />
          </Section>

          {/* ---- Connect ---- */}
          <Section id="connect" title="Connecting an Agent">
            <p className="docp">
              The Reins MCP server runs next to the agent and signs with the rein&apos;s key. The{" "}
              <Link href="/connect">connect page</Link> fills in the command for you.
            </p>
            <Code code={`claude mcp add reins \\
  -e REINS_OWNER=you.testnet \\
  -e REINS_AGENT_KEY=ed25519:<agent-secret> \\
  -- bun run <path-to-Reins>/packages/mcp/src/index.ts`} />
            <Note>
              The server asks you through MCP elicitation when the counterparty check says <i>warn</i>. A client without
              elicitation gets a refusal and a message to ask you instead.
            </Note>
          </Section>

          {/* ---- Tools ---- */}
          <Section id="tools" title="MCP Tools">
            <Table
              head={["Tool", "What it does"]}
              rows={[
                ["rein_status", "Terms, what is left this window, the vault, pending approvals · call it first"],
                ["check_counterparty", "allow / warn / block with reasons for a receiver"],
                ["preview_payment", "The free preview_pay dry run"],
                ["pay", "Guarded payment: refuses on block, asks you on warn, files a request above the threshold"],
                ["approval_status", "State of a request the agent filed"],
                ["issue_subrein", "A narrower rein for a sub-agent's public key"],
                ["quote_cross_chain", "NEAR Intents 1Click dry quote · never moves funds"],
              ].map(([t, d]) => [<code key={t}>{t}</code>, d])}
            />
          </Section>

          {/* ---- Keys ---- */}
          <Section id="keys" title="Function-Call Key Limits">
            <ul className="docul">
              <li className="docli">It can call only <code>pay</code>, <code>request_approval</code> and <code>issue_subrein</code> on the Reins contract.</li>
              <li className="docli">
                It cannot attach a deposit. Every owner method requires at least 1 yoctoNEAR attached, so the key can never
                withdraw, approve, unfreeze, change terms or override the blocklist — even if it were granted those names.
              </li>
              <li className="docli">It cannot transfer NEAR, add keys or deploy code: NEAR refuses those for a function-call key.</li>
              <li className="docli">
                It spends gas from its allowance (0.25 NEAR by default). When the allowance runs out, the key stops signing;
                <Link href="/settings"> Settings</Link> shows what is left on each key.
              </li>
            </ul>
            <Note warn>Revoking a rein makes the key unknown to the contract. Also delete it from your account so it stops consuming allowance; the console does both.</Note>
          </Section>

          {/* ---- Approvals ---- */}
          <Section id="approvals" title="Owner Approvals">
            <p className="docp">
              A payment above <code>approval_above</code> (and within every other rule) becomes a request instead. You
              approve it in <Link href="/settings">Settings</Link> with your wallet; the contract checks every other rule
              again and pays. Requests expire after 24 hours, and a rein can hold at most 4 open ones.
            </p>
          </Section>

          {/* ---- Sub-reins ---- */}
          <Section id="subreins" title="Sub-Reins & Revocation">
            <p className="docp">
              An agent can split its allowance with <code>issue_subrein</code>: the child&apos;s budget and cap may only be
              narrower, depth is at most 3 and a rein has at most 8 children. Spending by a sub-rein counts against every
              ancestor. The sub-agent&apos;s key only works once you add it to your account, so an agent can split its
              allowance but never mint a new one.
            </p>
            <p className="docp">Revoking a rein revokes its whole subtree; <code>revoke_all</code> revokes every rein you own.</p>
          </Section>

          {/* ---- Guard ---- */}
          <Section id="guard" title="Counterparty Guard">
            <Table
              head={["Signal", "Source", "Level"]}
              rows={[
                ["Shared blocklist", "Reins reports_of + is_blocked", "block"],
                ["Named account does not exist", "RPC view_account", "block"],
                ["Look-alike of a known merchant", "edit distance over a homoglyph skeleton", "block"],
                ["Account younger than 7 days", "NEARBlocks account created time", "warn (info if allowlisted)"],
                ["Contract code changed in 7 days", "archival RPC view_account, then and now", "warn"],
                ["First payment to this account", "Reins pair_count", "warn (info if allowlisted)"],
              ]}
            />
            <Note>A signal that cannot be read is reported as unavailable and never counts as risk or as safety.</Note>
            <p className="docp">
              Anyone can report an account with a 0.1 NEAR bond and the sha256 of the evidence. Every owner&apos;s reins
              refuse it unless that owner calls <code>set_allow</code>. See the <Link href="/guard">Guard console</Link>.
            </p>
          </Section>

          {/* ---- Currencies ---- */}
          <Section id="currencies" title="Tokens, Chains & Accounts">
            <p className="docp">
              A rein&apos;s terms pick what it spends. With no extra field it pays NEAR from your vault. With{" "}
              <code>token</code> set to a NEP-141 contract (tUSD on the demo) it pays that token with <code>ft_transfer</code>{" "}
              from your token vault; fund it with the token&apos;s <code>ft_transfer_call</code> to the Reins contract. With{" "}
              <code>evm_chain_id</code> set (84532, Base Sepolia) the agent calls <code>pay_evm</code>: the contract checks the
              rein and asks NEAR&apos;s Chain Signatures network (<code>v1.signer-prod.testnet</code>) to sign the EVM
              payment from an address derived for that rein. Amounts are in the currency&apos;s smallest unit.
            </p>
            <p className="docp">
              Pass <code>agent_account</code> to <code>create_rein</code> to put the agent&apos;s key on a named sub-account
              such as <code>research.you.testnet</code> instead of your own account. The Connect wizard creates the
              sub-account, funds its storage and adds the key in the same wallet approval.
            </p>
          </Section>

          {/* ---- Intents ---- */}
          <Section id="intents" title="Cross-Chain Quotes">
            <p className="docp">
              <code>quote_cross_chain</code> asks the NEAR Intents 1Click API for a <code>dry: true</code> quote: what paying a
              merchant on another chain would cost from NEAR. No deposit address is issued and nothing moves. Intents has no
              testnet, so quotes are mainnet prices.
            </p>
          </Section>

          {/* ---- Contract ---- */}
          <Section id="contract" title="Contract Methods">
            <Table
              head={["Method", "Who", "Notes"]}
              rows={[
                ["deposit / withdraw", "owner", "attach NEAR / 1 yocto"],
                ["create_rein / create_subrein", "owner", "attach storage (about 0.02 NEAR)"],
                ["update_terms · freeze · unfreeze · revoke · revoke_all", "owner", "1 yocto"],
                ["approve_request · reject_request · set_allow", "owner", "1 yocto"],
                ["pay · pay_evm · request_approval · issue_subrein", "agent key", "no deposit"],
                ["withdraw_token", "owner", "1 yocto"],
                ["ft_on_transfer", "token contract", "credits your token vault"],
                ["report · retract_report", "anyone", "0.1 NEAR bond · 1 yocto"],
                ["preview_pay · get_rein · reins_of · rein_for_key · vault_of", "view", "free"],
                ["pending_requests_of · reports_of · is_blocked · pair_count · stats", "view", "free"],
              ].map(([m, w, n]) => [<code key={m}>{m}</code>, w, n])}
            />
          </Section>

          {/* ---- Events ---- */}
          <Section id="events" title="Events">
            <p className="docp">
              Every state change logs one NEP-297 line, <code>EVENT_JSON:&#123;&quot;standard&quot;:&quot;reins&quot;,…&#125;</code>:
              rein_created, payment, payment_failed, approval_requested, approved, rejected, frozen, unfrozen, revoked,
              terms_updated, deposit, withdraw, reported, report_retracted, allow_set. The contract keeps no payment history
              in state; the events are the history.
            </p>
          </Section>

          {/* ---- SDK ---- */}
          <Section id="sdk" title="SDK & CLI">
            <Code code={`import { ReinsClient, AgentClient, checkCounterparty } from "@reins/sdk";

const reins = new ReinsClient("${CONTRACT_ID}");
await reins.previewPay(owner, agentPublicKey, "shop.testnet", amountYocto);

const agent = new AgentClient(owner, agentSecret, provider, "${CONTRACT_ID}");
await agent.guardedPay({ receiver: "shop.testnet", amountNear: "0.05", askHuman });`} />
            <Code code={`bun run reins status        # vault, reins, pending approvals
bun run reins approve 3     # approve request 3 with your full-access key
bun run reins panic         # revoke every rein`} />
          </Section>

          {/* ---- Verify ---- */}
          <Section id="verify" title="Verify It Yourself">
            <Code code={`cargo test -p reins          # contract unit tests
bun test packages            # SDK and MCP tests
bun run verify               # keyless: re-reads every recorded tx from the chain`} />
            <hr className="docrule" />
            <p className="docp">
              Ready? <Link href="/app">Open the console</Link> — the demo owner&apos;s reins are readable without signing in.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}
