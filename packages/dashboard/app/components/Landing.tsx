"use client";

// The landing page, laid out like a field poster set: a cream sheet on the green
// page with the nav inside it and a brush-marked headline surrounded by doodles;
// then a green sheet of three steps, a grid of alternating cream/green posters,
// a sage quote band, a stack of rein cards, a rules "specimen", and a close.

import Link from "next/link";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/near";
import { ReinsClient } from "@reins/sdk";
import { CONTRACT_ID, RPC_URL } from "@/lib/chain";
import { ThemeToggle } from "./Theme";
import { Brush, DAgent, DBranch, DChain, DCoin, DDots, DKey, DLeaf, DReins, DShield, SpinBadge, Sprig, Wordmark } from "./Brand";

const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };
const inView = { initial: "hidden", whileInView: "show", viewport: { once: true, margin: "-80px" } } as const;

/** Nav inside the cream sheet. Exported for the docs page. */
export function PublicNav({ links = true }: { links?: boolean }) {
  const { accountId } = useWallet();
  return (
    <nav className="bnav" aria-label="Primary">
      <Wordmark href="/" />
      {links && (
        <div className="links">
          <a href="/#how">How</a>
          <a href="/#product">Product</a>
          <a href="/#rules">Rules</a>
          <Link href="/docs">Docs</Link>
        </div>
      )}
      <div className="ctas" style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: links ? 0 : "auto" }}>
        <ThemeToggle />
        <Link className="abtn primary" href="/app" data-testid="landing-open">
          {accountId ? "Dashboard" : "Sign in"}
        </Link>
      </div>
    </nav>
  );
}

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    const c = animate(mv, to, { duration: 1.4, ease: "easeOut", onUpdate: (x) => setV(x) });
    return () => c.stop();
  }, [seen, to, mv]);
  return (
    <span ref={ref}>
      {Number.isInteger(to) ? Math.round(v) : v.toFixed(2)}
      {suffix}
    </span>
  );
}

function LiveStats() {
  const [s, setS] = useState<{ reins: number; payments: number; volume: number } | null>(null);
  useEffect(() => {
    new ReinsClient(CONTRACT_ID, RPC_URL)
      .stats()
      .then((x) => setS({ reins: x.reins, payments: x.payments, volume: Number(BigInt(x.volume) / 10n ** 20n) / 10_000 }))
      .catch(() => setS(null));
  }, []);
  if (!s) return null;
  return (
    <motion.div className="bsteps" style={{ marginTop: 36 }} variants={stagger} {...inView}>
      {[
        { n: <Counter to={s.reins} />, t: "reins created", p: `on ${CONTRACT_ID}, read live from the contract` },
        { n: <Counter to={s.payments} />, t: "payments settled", p: "each one a NEP-297 event you can look up" },
        { n: <Counter to={s.volume} suffix=" Ⓝ" />, t: "NEAR moved", p: "out of owners' vaults, never from an agent's own key" },
      ].map((x) => (
        <motion.div key={x.t} className="bstep" variants={rise}>
          <div className="n">{x.n}</div>
          <h3>{x.t}</h3>
          <p>{x.p}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const slow = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  const fast = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -140]);
  const tilt = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 18]);
  return (
    <header className="bhero" ref={ref}>
      <div className="doodles" aria-hidden>
        <motion.div style={{ y: slow }}>
          <DLeaf size={92} style={{ left: "6%", top: "8%", transform: "rotate(-20deg)" }} />
          <DCoin size={50} style={{ left: "24%", top: "6%" }} />
          <DCoin size={38} style={{ left: "31%", top: "17%" }} />
          <DKey size={110} style={{ right: "22%", top: "9%", transform: "rotate(-14deg)" }} />
          <DDots size={60} style={{ left: "16%", bottom: "26%" }} />
          <DChain size={110} style={{ right: "8%", bottom: "30%", transform: "rotate(12deg)" }} />
        </motion.div>
        <motion.div style={{ y: fast, rotate: tilt }}>
          <DAgent size={124} style={{ left: "5%", bottom: "8%" }} />
          <DShield size={86} style={{ right: "6%", top: "14%" }} />
          <DReins size={170} style={{ left: "38%", bottom: "4%" }} />
          <DLeaf size={70} style={{ right: "30%", bottom: "8%", transform: "rotate(140deg)" }} />
          <DCoin size={44} style={{ left: "14%", top: "40%" }} />
        </motion.div>
      </div>
      <motion.div className="content" variants={stagger} initial="hidden" animate="show">
        <motion.h1 variants={rise}>
          <Brush delay={0.35}>Reins for</Brush>
          <br />
          <Brush delay={0.6}>AI agents</Brush>
        </motion.h1>
        <motion.p className="sub" variants={rise}>
          Let your agent pay for APIs, data and compute on NEAR — inside a budget it cannot change. The agent gets a
          limited key; the contract keeps the rules and checks every payment.
        </motion.p>
        <motion.div className="ctas" variants={rise}>
          <Link className="abtn primary big" href="/app" data-testid="landing-cta">
            Sign in and start
          </Link>
          <Link className="abtn big" href="/app?demo=1">
            See the live demo
          </Link>
        </motion.div>
      </motion.div>
      <SpinBadge />
    </header>
  );
}

const POSTERS = [
  {
    h: "A budget it can't raise",
    p: (
      <>
        You set a spend limit per day or week, a cap per payment, an expiry and a merchant list. Only your wallet can
        change them; the agent&apos;s key can&apos;t.
      </>
    ),
    tag: "update_terms needs your wallet",
    d: <DCoin className="pdoodle" />,
  },
  {
    h: "Big buys ask first",
    p: <>Above your threshold the agent files a request instead of paying. You approve it from your phone; the contract re-checks the rest.</>,
    tag: "request_approval · approve_request",
    d: <DBranch className="pdoodle" />,
  },
  {
    h: "One tap to stop",
    p: <>Freeze a rein for a moment, revoke it and every sub-rein for good, or revoke everything you own in one transaction.</>,
    tag: "freeze · revoke · revoke_all",
    d: <DShield className="pdoodle" />,
  },
  {
    h: "Scams get shared",
    p: <>Anyone can report a drain address with a bond and proof. Every agent on Reins refuses to pay it unless its owner allows it.</>,
    tag: "bonded blocklist",
    d: <DBranch className="pdoodle" />,
  },
  {
    h: "Checks before it pays",
    p: <>Is the account new? Did its code just change? Does the name imitate one you trust? A warning asks you; a block never signs.</>,
    tag: "allow · warn · block",
    d: <DAgent className="pdoodle" />,
  },
  {
    h: "Agents split, never mint",
    p: <>An agent can hand a sub-agent a smaller rein. It only works once you add its key, and its spending counts against the parent.</>,
    tag: "issue_subrein",
    d: <DLeaf className="pdoodle" />,
  },
  {
    h: "Stablecoins too",
    p: <>A rein can budget in a NEP-141 token instead of NEAR. Deposit it once; the contract pays merchants with <code>ft_transfer</code>.</>,
    tag: "NEP-141 · tUSD on testnet",
    d: <DCoin className="pdoodle" />,
  },
  {
    h: "Pays on other chains",
    p: <>The same limits gate payments on Base Sepolia: the contract asks NEAR&apos;s MPC network to sign, and only if the rein allows it.</>,
    tag: "Chain Signatures",
    d: <DChain className="pdoodle" />,
  },
  {
    h: "Each agent, its own account",
    p: <>Give an agent a named sub-account like <code>research.you.testnet</code>. Its key lives there, never on your account.</>,
    tag: "named sub-accounts",
    d: <DKey className="pdoodle" />,
  },
];

const RULES = [
  ["Who is paying", "unknown_key", "The key that signed must be bound to a live rein on your account."],
  ["Is it on", "rein_not_active", "Frozen or revoked reins can't pay."],
  ["Per payment", "over_per_tx_cap", "No single payment above the cap, approved or not."],
  ["Per window", "over_budget", "Sub-rein spending counts against every parent too."],
  ["To whom", "receiver_blocked", "Reported accounts are refused unless you allow them."],
  ["Big ones", "needs_approval", "Above the threshold, you decide."],
];

export function Landing() {
  return (
    <div className="lp">
      <div className="bframe">
        <PublicNav />
        <Hero />

        <motion.section id="how" className="bsec green" variants={stagger} {...inView} style={{ scrollMarginTop: 24 }}>
          <motion.h2 variants={rise}>Three steps. Your keys stay home.</motion.h2>
          <motion.p className="lede" variants={rise}>
            A rein is a NEAR function-call key added to your own account. NEAR itself stops that kind of key from moving
            money directly or calling anything except the three agent methods on the Reins contract.
          </motion.p>
          <motion.div className="bsteps" variants={stagger}>
            {[
              ["1", "Describe it", <>Type what the agent may spend, in plain English. Reins turns it into terms you review, then your wallet signs <code>create_rein</code>.</>],
              ["2", "Hand over a key", <>Your wallet adds a new key that can only call <code>pay</code>, <code>request_approval</code> and <code>issue_subrein</code>. Paste it into Claude or Codex with one command.</>],
              ["3", "The chain decides", <>Each payment is checked on-chain against your rules and paid from your vault. A failed transfer puts the budget back.</>],
            ].map(([n, t, p]) => (
              <motion.div key={n as string} className="bstep" variants={rise}>
                <div className="n">{n}</div>
                <h3>{t}</h3>
                <p>{p}</p>
              </motion.div>
            ))}
          </motion.div>
          <LiveStats />
        </motion.section>

        <section id="product" style={{ scrollMarginTop: 24 }}>
          <motion.div className="posters" variants={stagger} {...inView}>
            {POSTERS.map((x) => (
              <motion.article key={x.h} className="poster" variants={rise}>
                <h3>{x.h}</h3>
                <p>{x.p}</p>
                <span className="tag">{x.tag}</span>
                {x.d}
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section className="bsec sage bquote">
          <DBranch className="leaf" size={180} style={{ left: -30, top: -20, transform: "rotate(-30deg)" }} />
          <DBranch className="leaf" size={160} style={{ right: -20, bottom: -30, transform: "rotate(150deg)" }} />
          <motion.blockquote variants={rise} {...inView}>
            The agent holds a key. The chain holds the rules.
          </motion.blockquote>
          <motion.cite variants={rise} {...inView}>
            — how Reins works, in one line
          </motion.cite>
        </section>

        <section className="bsec green">
          <div className="bstack">
            <motion.div variants={stagger} {...inView}>
              <motion.h2 variants={rise}>One rein per agent</motion.h2>
              <motion.p className="lede" variants={rise}>
                Each agent gets its own rein and its own key. Freeze one without touching the others; give a sub-agent a
                smaller one; see what each spent today.
              </motion.p>
              <motion.pre className="bcode" variants={rise} style={{ marginTop: 22 }}>
                {"claude mcp add reins \\\n  -e REINS_OWNER=you.testnet \\\n  -e "}
                <span className="y">REINS_AGENT_KEY=ed25519:…</span>
                {" \\\n  -- bun run Reins/packages/mcp/src/index.ts\n"}
                <span className="c"># tools: rein_status, check_counterparty, pay, …</span>
              </motion.pre>
            </motion.div>
            <CardStack />
          </div>
        </section>

        <section id="rules" className="bspec" style={{ scrollMarginTop: 24 }}>
          <motion.div className="left" variants={stagger} {...inView}>
            <motion.h2 variants={rise} style={{ fontSize: "clamp(30px,4vw,48px)" }}>
              The rules, in order
            </motion.h2>
            <dl>
              {RULES.map(([t, code, why]) => (
                <motion.div key={code} variants={rise}>
                  <dt>{t}</dt>
                  <dd>
                    {code.replace(/_/g, " ")}
                    <small>{why}</small>
                  </dd>
                </motion.div>
              ))}
            </dl>
          </motion.div>
          <div className="right" aria-hidden>
            <Glyphs />
          </div>
        </section>

        <section className="bclose">
          <DLeaf size={90} style={{ position: "absolute", left: "8%", top: "16%" }} />
          <DReins size={150} style={{ position: "absolute", right: "6%", top: "10%" }} />
          <motion.h2 variants={rise} {...inView} style={{ fontSize: "clamp(40px,7vw,92px)", lineHeight: 0.95 }}>
            <Brush>Give it a rein</Brush>
          </motion.h2>
          <svg className="arc" viewBox="0 0 600 100" aria-hidden>
            <defs>
              <path id="arcp" d="M10 18 Q300 120 590 18" />
            </defs>
            <text>
              <textPath href="#arcp" startOffset="50%" textAnchor="middle">
                Function-call keys • NEP-297 events
              </textPath>
            </text>
          </svg>
          <div className="ctas" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
            <Link className="abtn primary big" href="/app">
              Sign in
            </Link>
            <Link className="abtn lime big" href="/docs">
              Read the docs
            </Link>
          </div>
        </section>
      </div>

      <footer className="bfoot">
        <Wordmark onGreen size={22} />
        <nav aria-label="Footer">
          <Link href="/docs">Docs</Link>
          <a href="https://github.com/LSUDOKO/Reins" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <Link href="/guard">Guard</Link>
        </nav>
        <span className="fine">Built at NEAR HACKATHON · contract {CONTRACT_ID} on NEAR testnet</span>
      </footer>
    </div>
  );
}

function CardStack() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const spread = useTransform(scrollYProgress, [0.1, 0.55], [0, reduce ? 0 : 1]);
  const cards = [
    { name: "Research", meta: "0.5 Ⓝ / day · cap 0.2", key: "ed25519:DQRq…Rr5u" },
    { name: "Scraper", meta: "0.1 Ⓝ / day · sub-rein", key: "ed25519:DKmo…EP8m" },
    { name: "Shopper", meta: "1 Ⓝ / week · 2 merchants", key: "ed25519:wiAo…afd" },
  ];
  return (
    <div className="deck3d" ref={ref}>
      {cards.map((c, i) => (
        <StackCard key={c.name} c={c} i={i} spread={spread} />
      ))}
    </div>
  );
}

function StackCard({ c, i, spread }: { c: { name: string; meta: string; key: string }; i: number; spread: MotionValue<number> }) {
  const y = useTransform(spread, [0, 1], [i * -10, (i - 1) * 96]);
  const x = useTransform(spread, [0, 1], [i * 6, (i - 1) * 40]);
  return (
    <motion.div className="rc" style={{ rotateX: 52, rotateZ: -32, y, x, zIndex: 3 - i }}>
      <div className="rcname">
        {c.name}
        <Sprig size={22} style={{ marginLeft: 8, verticalAlign: "middle" }} />
      </div>
      <div>
        <div className="rcmeta">{c.meta}</div>
        <div className="rckey">{c.key}</div>
      </div>
    </motion.div>
  );
}

function Glyphs() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const a = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 40, reduce ? 0 : -40]);
  const b = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : -30, reduce ? 0 : 50]);
  const g = [
    { c: "R", s: { left: "6%", top: "-6%", fontSize: 300 }, y: a },
    { c: "Ⓝ", s: { right: "-4%", top: "18%", fontSize: 220 }, y: b },
    { c: "&", s: { left: "18%", bottom: "-8%", fontSize: 260 }, y: b },
    { c: "%", s: { right: "14%", bottom: "-10%", fontSize: 170 }, y: a },
  ];
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      {g.map((x) => (
        <motion.span key={x.c} style={{ ...x.s, y: x.y }}>
          {x.c}
        </motion.span>
      ))}
    </div>
  );
}
