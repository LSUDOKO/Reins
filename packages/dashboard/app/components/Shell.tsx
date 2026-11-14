"use client";

// The shell: a quiet left rail instead of a navbar. Wordmark up top (and the
// back affordance, on rein pages); the bottom stack carries the network dot,
// the theme toggle, and the avatar. The avatar menu opens rightward; the
// owner-level danger verb (revoke all) lives there and walks the DangerModal
// staircase; the modal is mounted outside the menu so it survives the menu
// closing. The content column owns the rest of the viewport.
//
// The menu PORTALS to document.body (the house rule for every floating
// surface): the sticky rail is a stacking context at z auto, so anything
// absolutely positioned inside it paints UNDER the content column no matter
// its z-index.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@/lib/api";
import { CHAIN_NAME, CONTRACT_ID, txUrl } from "@/lib/chain";
import type { Wallet } from "@/lib/near";
import { copyText, IconCheck, IconCopy, shortHex } from "./ui";
import { ThemeToggle } from "./Theme";
import { Logo } from "./Logo";
import { DangerModal, type DangerPhase } from "./Confirm";


export function Cockpit({
  back,
  wallet,
  refresh,
  onLogout,
  address,
  nukeable = false,
  aggregate,
  children,
}: {
  back?: { href: string; label: string };
  wallet: Wallet;
  refresh: () => void | Promise<void>;
  onLogout?: () => void;
  address?: string;
  nukeable?: boolean; // the signed-in owner has live reins: revoke-all shows in the avatar menu
  aggregate?: string; // the owner-level fact line ("2 live reins · Ⓝ1.50 / day on reins")
  children: React.ReactNode;
}) {
  const path = usePathname();
  const here = (p: string) => (p === "/app" ? path?.startsWith("/app") || path?.startsWith("/rein") : path?.startsWith(p));
  return (
    <div className="app">
      <aside className="rail">
        <Logo href="/app" />
        <nav className="navlinks" aria-label="Sections">
          <Link className={`navlink${here("/app") ? " on" : ""}`} href="/app">
            Reins
          </Link>
          <Link className={`navlink${here("/guard") ? " on" : ""}`} href="/guard">
            Guard
          </Link>
          <Link className={`navlink${here("/settings") ? " on" : ""}`} href="/settings">
            Settings
          </Link>
          <Link className={`navlink${here("/docs") ? " on" : ""}`} href="/docs">
            Docs
          </Link>
        </nav>
        {back && (
          <Link className="railback" href={back.href} title={back.label} aria-label={back.label}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
        )}
        <div className="railfoot">
          {/* the reference: a quiet link out to /docs, riding the same utility tier
              as the network dot and the theme toggle */}
          {/* the network mark, at rest · no pulse: the network is a fact, not an alarm */}
          <span className="net" title={CHAIN_NAME} aria-label={CHAIN_NAME}>
            <svg viewBox="0 0 16 16" aria-hidden>
              <circle cx="8" cy="8" r="7" fill="currentColor" />
              <rect x="1" y="7.2" width="8.6" height="1.6" fill="var(--page)" />
            </svg>
          </span>
          <ThemeToggle />
          <ProfileMenu
            address={address}
            onLogout={onLogout}
            wallet={wallet}
            refresh={refresh}
            nukeable={nukeable}
            aggregate={aggregate}
          />
        </div>
      </aside>
      <div className="maincol">{children}</div>
    </div>
  );
}

// Avatar menu (rail bottom): the owner account, its vault, sign in / out, and
// revoke-all. Revoke-all kills EVERY rein, so it confirms through the modal.

function ProfileMenu({
  address,
  onLogout,
  wallet,
  refresh,
  nukeable,
  aggregate,
}: {
  address?: string;
  onLogout?: () => void;
  wallet: Wallet;
  refresh: () => void | Promise<void>;
  nukeable: boolean;
  aggregate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [nukeOpen, setNukeOpen] = useState(false);
  // the portal needs the document; the anchor pins the fixed menu to the avatar
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // the owner's vault, read once per menu open · held across reopens
  const [vault, setVault] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => setVault(null), [address]);
  useEffect(() => {
    if (!open || !address) return;
    let live = true;
    api
      .vault(address)
      .then((v) => {
        if (live) setVault(v);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, address]);
  const bal = vault === null ? null : Number(vault);
  const balFig = bal === null ? "–" : bal > 0 && bal < 0.01 ? "<Ⓝ0.01" : `Ⓝ${bal.toFixed(2)}`;
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<React.CSSProperties | null>(null);
  // the anchor is captured at open; a resize would detach the menu from the avatar
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // wide layout: the rail anchor (menu opens rightward, pinned to the avatar's
      // bottom). Top-bar layout (<1100px): the menu drops BELOW the avatar,
      // right-aligned · the rail anchor would put it off-canvas.
      //
      // The rail anchor grows UPWARD from an avatar that sits near the bottom of the
      // viewport, so on a short window the menu ran off the top and the wallet address
      // (near its end) was unreachable. Cap the height to the space actually available
      // and let the menu scroll inside it rather than overflow the screen.
      const GUTTER = 12;
      setAnchor(
        window.innerWidth < 1100
          ? {
              right: 12,
              top: r.bottom + 10,
              maxHeight: window.innerHeight - r.bottom - 10 - GUTTER,
              transformOrigin: "right top",
            }
          : {
              left: r.right + 14,
              bottom: window.innerHeight - r.bottom - 6,
              maxHeight: r.bottom - 6 - GUTTER,
              transformOrigin: "left bottom",
            },
      );
    }
    setOpen((v) => !v);
  };
  return (
    <div className="profile">
      <button ref={btnRef} className="avatarbtn" onClick={toggle} aria-label="Account" data-testid="profile" data-tour="wallet">
        <span className="avatar" />
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && anchor && (
              <>
                <div className="scrim" onClick={() => setOpen(false)} />
                <motion.div
                  className="promenu"
                  initial={{ opacity: 0, x: -8, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1, transition: { type: "spring", stiffness: 480, damping: 34 } }}
                  exit={{ opacity: 0, x: -6, scale: 0.98, transition: { duration: 0.12 } }}
                  style={anchor}
                >
                  <div className="prowho">
                    <span className="avatar" />
                    <span className="prowhocol">
                      <span className="em">{address ? shortHex(address, 6, 4) : ""}</span>
                      {aggregate && <span className="proagg">{aggregate}</span>}
                    </span>
                  </div>
                  {address && (
                    <div className="prowallet">
                      <div className="probal">
                        <span className="probalfig" data-testid="vault-balance">
                          {balFig}
                        </span>
                        <span className="proballbl">in the vault on {CHAIN_NAME}</span>
                      </div>
                      <button
                        className={`proaddr${copied ? " done" : ""}`}
                        title="Copy the owner account"
                        data-testid="wallet-address"
                        onClick={async () => {
                          if (!(await copyText(address))) return;
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                      >
                        <span className="proaddrtext">{address}</span>
                        {copied ? <IconCheck /> : <IconCopy />}
                      </button>
                      <p className="pronote">Reins pay out of this vault, held by {CONTRACT_ID} · only a full-access key can withdraw</p>
                    </div>
                  )}
                  {!wallet.accountId && (
                    <button
                      className="proitem"
                      disabled={!wallet.ready}
                      onClick={() => {
                        setOpen(false);
                        wallet.signIn();
                      }}
                      data-testid="login"
                    >
                      Sign In With NEAR
                    </button>
                  )}
                  {onLogout && wallet.accountId && (
                    <button
                      className="proitem"
                      onClick={() => {
                        setOpen(false);
                        onLogout();
                      }}
                      data-testid="logout"
                    >
                      Sign Out
                    </button>
                  )}
                  {nukeable && (
                    <div className="prodanger">
                      <button
                        className="proitem danger"
                        onClick={() => {
                          setOpen(false);
                          setNukeOpen(true);
                        }}
                        data-testid="nuke"
                      >
                        Revoke Every Rein
                      </button>
                      <p className="pronote">One transaction revokes every rein and sub-rein this account owns</p>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
      <NukeModal wallet={wallet} onNuked={refresh} open={nukeOpen} onClose={() => setNukeOpen(false)} />
    </div>
  );
}

// Panic button: revoke_all kills every rein and sub-rein the owner has, in
// one transaction signed by the owner's wallet.

function NukeModal({
  wallet,
  onNuked,
  open,
  onClose,
}: {
  wallet: Wallet;
  onNuked: () => void | Promise<void>;
  open: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<DangerPhase>("confirm");
  const [tx, setTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setErr(null);
    try {
      setPhase("busy");
      setTx(await wallet.call("revoke_all", {}));
      setPhase("done");
      await onNuked();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  return (
    <DangerModal
      open={open}
      phase={phase}
      prefix="nuke"
      title="Revoke every rein?"
      body="One transaction revokes every rein and sub-rein this account owns. Agents holding their keys can no longer pay, permanently."
      confirmLabel="Yes, Revoke Everything"
      busyNote="One tx, killing the whole tree…"
      doneTitle="Every rein is dead"
      doneNote={
        <>
          Done. The whole tree is revoked on-chain.{" "}
          {tx && (
            <a href={txUrl(tx)} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
              {shortHex(tx, 10, 0)}
            </a>
          )}
        </>
      }
      errorNote={err ? `Revoke-all failed: ${err}` : undefined}
      onConfirm={go}
      onClose={() => {
        onClose();
        // a finished or failed run re-arms for the next open
        setPhase("confirm");
      }}
    />
  );
}
