// Cross-chain item links (owner 2026-11-22: «yes build it» — link the same
// product across chains so many more offers can be compared, every link
// checked once and saved against the two chain ITEM CODES, its «slots»).
//
// The offline linker (src/scripts/link-products-offline.mjs, LINK-01) proposes
// PRODUCT pairs — one product per chain, same thing by name/brand/size. Here
// each proposal becomes a pair of chain items, the pairs that would put a
// comparison on screen are handed to a judge (Claude agents by
// src/scripts/comparison-judge-rules.md, or Groq), and the verdicts are stored
// in comparison_verdicts like every other pair: a 'same' row there IS the link
// (the comparison readers follow it; see lib/item-links.ts).
//
//   MODE=export LINKS_CANDIDATES=<candidates.jsonl> OUT=<dir> node src/scripts/link-items.mjs
//       → <dir>/links-backlog.json   [{id, nameA, nameB}] for the judge
//         <dir>/links-meta.json      id → both sides (chain, code, name, product)
//   MODE=import IN=<judged.json> META=<links-meta.json> IMPORT_MODEL=<name> [DRY_RUN=1] node src/scripts/link-items.mjs
//
// Only pairs that matter today are exported: one side is a live, publicly
// visible offer and the other is a live offer or has a current shelf price at
// a chain whose catalogue feed is alive. Pairs already judged are skipped —
// a pair of items is asked about once, ever.
//
// dotenv first (ESM hoist trap).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import fs from 'node:fs';
import path from 'node:path';
import { mergeVerdict, pairKeyOf } from '../lib/comparison-verdict.ts';
import { loadFreshShelfChains } from '../lib/feed-freshness.ts';
import { SHELF_PRICE_MAX_AGE_DAYS } from '../lib/shelf-comparison.ts';
import { RETIRED_SUPERMARKET_IDS } from '../lib/constants.js';

const MODE = process.env.MODE;
const DRY_RUN = process.env.DRY_RUN === '1';
const VERDICTS = ['same', 'different', 'unsure'];

const publiclyVisible = (d) =>
  d.supermarket !== 'mymarket' || d.originalPrice != null || d.description != null;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function exportBacklog(prisma) {
  const file = process.env.LINKS_CANDIDATES;
  const out = process.env.OUT;
  if (!file || !out) throw new Error('LINKS_CANDIDATES and OUT are required');
  const candidates = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const now = new Date();

  const productIds = [...new Set(candidates.flatMap((c) => [c.a.productId, c.b.productId]))];
  const mappings = [];
  for (const ids of chunk(productIds, 2000)) {
    mappings.push(...await prisma.chainProductMapping.findMany({
      where: { productId: { in: ids } },
      select: { productId: true, supermarket: true, chainItemcode: true },
    }));
  }
  const codesOf = new Map(); // `${productId}|${chain}` → [codes]
  for (const m of mappings) {
    const k = `${m.productId}|${m.supermarket}`;
    if (!codesOf.has(k)) codesOf.set(k, []);
    codesOf.get(k).push(m.chainItemcode);
  }

  const live = await prisma.discount.findMany({
    where: { isActive: true, validUntil: { gt: now }, chainItemcode: { not: null } },
    select: { supermarket: true, chainItemcode: true, productName: true, originalPrice: true, description: true, hotScore: true },
  });
  const liveItem = new Map(); // `${chain}#${code}` → offer name
  const hotOf = new Map(); // same key → the offer's hotScore (most visible first)
  for (const d of live) {
    if (!publiclyVisible(d)) continue;
    const k = `${d.supermarket}#${d.chainItemcode}`;
    liveItem.set(k, d.productName);
    hotOf.set(k, Math.max(hotOf.get(k) ?? 0, d.hotScore ?? 0));
  }

  const fresh = await loadFreshShelfChains(prisma, now);
  const since = new Date(now.getTime() - SHELF_PRICE_MAX_AGE_DAYS * 86400000);
  const shelf = new Set();
  for (const ids of chunk(productIds, 2000)) {
    const snaps = await prisma.priceSnapshot.findMany({
      where: { productId: { in: ids }, kind: 'normal', recordedAt: { gte: since } },
      select: { productId: true, supermarket: true },
      distinct: ['productId', 'supermarket'],
    });
    for (const s of snaps) if (fresh.has(s.supermarket)) shelf.add(`${s.productId}|${s.supermarket}`);
  }

  const existing = new Set((await prisma.comparisonVerdict.findMany({ select: { pairKey: true } })).map((r) => r.pairKey));

  const meta = {};
  const counts = { candidates: candidates.length, itemPairs: 0, relevant: 0, alreadyJudged: 0, exported: 0 };
  for (const c of candidates) {
    if (RETIRED_SUPERMARKET_IDS.has(c.a.chain) || RETIRED_SUPERMARKET_IDS.has(c.b.chain)) continue;
    for (const codeA of codesOf.get(`${c.a.productId}|${c.a.chain}`) ?? []) {
      for (const codeB of codesOf.get(`${c.b.productId}|${c.b.chain}`) ?? []) {
        counts.itemPairs++;
        const offerA = liveItem.get(`${c.a.chain}#${codeA}`);
        const offerB = liveItem.get(`${c.b.chain}#${codeB}`);
        const rivalForA = offerB != null || shelf.has(`${c.b.productId}|${c.b.chain}`);
        const rivalForB = offerA != null || shelf.has(`${c.a.productId}|${c.a.chain}`);
        if (!((offerA != null && rivalForA) || (offerB != null && rivalForB))) continue;
        counts.relevant++;
        // brand = the product record's brand (lib/name-exact refuses a
        // word-identical link when a name does not state it).
        const a = { chain: c.a.chain, code: codeA, name: offerA ?? c.a.name, productId: c.a.productId, brand: c.a.brand ?? null };
        const b = { chain: c.b.chain, code: codeB, name: offerB ?? c.b.name, productId: c.b.productId, brand: c.b.brand ?? null };
        const id = pairKeyOf(a, b);
        if (existing.has(id)) { counts.alreadyJudged++; continue; }
        if (meta[id]) continue;
        const priority = Math.max(hotOf.get(`${c.a.chain}#${codeA}`) ?? 0, hotOf.get(`${c.b.chain}#${codeB}`) ?? 0);
        meta[id] = { a, b, score: c.score, priority };
        counts.exported++;
      }
    }
  }
  fs.mkdirSync(out, { recursive: true });
  // Most visible first, so a judge that stops early has done the pairs that matter most.
  const ordered = Object.entries(meta).sort((x, y) => y[1].priority - x[1].priority);
  fs.writeFileSync(path.join(out, 'links-backlog.json'), JSON.stringify(ordered.map(([id, m]) => ({ id, nameA: m.a.name, nameB: m.b.name })), null, 1));
  fs.writeFileSync(path.join(out, 'links-meta.json'), JSON.stringify(meta, null, 1));
  console.log('🔗 link backlog:', JSON.stringify(counts));
}

async function importVerdicts(prisma) {
  const inFile = process.env.IN;
  const metaFile = process.env.META;
  const model = process.env.IMPORT_MODEL;
  if (!inFile || !metaFile || !model) throw new Error('IN, META and IMPORT_MODEL are required');
  const judged = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const existing = new Map((await prisma.comparisonVerdict.findMany({ select: { pairKey: true, verdict: true, model: true } })).map((r) => [r.pairKey, r]));

  const words = (w) => (Array.isArray(w) ? w.filter((s) => typeof s === 'string').join(', ') : '');
  const creates = [];
  const counts = { created: 0, unchanged: 0, unknown: 0, same: 0, different: 0, unsure: 0 };
  for (const r of judged) {
    const m = meta[r.id];
    if (!m) { counts.unknown++; continue; }
    const v = VERDICTS.includes(r.v) ? r.v : 'unsure';
    const next = mergeVerdict(existing.get(r.id), v);
    if (next === null || existing.has(r.id)) { counts.unchanged++; continue; }
    counts[next]++;
    counts.created++;
    creates.push({
      pairKey: r.id,
      chainA: m.a.chain, codeA: m.a.code, nameA: m.a.name,
      chainB: m.b.chain, codeB: m.b.code, nameB: m.b.name,
      verdict: next,
      reason: `link · ${typeof r.why === 'string' ? r.why : ''} [A: ${words(r.onlyA) || '-'} | B: ${words(r.onlyB) || '-'}]`.slice(0, 300),
      model,
    });
  }
  console.log(`🔗 import as «${model}»${DRY_RUN ? ' — DRY_RUN' : ''}: ${JSON.stringify(counts)}`);
  if (DRY_RUN) return;
  for (const batch of chunk(creates, 500)) await prisma.comparisonVerdict.createMany({ data: batch, skipDuplicates: true });
}

const { default: prisma } = await import('../lib/prisma.ts');
try {
  if (MODE === 'export') await exportBacklog(prisma);
  else if (MODE === 'import') await importVerdicts(prisma);
  else throw new Error('MODE=export or MODE=import');
} finally {
  await prisma.$disconnect();
}
