"use client";

// Sub-reins as list rows: silk thumbnail, name + PAN, status, cap narrowing
// downward. Rows navigate to the card's own cockpit. Cascade truth in the footer.

import Link from "next/link";
import type { TreeNode } from "@/lib/api";
import { Guilloche, capWord, fmtNear, isDead, keyHex, panGroups, periodLabel } from "./ui";
import { allowance } from "./Authority";

function rowClass(status: string): string {
  if (status === "frozen") return "srow frozen";
  if (isDead(status)) return "srow dead";
  return "srow";
}

export function SubRows({
  node,
  kmap,
}: {
  node: TreeNode;
  kmap: Map<string, string>;
}) {
  return (
    <>
      <div className="subrows">
        {node.children.map((kid) => {
          const c = kid.card;
          const capAmt = c.terms.pay?.period?.amount ?? c.terms.pay?.lifetime?.amount ?? null;
          const per = c.terms.pay?.period ? ` / ${periodLabel(c.terms.pay.period.seconds)}` : "";
          const capLine = capAmt ? `≤ Ⓝ${capAmt}${per}` : "Unmetered";
          const { spent } = allowance(c);
          const dead = isDead(c.status);
          return (
            <Link key={c.card_id} href={`/rein?id=${c.card_id}`} className={rowClass(c.status)}>
              <span className="thumb">
                <Guilloche width={64} height={14} strands={5} amp={4.5} />
              </span>
              <span>
                <span className="nm">{c.name}</span>
                <span className="pan">{panGroups(keyHex(c.agent_key)).join(" ")}</span>
              </span>
              <span className="st">
                <b />
                {capWord(c.status)}
              </span>
              <span className="capb">
                <span className="c1">{capLine}</span>
                <span className="c2">
                  {dead || spent === null || spent === 0 ? (
                    "No spend"
                  ) : (
                    <>
                      <span className="data">{fmtNear(spent)}</span> spent
                    </>
                  )}
                </span>
              </span>
              <span className="chev">
                <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
                  <path d="M1 1l5 4.5L1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>
          );
        })}
      </div>
      <div className="cascade">
        Sub-rein spending counts against every ancestor · revoke the root, the whole <span className="data">subtree</span> dies
      </div>
    </>
  );
}
