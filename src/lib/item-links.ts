// Cross-chain item links (owner 2026-11-22: «yes build it»). A 'same' row in
// comparison_verdicts between two chain ITEMS (chain + item code — their
// «slots») is a link: the two are the same sellable product even when they
// sit on different product records, because each chain named it differently.
// The comparison sheet and the nightly chip count follow links to reach the
// other chain's live offer, or else its regular shelf price.
//
// Links come from the barcode (automatic), the AI check (once per pair of
// items — src/scripts/link-items.mjs, verify-comparisons.mjs) or the owner
// (admin «Συγκρίσεις»). Only DIRECT links count: A~B and B~C do not make A~C.
//
// Pure + strip-safe (imported by the server action and the .mjs scripts).

import { itemKey } from './comparison-verdict.ts';

export type ItemRef = { chain: string; code: string };

export type LinkRow = {
  chainA: string;
  codeA: string | null;
  chainB: string;
  codeB: string | null;
  verdict: string;
};

/** item key (chain#code) → the items it is linked to, in both directions. */
export type LinkGraph = Map<string, ItemRef[]>;

export function linkGraph(rows: LinkRow[]): LinkGraph {
  const g: LinkGraph = new Map();
  const add = (from: ItemRef, to: ItemRef) => {
    const k = itemKey(from);
    const list = g.get(k) ?? [];
    if (!list.some((r) => r.chain === to.chain && r.code === to.code)) list.push(to);
    g.set(k, list);
  };
  for (const r of rows) {
    if (r.verdict !== 'same' || !r.codeA || !r.codeB || r.chainA === r.chainB) continue;
    const a = { chain: r.chainA, code: r.codeA };
    const b = { chain: r.chainB, code: r.codeB };
    add(a, b);
    add(b, a);
  }
  return g;
}

export function linkedItems(g: LinkGraph, item: { chain: string | null | undefined; code: string | null | undefined }): ItemRef[] {
  if (!item.chain || !item.code) return [];
  return g.get(itemKey({ chain: item.chain, code: item.code })) ?? [];
}

// Structural reader (Prisma client in actions and in .mjs scripts).
type LinkReader = {
  comparisonVerdict: {
    findMany(args: any): Promise<LinkRow[]>;
  };
};

const LINK_SELECT = { chainA: true, codeA: true, chainB: true, codeB: true, verdict: true };

/** Links of the given items (the per-request path). */
export async function loadLinksFor(prisma: LinkReader, items: { chain: string | null | undefined; code: string | null | undefined }[]): Promise<LinkGraph> {
  const refs = items.filter((i): i is ItemRef => !!i.chain && !!i.code);
  if (refs.length === 0) return new Map();
  const rows = await prisma.comparisonVerdict.findMany({
    where: {
      verdict: 'same',
      OR: refs.flatMap((r) => [
        { chainA: r.chain, codeA: r.code },
        { chainB: r.chain, codeB: r.code },
      ]),
    },
    select: LINK_SELECT,
  });
  return linkGraph(rows);
}

/** Every link (the nightly scripts). */
export async function loadAllLinks(prisma: LinkReader): Promise<LinkGraph> {
  const rows = await prisma.comparisonVerdict.findMany({
    where: { verdict: 'same', codeA: { not: null }, codeB: { not: null } },
    select: LINK_SELECT,
  });
  return linkGraph(rows);
}
