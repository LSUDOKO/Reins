"use client";

// The owner's wallet, through NEAR Wallet Selector. The console never holds a key:
// every owner verb is a transaction the wallet signs with a FULL-ACCESS key, and
// every one attaches at least 1 yoctoNEAR, which is exactly what an agent's
// function-call key cannot do.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { actionCreators } from "@near-js/transactions";
import { PublicKey } from "@near-js/crypto";
import { panicOf } from "@reins/sdk";
import { AGENT_ALLOWANCE_NEAR, AGENT_METHODS, CONTRACT_ID, NETWORK } from "./chain";
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
  signIn: () => void;
  signOut: () => Promise<void>;
  /** Call an owner method on the contract. Returns the tx hash; throws the contract's error code. */
  call: (method: string, args: Record<string, unknown>, depositNear?: string) => Promise<string | null>;
  /** Add `publicKey` to the owner's own account as a function-call key for the agent methods. */
  addAgentKey: (publicKey: string, allowanceNear?: string) => Promise<string | null>;
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

  useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined;
    setupWalletSelector({ network: NETWORK, modules: [setupMyNearWallet()] })
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
      if (!selector || !accountId) throw new Error("Sign in with your NEAR wallet first");
      const wallet = await selector.wallet();
      const out = await wallet.signAndSendTransaction({ signerId: accountId, receiverId, actions });
      const panic = panicOf(out);
      if (panic) throw new Error(panic);
      return hashOf(out);
    },
    [selector, accountId],
  );

  const value = useMemo<Wallet>(
    () => ({
      ready: selector !== null,
      accountId,
      signIn: () => modal.current?.show(),
      signOut: async () => {
        if (!selector) return;
        const w = await selector.wallet();
        await w.signOut();
      },
      call: (method, args, depositNear) =>
        send(CONTRACT_ID, [
          actionCreators.functionCall(method, args, GAS, depositNear ? nearToYocto(depositNear) : ONE_YOCTO),
        ]),
      addAgentKey: (publicKey, allowanceNear = AGENT_ALLOWANCE_NEAR) =>
        send(accountId ?? "", [
          actionCreators.addKey(
            PublicKey.fromString(publicKey),
            actionCreators.functionCallAccessKey(CONTRACT_ID, AGENT_METHODS, nearToYocto(allowanceNear)),
          ),
        ]),
      deleteKey: (publicKey) => send(accountId ?? "", [actionCreators.deleteKey(PublicKey.fromString(publicKey))]),
    }),
    [selector, accountId, send],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): Wallet {
  const w = useContext(Ctx);
  if (!w) throw new Error("useWallet outside WalletProvider");
  return w;
}
