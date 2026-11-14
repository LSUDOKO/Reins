"use client";

// Home: the owner's reins. Anyone can read a deployment (the demo owner by
// default, or ?owner=...); signing in with a NEAR wallet as that owner unlocks
// the verbs. The deck's carousel selects which root rein the dossier reads; the
// + at its edge opens the create modal (a rein being born).

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { KeyPair } from "near-api-js";
import { api, chargesFor, type TreeNode } from "@/lib/api";
import { draftFromText } from "@/lib/draft";
import { DEMO_OWNER, STORAGE_DEPOSIT_NEAR } from "@/lib/chain";
import { useWallet, nearToYocto, type Wallet } from "@/lib/near";
import { Boot } from "../components/Boot";
import { Tour, type TourStep } from "../components/Tour";
import { Cockpit } from "../components/Shell";
import { Dossier, bayAggregate } from "../components/Dossier";
import { ConnectChips, UrlBox } from "../components/Authority";
import { Select } from "../components/Select";
import type { FeedRow } from "../components/Activity";
import { ChipDots, Guilloche, IconClose, isDead, periodLabel } from "../components/ui";

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const wallet = useWallet();
  const params = useSearchParams();
  const owner = params.get("owner") ?? wallet.accountId ?? DEMO_OWNER;
  return <Dashboard wallet={wallet} owner={owner} />;
}

// ---------------------------------------------------------------------------

// the live-tour script: each step spotlights real chrome (anchored by
// data-tour attributes) over the specimen rein
const TOUR_STEPS: TourStep[] = [
  {
    key: "deck",
    target: "[data-tour=deck]",
    title: "The Deck",
    body: "Each card is a rein: spending terms bound to one agent key, held by the contract. Swipe through the stack · the + at the edge creates another.",
  },
  {
    key: "readings",
    target: "[data-tour=readings]",
    title: "The Budget",
    body: "What the rein may still spend this window · enforced by the contract, drawn down with every payment, reset on schedule.",
  },
  {
    key: "verbs",
    target: "[data-tour=verbs]",
    title: "The Verbs",
    body: "Connect hands the rein's key to an agent over MCP. Freeze pauses it. Revoke kills it for good · sub-reins die with it.",
  },
  {
    key: "panes",
    target: "[data-tour=panes]",
    title: "The Ledger",
    body: "Activity is read back from the chain. Terms is what the contract enforces. Sub-Reins is the tree your agents grow.",
  },
  {
    key: "wallet",
    target: "[data-tour=wallet]",
    title: "Your Account",
    body: "Your NEAR account, the vault the reins pay from, sign in and out · and the panic button that revokes every rein in one transaction.",
  },
];

function Dashboard({ wallet, owner }: { wallet: Wallet; owner: string }) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const canWrite = !!wallet.accountId && wallet.accountId === owner;

  const [touring, setTouring] = useState(false);
  const specimen = useMemo<TreeNode>(
    () => ({
      card: {
        card_id: "specimen",
        name: "specimen",
        status: "active",
        terms: { pay: { period: { amount: "5", seconds: 86400 } }, perTxMax: "1", subcards: true },
        remaining_this_period: "3.40",
        remaining_lifetime: null,
        period_resets_at: Math.floor(Date.now() / 1000) + 7 * 3600,
        expires_at: null,
        uses_remaining: null,
        subcards: [],
        agent_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp",
        owner,
        uses: 0,
        total_spent: "1.6",
        raw: undefined as never,
      },
      children: [],
    }),
    [owner],
  );
  const showTree = touring && tree.length === 0 ? [specimen] : tree;
  const endTour = useCallback(() => setTouring(false), []);
  const tourIssue = useCallback(() => {
    setTouring(false);
    setIssueOpen(true);
  }, []);

  const heroNode =
    (selId ? showTree.find((n) => n.card.card_id === selId) : undefined) ??
    showTree.find((n) => !isDead(n.card.status)) ??
    showTree[0] ??
    null;

  const refresh = useCallback(async () => {
    try {
      const { tree } = await api.tree(owner);
      setTree(tree);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoaded(true);
    }
  }, [owner]);

  useEffect(() => {
    setLoaded(false);
    setSelId(null);
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // Activity: the hero rein + its direct sub-reins, read back from the chain
  const heroId = heroNode?.card.card_id ?? "";
  const idsKey = heroNode ? [heroNode.card.card_id, ...heroNode.children.map((c) => c.card.card_id)].join(",") : "";
  useEffect(() => {
    setFeed([]);
    if (!idsKey || idsKey === "specimen") return;
    let live = true;
    const names = new Map<string, string>();
    if (heroNode) {
      names.set(heroNode.card.card_id, heroNode.card.name);
      for (const c of heroNode.children) names.set(c.card.card_id, c.card.name);
    }
    chargesFor(idsKey.split(","))
      .then((rows) => {
        if (live) setFeed(rows.map((ch) => ({ ch, cardName: names.get(String(ch.rein_id)) ?? `#${ch.rein_id}` })));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // heroNode is read for names only; idsKey carries the identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // ?tour=1 replays the live tour on demand
  useEffect(() => {
    if (loaded && new URLSearchParams(window.location.search).get("tour") === "1") {
      setTouring(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [loaded]);

  return (
    <>
      <Cockpit
        wallet={wallet}
        refresh={refresh}
        onLogout={() => void wallet.signOut()}
        address={owner}
        nukeable={canWrite && tree.some((n) => n.card.status === "active" || n.card.status === "frozen")}
        aggregate={loaded ? bayAggregate(tree) : undefined}
      >
        <p className="sub" style={{ margin: "0 8px 10px", fontSize: 12, color: "var(--body)" }} data-testid="viewing">
          {canWrite ? (
            <>Signed in as {owner}</>
          ) : (
            <>
              Viewing {owner} · read-only ·{" "}
              <button className="linkbtn" onClick={wallet.signIn} disabled={!wallet.ready} style={{ font: "inherit", textDecoration: "underline", background: "none", border: 0, padding: 0, color: "inherit", cursor: "pointer" }}>
                Sign in with NEAR
              </button>{" "}
              to manage your own reins
            </>
          )}
        </p>
        {error && (
          <p className="err" style={{ margin: "0 8px 10px" }}>
            RPC error: {error}
          </p>
        )}

        <Dossier
          node={heroNode}
          kmap={new Map()}
          feed={feed}
          wallet={wallet}
          canWrite={canWrite}
          refresh={refresh}
          roots={showTree}
          currentId={heroId || null}
          onSelect={setSelId}
          onIssue={canWrite ? () => setIssueOpen(true) : wallet.accountId ? undefined : wallet.signIn}
        />

        {touring && <Tour steps={TOUR_STEPS} onDone={endTour} onIssue={tourIssue} />}

        <AnimatePresence>
          {issueOpen && canWrite && (
            <IssueModal
              key="issue"
              wallet={wallet}
              owner={owner}
              firstCard={tree.length === 0}
              onIssued={refresh}
              onClose={() => setIssueOpen(false)}
            />
          )}
        </AnimatePresence>
      </Cockpit>
      <AnimatePresence>{!loaded && <Boot key="boot" progress={0.6} note="Reading reins from NEAR" />}</AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// IssueModal: "a rein being born". The plain-language line is drafted locally
// into terms (no model, no server: a small parser you can read below); the
// chips populate and a miniature card face materializes. "Review + sign" asks
// the owner's wallet for two transactions: create_rein (binds a fresh browser-
// generated key to the terms) and AddKey (puts that key on the owner account
// as a function-call key for the agent methods only). The agent's secret key is
// shown once, with the MCP install commands.
// ---------------------------------------------------------------------------

const PERIODS = [86400, 604800, 2592000];
const splitList = (s: string) =>
  s
    .split(/[,\n\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
const periodWord = (s: number) => (s <= 86400 ? "a day" : s <= 604800 ? "a week" : "per 30 days");

function IssueModal({
  wallet,
  owner,
  firstCard,
  onIssued,
  onClose,
}: {
  wallet: Wallet;
  owner: string;
  firstCard: boolean;
  onIssued: () => void | Promise<void>;
  onClose?: () => void;
}) {
  const [name, setName] = useState("research-agent");
  const [expiryDays, setExpiryDays] = useState(30);
  const [maxUses, setMaxUses] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState(86400);
  const [lifetime, setLifetime] = useState("");
  const [perTx, setPerTx] = useState("");
  const [approval, setApproval] = useState("");
  const [merchants, setMerchants] = useState("");

  const [intent, setIntent] = useState("");
  const [draftN, setDraftN] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState<null | "rein" | "key">(null);
  const [issued, setIssued] = useState<{ id: number | null; secret: string; publicKey: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);

  function draft() {
    if (!intent.trim()) return;
    const d = draftFromText(intent);
    setAmount(d.amount);
    setPeriod(PERIODS.includes(d.period) ? d.period : 86400);
    setLifetime(d.lifetime);
    setPerTx(d.perTx);
    setApproval(d.approval);
    setExpiryDays(d.expiryDays);
    setMaxUses(d.maxUses);
    setMerchants(d.merchants);
    setDraftN((n) => n + 1);
  }

  const budget = amount.trim() || lifetime.trim();
  function buildTerms() {
    const yocto = (v: string) => nearToYocto(v).toString();
    const uses = parseInt(maxUses, 10);
    return {
      budget: yocto(budget),
      period_secs: String(amount.trim() ? period : 0),
      per_tx_cap: yocto(perTx.trim() || budget),
      approval_above: approval.trim() ? yocto(approval.trim()) : null,
      expires_at: String(Math.floor(Date.now() / 1000) + expiryDays * 86400),
      max_uses: Number.isFinite(uses) && uses >= 1 ? uses : null,
      merchants: merchants.trim() ? splitList(merchants) : null,
    };
  }

  async function issue() {
    setErr(null);
    if (!budget || !(parseFloat(budget) > 0)) {
      setErr("Give the rein a budget · a per-window amount or a lifetime cap");
      return;
    }
    const kp = KeyPair.fromRandom("ed25519");
    const publicKey = kp.getPublicKey().toString();
    try {
      setBusy("rein");
      await wallet.call("create_rein", { agent_key: publicKey, label: name.trim() || "agent", terms: buildTerms() }, STORAGE_DEPOSIT_NEAR);
      setBusy("key");
      await wallet.addAgentKey(publicKey);
      const r = await api.tree(owner).catch(() => null);
      const found = r?.tree.flatMap(function walk(n): TreeNode[] { return [n, ...n.children.flatMap(walk)]; })
        .find((n) => n.card.agent_key === publicKey);
      setIssued({ id: found ? Number(found.card.card_id) : null, secret: kp.toString(), publicKey });
      await onIssued();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const drafted = draftN > 0;
  const filled = drafted || editOpen;
  const capLine = [
    amount.trim() ? `Ⓝ${amount.trim()} / ${periodLabel(period)}` : lifetime.trim() ? `Ⓝ${lifetime.trim()} lifetime` : "",
    merchants.trim() ? `${splitList(merchants).length} merchants` : "Any merchant",
  ]
    .filter(Boolean)
    .join(" · ");
  const chips: string[] = [];
  if (amount.trim()) chips.push(`Ⓝ${amount.trim()} ${periodWord(period)}`);
  if (lifetime.trim()) chips.push(`Ⓝ${lifetime.trim()} lifetime`);
  if (perTx.trim()) chips.push(`≤ Ⓝ${perTx.trim()} per payment`);
  if (approval.trim()) chips.push(`You approve above Ⓝ${approval.trim()}`);
  chips.push(merchants.trim() ? `${splitList(merchants).length} merchants` : "Any merchant");
  chips.push(`Expires ${new Date(Date.now() + expiryDays * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  if (maxUses.trim()) chips.push(`${maxUses.trim()} payments max`);

  const field = (label: string, el: React.ReactNode) => (
    <div className="field">
      <label>{label}</label>
      {el}
    </div>
  );

  return (
    <motion.div
      className="mscrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose && !busy) onClose();
      }}
    >
      <motion.div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create a New Rein"
        initial={{ opacity: 0, y: 26, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 360, damping: 30 } }}
        exit={{ opacity: 0, y: 14, scale: 0.98, transition: { duration: 0.16 } }}
      >
        <div className="mhead">
          <div>
            <div className="mtitle">{firstCard ? "Create Your First Rein" : "Create a New Rein"}</div>
            <div className="msub">Plain language, drafted into contract terms · signed by your wallet · the agent gets a function-call key, never yours</div>
          </div>
          {onClose && (
            <button className="closex" onClick={onClose} aria-label="Close" disabled={!!busy}>
              <IconClose />
            </button>
          )}
        </div>

        {issued ? (
          <div style={{ marginTop: 18 }}>
            <div className="ok" style={{ marginBottom: 8 }}>
              Rein {issued.id ? `#${issued.id} ` : ""}created · this is the agent&apos;s secret key, shown once:
            </div>
            <UrlBox url={issued.secret} testid="issued-secret" />
            <ConnectChips owner={owner} secret={issued.secret} cardName={name} />
            <p className="bchint" style={{ marginTop: 8 }}>
              The key lives on {owner} as a function-call key: it can call pay, request_approval and issue_subrein on the Reins contract, cannot attach a deposit, and has a 0.25 NEAR gas allowance.
            </p>
            <div className="mfoot">
              <button className="dbtn" onClick={() => onClose?.()}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <textarea
              className="dtext"
              value={intent}
              maxLength={600}
              autoFocus
              placeholder='Describe the rein · "1 NEAR a day, 0.2 per payment, ask me above 0.1, expires in 30 days"'
              onChange={(e) => setIntent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) draft();
              }}
              data-testid="compile-intent"
            />
            <div className="drow">
              <span className="mhint">Drafted in your browser · you review the terms before anything is signed</span>
              <button className={`dbtn${drafted ? " quiet" : ""}`} onClick={draft} disabled={!intent.trim()} data-testid="compile-go">
                Draft Terms
              </button>
            </div>

            <div className="born">
              <div className={`minicard${filled ? " fill" : ""}`}>
                <div className="mc-mark">reins</div>
                <div className="mc-chip">
                  <ChipDots />
                </div>
                <div className="mc-pan">ed25519&nbsp;&nbsp;••••&nbsp;&nbsp;••••&nbsp;&nbsp;••••</div>
                <div className="mc-name">{name || "agent"}</div>
                <div className="mc-cap num">{capLine}</div>
                <div className="mc-band">
                  <Guilloche width={520} height={64} strands={9} amp={14} animate={filled} />
                </div>
              </div>
              {filled && <TermChips key={`${draftN}-${editOpen}`} items={chips} />}
            </div>

            <button className="ordiv" onClick={() => setEditOpen((v) => !v)}>
              <span>{editOpen ? "Hide the Term Sheet" : "Edit Terms Yourself"}</span>
            </button>

            <AnimatePresence initial={false}>
              {editOpen && (
                <motion.div
                  key="termsheet"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: "auto",
                    opacity: 1,
                    transition: { height: { duration: 0.36, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.28, delay: 0.08 } },
                  }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: { height: { duration: 0.28, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.14 } },
                  }}
                  style={{ overflow: "hidden" }}
                >
                  <div className={`composer2${draftN ? " flash" : ""}`} key={draftN}>
                    <div className="csec">
                      <div className="cseclbl">Rein</div>
                      <div className="csecrow">
                        {field("Name", <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 150 }} data-testid="composer-name" />)}
                        {field(
                          "Expires · Days",
                          <input type="number" value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} style={{ width: 72 }} />,
                        )}
                        {field(
                          "Max Uses",
                          <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="∞" style={{ width: 72 }} data-testid="composer-maxuses" />,
                        )}
                      </div>
                    </div>

                    <div className="csec">
                      <div className="cseclbl">Pay · NEAR</div>
                      <div className="csecrow">
                        {field(
                          "Budget",
                          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="None" style={{ width: 92 }} data-testid="composer-amount" />,
                        )}
                        {field(
                          "Per",
                          <Select
                            value={String(period)}
                            options={[
                              { value: "86400", label: "Day" },
                              { value: "604800", label: "Week" },
                              { value: "2592000", label: "30 Days" },
                            ]}
                            onChange={(v) => setPeriod(Number(v))}
                            width={104}
                          />,
                        )}
                        {field(
                          "Lifetime Cap",
                          <input value={lifetime} onChange={(e) => setLifetime(e.target.value)} placeholder="None" style={{ width: 92 }} data-testid="composer-lifetime" />,
                        )}
                        {field("Per-Payment Max", <input value={perTx} onChange={(e) => setPerTx(e.target.value)} placeholder="Budget" style={{ width: 92 }} />)}
                        {field("Ask Me Above", <input value={approval} onChange={(e) => setApproval(e.target.value)} placeholder="Never" style={{ width: 92 }} />)}
                        {field(
                          "Merchant Lock",
                          <input value={merchants} onChange={(e) => setMerchants(e.target.value)} placeholder="shop.testnet, …" style={{ width: 170 }} />,
                        )}
                      </div>
                    </div>
                    <p className="chint">Set a per-window budget or a lifetime cap · &ldquo;ask me above&rdquo; must be below the per-payment max</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {err && (
              <p className="err" style={{ marginTop: 12 }}>
                {err}
              </p>
            )}

            <div className="mfoot">
              {onClose && (
                <button className="mghost" onClick={onClose} disabled={!!busy}>
                  Cancel
                </button>
              )}
              <button className="dbtn" onClick={issue} disabled={!!busy} data-testid="composer-issue">
                {busy === "rein" ? "Creating the rein…" : busy === "key" ? "Adding the agent key…" : "Review + Sign"}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// chips stagger in as the draft lands · mount with .in applied a frame later
function TermChips({ items }: { items: string[] }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="tchips num">
      {items.map((s, i) => (
        <span key={`${s}-${i}`} className={armed ? "in" : ""} style={{ transitionDelay: armed ? `${120 + i * 110}ms` : "0ms" }}>
          {s}
        </span>
      ))}
    </div>
  );
}
