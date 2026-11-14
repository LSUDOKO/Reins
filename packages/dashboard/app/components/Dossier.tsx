"use client";

// The dossier, centered-hero edition (the Apple Card grammar). One vertical
// axis: name + status on top → the card deck (a stack: the active card front
// and center, the next card peeking out behind its right edge · the + at the
// deck's edge issues) → the balance, big and centered → the gauge → one
// whisper caption → the static verb row.
// Below, the full-width paned zone: activity / terms / sub-reins
// behind a quiet segmented toggle. Card swaps animate ONLY the per-card
// readings (name, money, caption, open pane) with a short in-place fade;
// the verbs, tabs and carousel chrome never move.
// Every verb is a transaction the owner's NEAR wallet signs.

import { ExplainRein } from "./Plain";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import type { CardState, TreeNode } from "@/lib/api";
import type { Wallet } from "@/lib/near";
import { CardHero } from "./CardHero";
import { ConnectOverlay } from "./ConnectOverlay";
import { RevokeButton, TermsGrid, allowance, caveatCount } from "./Authority";
import { ChargeList, feedStats, type FeedRow } from "./Activity";
import { SubRows } from "./SubCards";
import {
  Barcode,
  IconSnowflake,
  StatusPill,
  fmtCountdown,
  fmtNear,
  isDead,
  periodLabel,
  splitAmount,
  useCountUp,
} from "./ui";

type Tab = "activity" | "terms" | "subs";

// the swap choreography, kept quiet: old and new content occupy the same
// grid cell and CROSS-FADE · no mode="wait", so there is never a blank frame
// between them. ONE move for every swap (card swipe and tab switch alike):
// a small rise + fade in place. The deck's own slide already says which way
// the cards went; the readings don't chase it sideways.
const swapEase = [0.22, 1, 0.36, 1] as const;
const zoneVariants: Variants = {
  enter: { opacity: 0, y: 8 },
  center: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: swapEase, staggerChildren: 0.03 },
  },
  exit: { opacity: 0, y: -5, transition: { duration: 0.18, ease: "easeOut" } },
};

const rowVariants: Variants = {
  enter: { opacity: 0, y: 6 },
  center: { opacity: 1, y: 0, transition: { duration: 0.3, ease: swapEase } },
};

export function Dossier({
  node,
  kAgent,
  kmap,
  feed,
  wallet,
  canWrite,
  refresh,
  roots,
  currentId,
  onSelect,
  onIssue,
}: {
  node: TreeNode | null; // the selected card + its direct children
  kAgent?: string;
  kmap: Map<string, string>;
  feed: FeedRow[];
  wallet: Wallet;
  canWrite: boolean; // the signed-in wallet owns these reins
  refresh: () => void | Promise<void>;
  roots: TreeNode[]; // the deck: root reins (rein pages pass just [node])
  currentId?: string | null;
  onSelect?: (cardId: string) => void; // deck selection (home only)
  onIssue?: () => void; // the + beside the dots: the ONLY create affordance
}) {
  const card = node?.card ?? null;
  const dead = card ? isDead(card.status) : false;
  const heroId = card?.card_id ?? "";

  // the bottom pane toggle survives card swaps (compare terms across cards)
  const [tab, setTab] = useState<Tab>("activity");

  // Connect opens the overlay with the rein's key and the MCP install commands ·
  // switching reins closes it.
  const [connectOpen, setConnectOpen] = useState(false);
  useEffect(() => setConnectOpen(false), [heroId]);
  const closeConnect = useCallback(() => setConnectOpen(false), []);
  const connect = heroId ? async () => setConnectOpen(true) : undefined;

  // the pane toggle row · labels only: the panes carry their own numbers
  const kids = node?.children ?? [];
  const tabs: { key: Tab; label: string; disabled?: boolean }[] = [
    { key: "activity", label: "Activity" },
    { key: "terms", label: "Terms", disabled: !card },
    { key: "subs", label: "Sub-Reins", disabled: !card },
  ];

  return (
    <main className={`deck${dead ? " dead" : ""}`}>
      <section className="hero">
        {card && (
          <div className="heroid-wrap">
            <AnimatePresence initial={false}>
              <motion.div
                key={card.card_id}
                className="heroid"
                variants={zoneVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <h1>{card.name}</h1>
                <StatusPill status={card.status} />
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        <Carousel
          roots={roots}
          currentId={currentId ?? heroId}
          kmap={kmap}
          kAgent={kAgent}
          onSelect={onSelect}
          onIssue={onIssue}
        />

        {card ? (
          <>
            <div className="dbody-wrap" data-tour="readings">
              <AnimatePresence initial={false}>
                <HeadBody key={card.card_id} card={card} />
              </AnimatePresence>
            </div>

            <Verbs
              card={card}
              wallet={wallet}
              canWrite={canWrite}
              refresh={refresh}
              onConnect={connect}
            />
            <div style={{ maxWidth: 640, margin: "6px auto 0", textAlign: "left" }}>
              <ExplainRein terms={card.raw.terms} label={card.name} />
            </div>
          </>
        ) : (
          <div className="heroempty">
            <h1>No Reins Yet</h1>
            <p>Create your first rein and hand its key to an agent · scoped, revocable, dead on revoke</p>
            {onIssue && (
              <button className="dbtn heroissue" onClick={onIssue} data-testid="empty-issue">
                Create Your First Rein
              </button>
            )}
          </div>
        )}
      </section>

      <div className="bottom">
        <div className="tabrow" role="tablist" aria-label="Rein details" data-tour="panes">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`tabbtn${tab === t.key ? " on" : ""}`}
              disabled={t.disabled}
              onClick={() => setTab(t.key)}
              data-testid={`pane-${t.key}`}
            >
              {tab === t.key && (
                <motion.span
                  layoutId="paneind"
                  className="tabind"
                  transition={{ type: "spring", stiffness: 560, damping: 44 }}
                />
              )}
              <span className="t">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="tabbody">
          <AnimatePresence initial={false}>
            <motion.div
              key={`${heroId || "empty"}:${tab}`}
              className="pane"
              variants={zoneVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {tab === "activity" && <ActivityPane card={card} feed={feed} />}
              {tab === "terms" && card && <TermsPane card={card} kAgent={kAgent} />}
              {tab === "subs" && card && node && <SubsPane card={card} node={node} kmap={kmap} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {card && connectOpen && <ConnectOverlay key="connect" card={card} onClose={closeConnect} />}
      </AnimatePresence>
    </main>
  );
}

// ---------------------------------------------------------------------------
// the deck: a stack, not a strip. The active card sits front and center; the
// NEXT card peeks out behind its right edge · one uniform sliver, just enough
// to say "there's more". Passed cards tuck away invisibly to the left.
// Navigate by dragging the active card, swiping the trackpad, clicking the
// peek, or the dots; the + floating at the deck's right edge ("another card
// could live here") issues a new card.
// ---------------------------------------------------------------------------

// the pose for a slide at distance d from the active card
function deckPose(d: number) {
  if (d === 0) return { x: 0, scale: 1, opacity: 1 };
  if (d < 0) return { x: -20, scale: 0.94, opacity: 0 }; // passed: tucked away left
  if (d === 1) return { x: 26, scale: 0.94, opacity: 1 }; // the peek
  return { x: 40, scale: 0.94, opacity: 0 }; // the deep tail waits just beyond
}

function Carousel({
  roots,
  currentId,
  kmap,
  kAgent,
  onSelect,
  onIssue,
}: {
  roots: TreeNode[];
  currentId?: string | null;
  kmap: Map<string, string>;
  kAgent?: string;
  onSelect?: (cardId: string) => void;
  onIssue?: () => void;
}) {
  const idx = Math.max(0, roots.findIndex((n) => n.card.card_id === currentId));
  const [flipped, setFlipped] = useState(false);
  useEffect(() => setFlipped(false), [currentId]);
  // a drag must not leak its release as a click (which would flip the card)
  const dragged = useRef(false);
  // trackpad swipes arrive as a wheel stream: one step per gesture
  const wheelLock = useRef(0);
  const stackRef = useRef<HTMLDivElement>(null);

  const goTo = (i: number) => {
    if (!onSelect || i < 0 || i >= roots.length) return;
    if (roots[i].card.card_id !== currentId) onSelect(roots[i].card.card_id);
  };

  // React attaches wheel listeners passively, so a JSX onWheel can't
  // preventDefault · and without it the swipe rubber-bands the whole page.
  // A native non-passive listener lets the deck consume horizontal swipes.
  const navRef = useRef<(dx: number) => void>(() => {});
  navRef.current = (dx: number) => goTo(idx + (dx > 0 ? 1 : -1));
  // deps include roots.length: on first mount the deck may render empty
  // (data still loading), and the listener must attach once .stack appears
  const canWheel = !!onSelect;
  const hasStack = roots.length > 0;
  useEffect(() => {
    const el = stackRef.current;
    if (!el || !canWheel) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical scrolls pass through
      e.preventDefault();
      const now = performance.now();
      if (Math.abs(e.deltaX) < 24 || now - wheelLock.current < 450) return;
      wheelLock.current = now;
      navRef.current(e.deltaX);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [canWheel, hasStack]);

  if (roots.length === 0) {
    return <div className="bayempty">The bay is empty · your first rein appears here</div>;
  }

  return (
    <div className="bay" data-tour="deck">
      <div className="stack" ref={stackRef}>
        {roots.map((n, i) => {
          const d = i - idx;
          const active = d === 0;
          return (
            <motion.div
              key={n.card.card_id}
              className={`slide${active ? "" : " off"}${isDead(n.card.status) ? " dead" : ""}`}
              style={{
                zIndex: roots.length - Math.abs(d),
                pointerEvents: d < 0 || d > 1 ? "none" : undefined,
              }}
              initial={false}
              animate={deckPose(d)}
              transition={{ duration: 0.42, ease: swapEase }}
              drag={active && onSelect ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.14}
              onDragStart={() => {
                dragged.current = true;
              }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -56 || info.velocity.x < -420) goTo(idx + 1);
                else if (info.offset.x > 56 || info.velocity.x > 420) goTo(idx - 1);
                // the click this drag releases fires after dragend · swallow it, then re-arm
                setTimeout(() => {
                  dragged.current = false;
                }, 0);
              }}
              onClickCapture={
                active
                  ? (e) => {
                      if (dragged.current) {
                        e.stopPropagation();
                        e.preventDefault();
                      }
                    }
                  : !onSelect
                    ? undefined
                    : (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        goTo(i);
                      }
              }
              data-testid={`nav-${n.card.name}`}
            >
              <CardHero
                card={n.card}
                holder={n.card.name}
                agentAddress={kmap.get(n.card.card_id) ?? (active ? kAgent : undefined)}
                flipped={active && flipped}
                onFlip={() => active && setFlipped((f) => !f)}
              />
            </motion.div>
          );
        })}
        {onIssue && (
          <button
            className="deckplus"
            onClick={onIssue}
            data-testid="issue-open"
            aria-haspopup="dialog"
            aria-label="Create a new rein"
            title="Create a new rein"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
      {roots.length > 1 && (
        <div className="cdots">
          {roots.map((n, i) => (
            <button
              key={n.card.card_id}
              className={`cdot${i === idx ? " on" : ""}`}
              onClick={() => goTo(i)}
              aria-label={`Show ${n.card.name}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** "2 live reins · Ⓝ1.50 / day held" · the owner aggregate (profile menu) */
export function bayAggregate(roots: TreeNode[]): string {
  const live = roots.filter((n) => !isDead(n.card.status));
  if (live.length === 0) return "No live reins";
  const cards = `${live.length} live rein${live.length === 1 ? "" : "s"}`;
  let sum = 0;
  const periods = new Set<string>();
  for (const n of live) {
    const p = n.card.terms.pay?.period;
    const l = n.card.terms.pay?.lifetime;
    if (p) {
      sum += parseFloat(p.amount) || 0;
      periods.add(periodLabel(p.seconds));
    } else if (l) {
      sum += parseFloat(l.amount) || 0;
      periods.add("lifetime");
    }
  }
  if (sum === 0) return cards;
  const suffix = periods.size === 1 ? (periods.has("lifetime") ? " lifetime" : ` / ${[...periods][0]}`) : "";
  return `${cards} · ${fmtNear(sum)}${suffix} on reins`;
}

// ---------------------------------------------------------------------------
// the static instrument panel: same verbs for every card, never remounts ·
// only its props (status, handlers) follow the selection
// ---------------------------------------------------------------------------

function Verbs({
  card,
  wallet,
  canWrite,
  refresh,
  onConnect,
}: {
  card: CardState;
  wallet: Wallet;
  canWrite: boolean;
  refresh: () => void | Promise<void>;
  onConnect?: () => Promise<void>;
}) {
  const dead = isDead(card.status);
  const frozen = card.status === "frozen";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // a verb error belongs to the rein it fired on, not the next selection
  useEffect(() => setMsg(null), [card.card_id]);

  const act = (method: string, label: string) => async () => {
    setBusy(true);
    setMsg(null);
    try {
      await wallet.call(method, { id: Number(card.card_id) });
      await refresh();
    } catch (e) {
      setMsg(`${label} failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };
  const lock = canWrite ? undefined : "Sign in as the owner to do this";

  return (
    <div className="verbcol" data-tour="verbs">
      <div className="verbs">
        <button className="vpill primary" disabled={dead || !onConnect} onClick={() => void onConnect?.()} data-testid="reveal-key">
          <IconConnect />
          Connect Agent
        </button>
        {!dead && card.status === "active" && (
          <button className="vpill" disabled={busy || !canWrite} onClick={act("freeze", "Freeze")} data-testid="freeze" title={lock ?? "Freeze this rein"}>
            <IconSnowflake size={13} />
            Freeze
          </button>
        )}
        {(dead || frozen) && (
          <button
            className={`vpill${frozen ? " iced" : ""}`}
            disabled={dead || busy || !canWrite}
            onClick={act("unfreeze", "Unfreeze")}
            data-testid="unfreeze"
            title={lock ?? "Unfreeze this rein"}
          >
            <IconSnowflake size={13} />
            {frozen ? "Unfreeze" : "Freeze"}
          </button>
        )}
        {/* stays mounted across the status flip so its done state survives */}
        <RevokeButton card={card} revocable={!dead} wallet={wallet} canWrite={canWrite} onDone={refresh} />
      </div>
      {msg && <p className="err verbmsg">{msg}</p>}
    </div>
  );
}

function IconConnect() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 14l8.5-8.5M13 5h6v6" />
      <path d="M19 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// the per-card readings: the balance (big, centered), the gauge, and ONE
// whisper caption · the old label, % pill and 3-fact stats band all
// collapsed into it. Remounted per card for the odometer.
// ---------------------------------------------------------------------------

function HeadBody({ card }: { card: CardState }) {
  const dead = isDead(card.status);
  const frozen = card.status === "frozen";
  const { cap, remaining, spentPct } = allowance(card);

  // the headline figure: a dead rein shows its cap, ghosted (the epitaph state)
  const figTarget = dead ? (cap ?? 0) : (remaining ?? 0);
  const animated = useCountUp(figTarget);
  const [whole, cents] = splitAmount(animated);

  const plabel = card.terms.pay?.period ? periodLabel(card.terms.pay.period.seconds) : null;
  const span = plabel === "day" ? "today" : plabel === "wk" ? "this week" : plabel === "mo" ? "this month" : "lifetime";
  const scope = `of Ⓝ${(cap ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${span}`;

  const when = dead
    ? card.status === "expired" && card.expires_at
      ? `expired ${new Date(card.expires_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : `${card.status} · the key is dead on-chain`
    : frozen
      ? "frozen · payments refuse until unfrozen"
      : card.period_resets_at
        ? `resets in ${fmtCountdown(card.period_resets_at)}`
        : card.expires_at
          ? `expires in ${fmtCountdown(card.expires_at)}`
          : "no expiry";

  // the gauge is a fuel gauge: full when untouched, draining toward empty
  const leftPct = Math.max(0, 100 - spentPct);

  return (
    <motion.div className="dbody" variants={zoneVariants} initial="enter" animate="center" exit="exit">
      <motion.div className="money num" variants={rowVariants}>
        <div className="fig">
          <span data-testid="remaining">
            <span className="cur">Ⓝ</span>
            <span className="int">{whole}</span>
            <span className="dec">.{cents}</span>
          </span>
        </div>
        <div className="gaugerow">
          <div className="gauge">
            <div className="fill" style={{ width: dead ? "0%" : `${leftPct}%` }} />
          </div>
        </div>
        <div className="caption">
          {scope} · {when}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// the bottom panes: activity / terms / sub-reins, one at a time
// ---------------------------------------------------------------------------

function ActivityPane({ card, feed }: { card: CardState | null; feed: FeedRow[] }) {
  const { bins, binLabels, dayLabels } = feedStats(feed);
  const dead = card ? isDead(card.status) : false;
  const empty = !card
    ? "No activity yet · create a rein to begin"
    : dead
      ? `No activity · rein ${card.status}`
      : "No recorded payments yet · connect an agent and let it spend";

  return (
    <>
      <motion.div className="dr chartblock" variants={rowVariants}>
        <div className="chead">
          <div>
            <h2>Daily Spend</h2>
            <span className="sub">Last 30 days</span>
          </div>
          <span className="range num">
            {dayLabels[0]} – {dayLabels[29]}
          </span>
        </div>
        <Barcode values={bins} labels={binLabels} width={1200} height={86} />
        <div className="axisrow num">
          {[0, 7, 14, 21, 29].map((d) => (
            <span key={d} style={d === 0 || d === 29 ? undefined : { left: `${((d + 0.5) / 30) * 100}%` }}>
              {dayLabels[d]}
            </span>
          ))}
        </div>
      </motion.div>
      <motion.div className="dr listwrap" variants={rowVariants}>
        <ChargeList rows={feed} empty={empty} />
      </motion.div>
    </>
  );
}

function TermsPane({ card, kAgent }: { card: CardState; kAgent?: string }) {
  const dead = isDead(card.status);
  return (
    <motion.div className="dr panein" variants={rowVariants}>
      <p className="panenote">
        {dead
          ? "Enforcement ended · the contract no longer knows this key"
          : `${caveatCount(card)} rules enforced by the contract on every payment · nothing here is a promise`}
      </p>
      <TermsGrid card={card} agentAddress={kAgent} />
    </motion.div>
  );
}

function SubsPane({ card, node, kmap }: { card: CardState; node: TreeNode; kmap: Map<string, string> }) {
  const dead = isDead(card.status);
  const allowed = card.terms.subcards !== false;
  const kids = node.children;

  return (
    <motion.div className="dr panein" variants={rowVariants}>
      {allowed && kids.length > 0 ? (
        <SubRows node={node} kmap={kmap} />
      ) : (
        <div className="subnote">
          {!allowed
            ? "Terms on this rein don't permit sub-reins"
            : dead
              ? "None carved before revoke · the tree is empty"
              : "None yet · the agent holding this rein carves them itself (the issue_subrein tool), then you add the sub-agent's key to your account · caps only narrow downward, and they appear here"}
        </div>
      )}
    </motion.div>
  );
}
