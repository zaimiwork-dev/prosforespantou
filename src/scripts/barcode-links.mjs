// Barcodes → proven matches between stores (owner 2026-11-23). Nightly in the
// resolvers job, before the AI check and the comparison counts.
//
//   node src/scripts/barcode-links.mjs            # attach + write links
//   DRY_RUN=1 node src/scripts/barcode-links.mjs  # report only
//
// 1. ATTACH (lib/barcode-links attachByName): a barcode listing from a source
//    other than the store itself (Wolt) gets the store's own item code when the
//    names are exactly equal within that store → item_barcodes.chain_itemcode,
//    matched_via='exact-name'.
// 2. LINK (barcodePairs): two stores' items carrying the same barcode → a
//    comparison_verdicts row, verdict 'same', model 'barcode' (final; read by
//    every comparison through lib/item-links + lib/comparison-verdict, so it
//    adds comparisons with no AI call). An existing «unsure» AI verdict yields
//    to the barcode; an AI «different» or an owner decision is never
//    overwritten — those are printed as conflicts to look at.
//
// dotenv first (ESM hoist trap).
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DRY_RUN = process.env.DRY_RUN === '1';
// Retired chains (lib/constants RETIRED_SUPERMARKET_IDS) have no shop left.
const SKIP_CHAINS = new Set(['kritikos']);

async function run() {
  const { default: prisma } = await import('../lib/prisma.ts');
  const { attachByName, barcodePairs } = await import('../lib/barcode-links.ts');
  const { pairKeyOf } = await import('../lib/comparison-verdict.ts');

  const listings = await prisma.$queryRawUnsafe(
    `SELECT id::text, source, chain, name, barcode, chain_itemcode AS "chainItemcode" FROM item_barcodes`);
  const mappings = await prisma.$queryRawUnsafe(
    `SELECT m.supermarket AS chain, m.chain_itemcode AS code, m.item_name AS "itemName", m.matched_via AS via,
            p.name AS "productName", p.barcode AS "productBarcode"
     FROM chain_product_mappings m JOIN products p ON p.id = m.product_id`);
  const live = mappings.filter((m) => !SKIP_CHAINS.has(m.chain));
  // The store's own wording: item_name (kept by catalog runs), else the product
  // name when that product was created FROM this store's catalog.
  const storeName = (m) => m.itemName || (m.via === 'catalog' ? m.productName : null);
  const items = live.map((m) => ({ chain: m.chain, code: m.code, name: storeName(m) })).filter((i) => i.name);
  console.log(`🔎 barcode listings: ${listings.length} (${listings.filter((l) => l.chainItemcode).length} already on a store item); store items with their own name: ${items.length} of ${live.length}`);

  // 1. Attach.
  const attach = attachByName(listings.filter((l) => !SKIP_CHAINS.has(l.chain)), items);
  console.log(`   attach by exact name: ${attach.size}`);
  if (!DRY_RUN && attach.size > 0) {
    const ids = [...attach.keys()];
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      await prisma.$executeRawUnsafe(
        `UPDATE item_barcodes b SET chain_itemcode = v.code, matched_via = 'exact-name'
         FROM unnest($1::uuid[], $2::text[]) AS v(id, code)
         WHERE b.id = v.id AND b.chain_itemcode IS NULL`,
        chunk, chunk.map((id) => attach.get(id)));
    }
  }

  // 2. Every store item with a barcode: its own feed, an attached listing, or a
  //    mapping the store's own GTIN proved (matched_via 'barcode').
  const nameOf = new Map(live.map((m) => [`${m.chain}#${m.code}`, m.itemName || m.productName]));
  const tagged = [];
  for (const l of listings) {
    const code = l.chainItemcode || attach.get(l.id);
    if (!code || SKIP_CHAINS.has(l.chain)) continue;
    const name = nameOf.get(`${l.chain}#${code}`);
    if (!name) continue; // the item code is not (or no longer) in our catalog
    tagged.push({ item: { chain: l.chain, code, name }, barcode: l.barcode });
  }
  for (const m of live) {
    if (m.via === 'barcode' && m.productBarcode) tagged.push({ item: { chain: m.chain, code: m.code, name: m.itemName || m.productName }, barcode: m.productBarcode });
  }
  const pairs = barcodePairs(tagged);
  const perChain = {};
  for (const t of tagged) perChain[t.item.chain] = (perChain[t.item.chain] || 0) + 1;
  console.log(`   store items with a barcode: ${JSON.stringify(perChain)}; cross-store pairs sharing one: ${pairs.length}`);

  const existing = new Map((await prisma.comparisonVerdict.findMany({ select: { pairKey: true, verdict: true, model: true } }))
    .map((r) => [r.pairKey, r]));
  const create = [];
  const upgrade = [];
  const conflicts = [];
  let already = 0;
  for (const p of pairs) {
    const key = pairKeyOf({ chain: p.a.chain, code: p.a.code, name: p.a.name }, { chain: p.b.chain, code: p.b.code, name: p.b.name });
    const row = {
      pairKey: key, chainA: p.a.chain, codeA: p.a.code, nameA: p.a.name, chainB: p.b.chain, codeB: p.b.code, nameB: p.b.name,
      verdict: 'same', reason: `barcode ${p.barcode}`, model: 'barcode',
    };
    const e = existing.get(key);
    if (!e) create.push(row);
    else if (e.model === 'barcode') already++;
    else if (e.model !== 'owner' && e.verdict === 'unsure') upgrade.push(row);
    else if (e.verdict === 'same') already++;
    else conflicts.push({ ...row, was: `${e.verdict} (${e.model})` });
  }
  console.log(`   links: ${create.length} new, ${upgrade.length} «unsure» → same, ${already} already same, ${conflicts.length} conflicts (AI «different» or owner — left alone)`);
  for (const c of conflicts.slice(0, 15)) console.log(`     ≠ ${c.was}: ${c.chainA} «${c.nameA}» | ${c.chainB} «${c.nameB}» (${c.reason})`);
  if (DRY_RUN) {
    for (const r of create.slice(0, 15)) console.log(`     + ${r.chainA} «${r.nameA}» = ${r.chainB} «${r.nameB}» (${r.reason})`);
  } else {
    for (let i = 0; i < create.length; i += 500) {
      await prisma.comparisonVerdict.createMany({ data: create.slice(i, i + 500), skipDuplicates: true });
    }
    for (const r of upgrade) {
      await prisma.comparisonVerdict.update({ where: { pairKey: r.pairKey }, data: { verdict: 'same', reason: `${r.reason} · was unsure`, model: 'barcode' } });
    }
  }
  console.log(`🏁 barcode links done${DRY_RUN ? ' (DRY_RUN — nothing written)' : ''}`);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
