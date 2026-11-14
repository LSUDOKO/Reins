"use client";

// /shop: the demo merchant ("s0nder data co."), a sibling storefront on the same
// design system. It sells to agents and is paid in NEAR by reins-demo-shop.testnet.
// Checkout takes the owner account and the agent's key: with a secret key the
// payment is signed in this tab with that function-call key (exactly what an agent
// does) and the contract decides; with only a public key it runs the free
// preview_pay dry run and moves nothing.

import { useEffect, useState } from "react";
import { JsonRpcProvider, KeyPair, type KeyPairString } from "near-api-js";
import { AgentClient, type Preview } from "@reins/sdk";
import { reins } from "@/lib/api";
import { CONTRACT_ID, DEMO_OWNER, RPC_URL, txUrl } from "@/lib/chain";
import { nearToYocto } from "@/lib/near";
import s from "./shop.module.css";

const MERCHANT = process.env.NEXT_PUBLIC_DEMO_MERCHANT ?? "reins-demo-shop.testnet";

type Product = { id: string; name: string; price: string; description: string };
const CATALOG: { merchant: string; products: Product[] } = {
  merchant: "s0nder data co.",
  products: [
    { id: "weather", name: "Weather dataset", price: "0.05", description: "Hourly, 2020–2026, 40 cities" },
    { id: "credits", name: "API credits", price: "0.1", description: "10k calls to the geocoding API" },
    { id: "gpu", name: "GPU hour", price: "0.18", description: "One A100 hour, billed per minute" },
    { id: "report", name: "Market report", price: "0.3", description: "Quarterly, 80 pages, with raw tables" },
  ],
};

type Result =
  | { kind: "paid"; tx: string }
  | { kind: "refused"; reason: string; tx?: string }
  | { kind: "preview"; preview: Preview };

export default function ShopPage() {
  const [picked, setPicked] = useState<Product | null>(null);
  const [owner, setOwner] = useState(DEMO_OWNER);
  const [key, setKey] = useState("");
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);

  // keep the browser tab in character
  useEffect(() => {
    document.title = CATALOG.merchant;
  }, []);

  const pick = (p: Product) => {
    setPicked(p);
    setResult(null);
    setPayErr(null);
  };

  const isSecret = key.trim().startsWith("ed25519:") && key.trim().length > 60;

  const pay = async () => {
    if (!picked) return;
    setPaying(true);
    setPayErr(null);
    try {
      if (isSecret) {
        const agent = new AgentClient(owner.trim(), key.trim() as KeyPairString, new JsonRpcProvider({ url: RPC_URL }), CONTRACT_ID, reins);
        const tx = await agent.rawPay(MERCHANT, picked.price, `${CATALOG.merchant}: ${picked.name}`);
        const paid = tx.events.some((e) => e.event === "payment");
        setResult(paid ? { kind: "paid", tx: tx.txHash } : { kind: "refused", reason: tx.error ?? "transfer failed", tx: tx.txHash || undefined });
      } else {
        const pk = key.trim() ? KeyPair.fromString(key.trim() as KeyPairString).getPublicKey().toString() : "";
        const preview = await reins.previewPay(owner.trim(), pk || key.trim(), MERCHANT, nearToYocto(picked.price).toString());
        setResult({ kind: "preview", preview });
      }
    } catch (e) {
      // a public key is not a KeyPair: preview with it directly
      if (picked && key.trim().startsWith("ed25519:") && !isSecret) {
        try {
          const preview = await reins.previewPay(owner.trim(), key.trim(), MERCHANT, nearToYocto(picked.price).toString());
          setResult({ kind: "preview", preview });
          return;
        } catch (e2) {
          setPayErr(e2 instanceof Error ? e2.message : String(e2));
        }
      } else {
        setPayErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setPaying(false);
    }
  };

  const tryAgain = () => {
    setResult(null);
    setPayErr(null);
  };

  const formReady = owner.trim() !== "" && key.trim() !== "";

  return (
    <div className={s.wrap}>
      <div className={s.inner}>
        <div className={s.brand}>{CATALOG.merchant}</div>
        <div className={s.tag}>Data and compute for agents, paid in NEAR.</div>

        <div className={s.grid}>
          {CATALOG.products.map((p) => (
            <div key={p.id} className={s.product}>
              <div className={s.pname}>{p.name}</div>
              <div className={s.pdesc}>{p.description}</div>
              <div className={s.pprice}>Ⓝ{p.price}</div>
              <button className={picked?.id === p.id ? `${s.buy} ${s.active}` : s.buy} onClick={() => pick(p)} data-testid={`buy-${p.id}`}>
                Buy
              </button>
            </div>
          ))}
        </div>

        {picked && (
          <div className={s.panel}>
            <div className={s.ptitle}>
              Checkout · {picked.name} · Ⓝ{picked.price}
            </div>

            {result === null ? (
              <>
                <div className={s.fields}>
                  <label className={s.field}>
                    Owner Account
                    <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="you.testnet" data-testid="owner" />
                  </label>
                  <label className={s.field}>
                    Agent Key
                    <input
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder="ed25519:… secret to pay, or public key to preview"
                      spellCheck={false}
                      data-testid="agent-key"
                    />
                  </label>
                </div>
                <div className={s.payrow}>
                  <button className={s.pay} onClick={pay} disabled={!formReady || paying} data-testid="pay">
                    {paying ? "Paying…" : isSecret ? `Pay Ⓝ${picked.price}` : `Preview Ⓝ${picked.price}`}
                  </button>
                </div>
                {payErr && (
                  <div className={`${s.result} ${s.declined}`} data-testid="result">
                    Something went wrong · {payErr}
                  </div>
                )}
              </>
            ) : result.kind === "paid" ? (
              <>
                <div className={`${s.result} ${s.approved}`} data-testid="result">
                  Payment settled · {picked.name}
                  <span className={s.authid}>
                    <a href={txUrl(result.tx)} target="_blank" rel="noreferrer">
                      Transaction {result.tx.slice(0, 10)}…
                    </a>
                  </span>
                </div>
                <div className={s.payrow}>
                  <button className={s.again} onClick={tryAgain} data-testid="try-again">
                    Buy Something Else
                  </button>
                </div>
              </>
            ) : result.kind === "preview" ? (
              <>
                <div className={`${s.result} ${result.preview.ok ? s.approved : s.declined}`} data-testid="result">
                  Dry run · {result.preview.ok ? "the contract would pay this" : result.preview.needs_approval ? "the owner must approve this one" : `the contract would refuse: ${result.preview.code}`}
                  <span className={s.authid}>preview_pay · nothing moved</span>
                </div>
                <div className={s.payrow}>
                  <button className={s.again} onClick={tryAgain} data-testid="try-again">
                    Back
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={`${s.result} ${s.declined}`} data-testid="result">
                  Payment refused by the contract · {result.reason}
                  {result.tx && (
                    <span className={s.authid}>
                      <a href={txUrl(result.tx)} target="_blank" rel="noreferrer">
                        Transaction {result.tx.slice(0, 10)}…
                      </a>
                    </span>
                  )}
                </div>
                <div className={s.payrow}>
                  <button className={s.again} onClick={tryAgain} data-testid="try-again">
                    Try Again
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <p className={s.foot}>
          A demo storefront. It is paid by agents holding a{" "}
          <a href="/" target="_blank" rel="noreferrer">
            Reins
          </a>{" "}
          key: every payment goes from the owner&apos;s vault to <code>{MERCHANT}</code> on NEAR testnet, and the contract
          checks the rein&apos;s terms first. The key is used in this tab only.
        </p>
      </div>
    </div>
  );
}
