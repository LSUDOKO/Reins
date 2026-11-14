"use client";

// The landing page: a creative studio's moodboard for a spending-limits product. One
// centered hero (badge, display headline with a highlighted word, subhead, CTA
// stack, backed-by strip), then sections that breathe at 80px: how a payment
// works, the sticky-note feature grid, the connect block, a yellow closing band, a short footer.
// Everything here is real copy about the real product; nothing links to "#".

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, type Variants } from "motion/react";
import { useWallet } from "@/lib/near";
import { Logo } from "./Logo";
import { ThemeToggle } from "./Theme";
import { SketchArrow, SketchCircle, SketchLoop, SketchStar } from "./Sketch";

const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

/** The floating pill nav, shared by the landing page and the public pages. */
export function PublicNav({ links = true }: { links?: boolean }) {
  const path = usePathname();
  const { accountId } = useWallet();
  const dash = accountId ? "Open dashboard" : "Open the demo";
  return (
    <div className="lpnav-wrap">
      <nav className="lpnav" aria-label="Primary">
        <Logo href="/" />
        {links && (
          <div className="navlinks">
            <a className="navlink" href="/#how">
              How it works
            </a>
            <a className="navlink" href="/#features">
              Product
            </a>
            <a className="navlink" href="/#connect">
              Connect
            </a>
            <Link className={`navlink${path?.startsWith("/docs") ? " on" : ""}`} href="/docs">
              Docs
            </Link>
          </div>
        )}
        <div className="ctas">
          <ThemeToggle />
          <Link className="abtn outline" href="/docs">
            Docs
          </Link>
          <Link className="abtn primary arrow" href="/app" data-testid="landing-open">
            {dash}
          </Link>
        </div>
      </nav>
    </div>
  );
}

export function Landing() {
  return (
    <div className="lp">
      <PublicNav />

      {/* ---- hero ---- */}
      <header className="lphero lpwrap">
        <SketchArrow className="sk1" size={150} />
        <SketchStar className="sk2" size={70} />
        <SketchLoop className="sk3" size={170} />
        <SketchCircle className="sk4" size={100} />
        <motion.div variants={stagger} initial="hidden" animate="show">
          <motion.span className="lpbadge" variants={rise}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 1.5 3.5 9h4l-1 5.5L12 7H8z" />
            </svg>
            Spending limits for AI agents · live on NEAR testnet
          </motion.span>
          <motion.h1 className="lph1" variants={rise}>
            Give your agent a <span className="hl wash">rein</span>, not your keys.
          </motion.h1>
          <motion.p className="lpsub" variants={rise}>
            A rein is a NEAR function-call key on your account that can call three methods of one contract and can never
            attach a deposit. The Reins contract holds the rules — budget per window, per-payment cap, approvals, merchant
            lock, a shared blocklist — and checks every payment. Revoke it and the key is dead.
          </motion.p>
          <motion.div className="lpctas" variants={rise}>
            <Link className="abtn primary big arrow" href="/app" data-testid="landing-cta">
              Open the console
            </Link>
            <Link className="abtn pastel big" href="/docs">
              Read the docs
            </Link>
          </motion.div>
          <motion.p className="lpreassure" variants={rise}>
            read-only without signing in · sign in with any NEAR wallet to manage your own reins.
          </motion.p>
          <motion.div className="lpbacked" variants={rise} aria-label="Built on">
            <span className="bl">Built on:</span>
            <span>NEAR</span>
            <span>Function-call keys</span>
            <span>NEP-297 events</span>
            <span>NEAR Intents</span>
            <span>Wallet Selector</span>
            <span>MCP</span>
          </motion.div>
        </motion.div>
      </header>

      {/* ---- how a payment works ---- */}
      <Section id="how" eyebrow="How a payment works" title={<>Three moves, and the agent never holds your keys.</>}>
        <div className="steps">
          {[
            {
              n: "01",
              t: "You create a rein",
              p: (
                <>
                  Set the terms — budget per window, per-payment cap, approval threshold, merchant lock, expiry — or draft
                  them in plain language. Your wallet signs <code>create_rein</code>, then <span className="hl">adds the agent key</span>{" "}
                  to your account as a function-call key.
                </>
              ),
            },
            {
              n: "02",
              t: "The agent plugs in",
              p: (
                <>
                  One <code>claude mcp add</code> with the agent&apos;s key. Before paying, the MCP server checks the receiver:
                  blocklist, account age, code changes, history, look-alike names. Block refuses; warn asks you.
                </>
              ),
            },
            {
              n: "03",
              t: "The contract decides",
              p: (
                <>
                  <code>pay</code> is checked against every rule on-chain and sent from your vault. A failed transfer
                  rolls the budget back. Every step leaves a <span className="hl">NEP-297 event</span> anyone can read.
                </>
              ),
            },
          ].map((s) => (
            <motion.div key={s.n} className="step" variants={rise}>
              <span className="sn">{s.n}</span>
              <h3>{s.t}</h3>
              <p>{s.p}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ---- features as sticky notes ---- */}
      <Section id="features" eyebrow="What a rein can do" title={<>Everything a spending limit should be, <span className="hl">held</span> by the chain.</>}>
        <div className="notes">
          <Note k="Scope" tone="mint" title="Terms the contract enforces" foot="Reins contract · NEAR testnet">
            Budget per window or lifetime, per-payment cap, merchant lock, expiry, usage count. The agent key can only
            call <code>pay</code>, <code>request_approval</code> and <code>issue_subrein</code>.
          </Note>
          <Note k="Human" title="You approve the big ones" foot="request_approval · approve_request">
            Above your threshold the agent files a request instead of paying. You approve with a full-access key; the
            contract re-checks every other rule before the money moves.
          </Note>
          <Note k="Kill switch" tone="teal" title="Freeze, revoke, revoke all" foot="one transaction each">
            Freeze a rein for a moment, revoke it and its whole sub-rein tree for good, or revoke every rein you own in
            one transaction.
          </Note>
          <Note k="Guard" title="A blocklist with evidence" foot="bonded reports · per-owner override">
            Anyone can report a drain address with a bond and a hash of the evidence. Every rein refuses to pay it unless
            its owner explicitly allows it.
          </Note>
          <Note k="Sub-agents" title="Agents split, never mint" foot="issue_subrein · owner adds the key">
            An agent can carve a narrower rein for a sub-agent. It only works once you add the sub-agent&apos;s key, and
            its spending counts against every ancestor.
          </Note>
        </div>
      </Section>

      {/* ---- connect ---- */}
      <Section id="connect" eyebrow="Connecting an agent" title={<>One line in any harness.</>}>
        <div className="lpsplit rev" style={{ marginTop: 32 }}>
          <div>
            <pre className="lpcode">{`# the agent's key is shown once, when you create the rein
claude mcp add reins \
  -e REINS_OWNER=you.testnet \
  -e `}<span className="y">REINS_AGENT_KEY=ed25519:&lt;agent-secret&gt;</span>{` \
  -- bun run Reins/packages/mcp/src/index.ts
`}<span className="c"># tools: rein_status, check_counterparty, preview_payment,
# pay, approval_status, issue_subrein, quote_cross_chain</span></pre>
            <div className="lpharness">
              {["Claude Code", "Codex", "Cursor", "VS Code", "Goose", "any MCP client"].map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="lplede">
              The key <em>is</em> the connection. It lives on your account, but NEAR itself stops it from attaching a
              deposit, adding keys or calling any other method — the protocol, not a promise.
            </p>
            <p className="lplede" style={{ marginTop: 12 }}>
              Refusals are typed — <code>over_per_tx_cap</code>, <code>receiver_blocked</code>, <code>needs_approval</code>{" "}
              — so an agent can relay them honestly instead of guessing.
            </p>
          </div>
        </div>
      </Section>

      {/* ---- closing band ---- */}
      <div className="lpwrap">
        <motion.div className="lpband" variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
          <SketchArrow className="sk" size={140} />
          <h2 className="lph2">Your agent&apos;s first rein takes about a minute.</h2>
          <p className="lplede">NEAR testnet. Look around the demo owner&apos;s reins without signing in.</p>
          <div className="lpctas">
            <Link className="abtn primary big arrow" href="/app">
              Open the console
            </Link>
            <Link className="abtn big" href="/docs">
              Read the docs
            </Link>
          </div>
        </motion.div>

        <footer className="lpfoot">
          <Logo size="sm" />
          <nav aria-label="Footer">
            <Link href="/docs">Docs</Link>
            <a href="https://github.com/LSUDOKO/Reins" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="https://github.com/LSUDOKO/Reins/blob/main/LICENSE" target="_blank" rel="noreferrer">
              License
            </a>
          </nav>
          <span className="fine">NEAR testnet · built at NEAR HACKATHON</span>
        </footer>
      </div>
    </div>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.section
      id={id}
      className="lpsec lpwrap"
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      style={{ scrollMarginTop: 96 }}
    >
      <motion.div className="lpeyebrow" variants={rise}>
        {eyebrow}
      </motion.div>
      <motion.h2 className="lph2" variants={rise}>
        {title}
      </motion.h2>
      {children}
    </motion.section>
  );
}

function Note({ k, tone, title, foot, children }: { k: string; tone?: "mint" | "teal" | "blush" | "yellow"; title: string; foot: string; children: React.ReactNode }) {
  return (
    <motion.article className={`note${tone ? ` ${tone}` : ""}`} variants={rise}>
      <span className="nk">{k}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      <span className="nfoot">{foot}</span>
    </motion.article>
  );
}
