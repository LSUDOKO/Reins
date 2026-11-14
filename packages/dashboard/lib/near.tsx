"use client";

// The owner's wallet, through NEAR Wallet Selector. The console never holds a key:
// every owner verb is a transaction the wallet signs with a FULL-ACCESS key, and
// every one attaches at least 1 yoctoNEAR, which is exactly what an agent's
// function-call key cannot do.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
// MyNearWallet is left out: it stopped approving app transactions on 2026-11-01.
import { setupHotWallet } from "@near-wallet-selector/hot-wallet";
import { setupIntearWallet } from "@near-wallet-selector/intear-wallet";
import { setupSender } from "@near-wallet-selector/sender";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { actionCreators } from "@near-js/transactions";
import { PublicKey } from "@near-js/crypto";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, type KeyPairString } from "near-api-js";
import { panicOf } from "@reins/sdk";
import { AGENT_ALLOWANCE_NEAR, AGENT_METHODS, CONTRACT_ID, NETWORK } from "./chain";

/**
 * Testnet demo session: a faucet-created testnet account whose full-access key lives only
 * in this tab's sessionStorage. MyNearWallet stopped approving app transactions on
 * 2026-11-01, so this gives judges and demos a working owner without a wallet extension.
 * Testnet only; never use it for an account that holds anything of value.
 */
const KEY_SESSION = "reins-key-session";
const FAUCET = "https://helper.nearprotocol.com/account";
const RPC = process.env.NEXT_PUBLIC_NEAR_RPC ?? "https://test.rpc.fastnear.com";
type KeySession = { accountId: string; secretKey: KeyPairString };

function loadKeySession(): KeySession | null {
  try {
    const raw = sessionStorage.getItem(KEY_SESSION);
    return raw ? (JSON.parse(raw) as KeySession) : null;
  } catch {
    return null;
  }
}

function keyAccount(k: KeySession): Account {
  return new Account(k.accountId, new JsonRpcProvider({ url: RPC }), new KeyPairSigner(KeyPair.fromString(k.secretKey)));
}

/** Create a faucet-funded testnet account with a fresh key (the faucet funds ~10 NEAR). */
export async function createDemoAccount(): Promise<KeySession> {
  const kp = KeyPair.fromRandom("ed25519");
  const accountId = `reins-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.testnet`;
  const res = await fetch(FAUCET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`faucet refused (${res.status}): ${(await res.text()).slice(0, 120)}`);
  // The account exists a block or two after the faucet answers.
  const provider = new JsonRpcProvider({ url: RPC });
  for (let i = 0; i < 20; i++) {
    try {
      await provider.viewAccount({ accountId });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return { accountId, secretKey: kp.toString() as KeyPairString };
}
import "@near-wallet-selector/modal-ui/styles.css";

const GAS = 100_000_000_000_000n; // 100 Tgas
const ONE_YOCTO = 1n;

export function nearToYocto(near: string): bigint {
  const [w, f = ""] = near.trim().split(".");
  return BigInt(w || "0") * 10n ** 24n + BigInt((f + "0".repeat(24)).slice(0, 24) || "0");
}

export type Wallet = {
  ready: boolean;
  accountId: string | null;
  /** "wallet" = a NEAR wallet through the selector; "key" = testnet demo key in this tab. */
  mode: "wallet" | "key" | null;
  signIn: () => void;
  /** Sign in with a testnet account key kept only in this tab (demo / judging). */
  signInWithKey: (accountId: string, secretKey: string) => void;
  /** Create a faucet-funded testnet account and sign in with it. */
  signInDemo: () => Promise<string>;
  signOut: () => Promise<void>;
  /** Call an owner method on the contract. Returns the tx hash; throws the contract's error code. */
  call: (method: string, args: Record<string, unknown>, depositNear?: string) => Promise<string | null>;
  /** Call any contract with an exact yoctoNEAR deposit (e.g. ft_transfer_call on a token). */
  callOn: (receiverId: string, method: string, args: Record<string, unknown>, depositYocto: bigint) => Promise<string | null>;
  /** Add `publicKey` to the owner's own account as a function-call key for the agent methods. */
  addAgentKey: (publicKey: string, allowanceNear?: string) => Promise<string | null>;
  /**
   * Create a rein and add its agent key in ONE wallet approval: two transactions,
   * `create_rein` on the contract and AddKey on the owner's own account. Redirect
   * wallets leave the page here; callers persist what they need first.
   */
  createReinWithKey: (
    publicKey: string,
    label: string,
    terms: Record<string, unknown>,
    storageNear: string,
    opts?: { allowanceNear?: string; agentAccount?: string | null; fundNear?: string },
  ) => Promise<void>;
  /** Delete a key from the owner's account (revoked agents stop burning gas allowance). */
  deleteKey: (publicKey: string) => Promise<string | null>;
};

const Ctx = createContext<Wallet | null>(null);

function hashOf(outcome: unknown): string | null {
  const o = outcome as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | void;
  return o?.transaction?.hash ?? o?.transaction_outcome?.id ?? null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const modal = useRef<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [keySession, setKeySession] = useState<KeySession | null>(null);

  useEffect(() => setKeySession(loadKeySession()), []);
  const saveKey = (k: KeySession | null) => {
    try {
      if (k) sessionStorage.setItem(KEY_SESSION, JSON.stringify(k));
      else sessionStorage.removeItem(KEY_SESSION);
    } catch {}
    setKeySession(k);
  };

  useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined;
    setupWalletSelector({
      network: NETWORK,
      modules: [setupHotWallet(), setupIntearWallet(), setupHereWallet(), setupSender()],
    })
      .then((s) => {
        setSelector(s);
        modal.current = setupModal(s, { contractId: CONTRACT_ID, description: "Sign in as the owner of your reins." });
        const pick = () => s.store.getState().accounts.find((a) => a.active)?.accountId ?? null;
        setAccountId(pick());
        sub = s.store.observable.subscribe(() => setAccountId(pick()));
      })
      .catch((e) => console.warn("wallet selector unavailable", e));
    return () => sub?.unsubscribe();
  }, []);

  const send = useCallback(
    async (receiverId: string, actions: ReturnType<typeof actionCreators.functionCall>[]) => {
      if (keySession) {
        const out = await keyAccount(keySession).signAndSendTransaction({ receiverId, actions: actions as any, throwOnFailure: false });
        const panic = panicOf(out);
        if (panic) throw new Error(panic);
        return hashOf(out);
      }
      if (!selector || !accountId) throw new Error("Sign in with your NEAR wallet first");
      const wallet = await selector.wallet();
      const out = await wallet.signAndSendTransaction({ signerId: accountId, receiverId, actions });
      const panic = panicOf(out);
      if (panic) throw new Error(panic);
      return hashOf(out);
    },
    [selector, accountId, keySession],
  );

  const owner = keySession?.accountId ?? accountId;

  const value = useMemo<Wallet>(
    () => ({
      ready: selector !== null || keySession !== null,
      accountId: owner,
      mode: keySession ? "key" : accountId ? "wallet" : null,
      signIn: () => modal.current?.show(),
      signInWithKey: (id, secretKey) => {
        KeyPair.fromString(secretKey as KeyPairString); // throws on a malformed key
        saveKey({ accountId: id.trim(), secretKey: secretKey.trim() as KeyPairString });
      },
      signInDemo: async () => {
        const k = await createDemoAccount();
        saveKey(k);
        return k.accountId;
      },
      signOut: async () => {
        if (keySession) return saveKey(null);
        if (!selector) return;
        const w = await selector.wallet();
        await w.signOut();
      },
      call: (method, args, depositNear) =>
        send(CONTRACT_ID, [
          actionCreators.functionCall(method, args, GAS, depositNear ? nearToYocto(depositNear) : ONE_YOCTO),
        ]),
      callOn: (receiverId, method, args, depositYocto) => send(receiverId, [actionCreators.functionCall(method, args, GAS, depositYocto)]),
      addAgentKey: (publicKey, allowanceNear = AGENT_ALLOWANCE_NEAR) =>
        send(owner ?? "", [
          actionCreators.addKey(
            PublicKey.fromString(publicKey),
            actionCreators.functionCallAccessKey(CONTRACT_ID, [...AGENT_METHODS], nearToYocto(allowanceNear)),
          ),
        ]),
      createReinWithKey: async (publicKey, label, terms, storageNear, opts = {}) => {
        const { allowanceNear = AGENT_ALLOWANCE_NEAR, agentAccount = null, fundNear = "0.1" } = opts;
        const addKey = actionCreators.addKey(
          PublicKey.fromString(publicKey),
          actionCreators.functionCallAccessKey(CONTRACT_ID, [...AGENT_METHODS], nearToYocto(allowanceNear)),
        );
        if (keySession) {
          await send(CONTRACT_ID, [actionCreators.functionCall("create_rein", { agent_key: publicKey, label, terms, agent_account: agentAccount }, GAS, nearToYocto(storageNear))]);
          if (agentAccount) await send(agentAccount, [actionCreators.createAccount(), actionCreators.transfer(nearToYocto(fundNear)), addKey] as any);
          else await send(keySession.accountId, [addKey]);
          return;
        }
        if (!selector || !accountId) throw new Error("Sign in with your NEAR wallet first");
        const wallet = await selector.wallet();
        const out = await wallet.signAndSendTransactions({
          transactions: [
            {
              receiverId: CONTRACT_ID,
              actions: [actionCreators.functionCall("create_rein", { agent_key: publicKey, label, terms, agent_account: agentAccount }, GAS, nearToYocto(storageNear))],
            },
            // The agent's key lives on the owner's account, or on a fresh named
            // sub-account of it that holds nothing but that key and a little NEAR for storage.
            agentAccount
              ? { receiverId: agentAccount, actions: [actionCreators.createAccount(), actionCreators.transfer(nearToYocto(fundNear)), addKey] }
              : { receiverId: accountId, actions: [addKey] },
          ],
        });
        for (const o of out ?? []) {
          const panic = panicOf(o);
          if (panic) throw new Error(panic);
        }
      },
      deleteKey: (publicKey) => send(owner ?? "", [actionCreators.deleteKey(PublicKey.fromString(publicKey))]),
    }),
    [selector, accountId, keySession, owner, send],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): Wallet {
  const w = useContext(Ctx);
  if (!w) throw new Error("useWallet outside WalletProvider");
  return w;
}
