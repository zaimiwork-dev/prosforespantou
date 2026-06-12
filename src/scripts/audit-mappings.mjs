// Audit ChainProductMapping for stale mis-matches — the root cause of wrong
// products showing in ΣΥΓΚΡΙΣΗ ΤΙΜΗΣ (user report 2026-06-12: an AB "Rich
// Caramel 95g" offer compared against NESCAFE Gold AND Organic, because all
// three chain SKUs were mapped to one canonical productId in the old-matcher
// era, before the brand guard existed).
//
// For every mapping we look up the chain's own latest offer name for that
// itemcode and score it against the canonical Product.name:
//   - BAD     similarity < 0.34            → mapping is wrong, auto-fixable
//   - SUSPECT 0.34 ≤ similarity < 0.5      → report for eyeballing
//   - PACK    name agrees, pack disagrees  → report only (packCount quirks —
//             "2 Pack" vs "2x", "+1Δώρο" spellings — false-positive too often
//             to auto-delete; the comparison UI guards per-render via samePack)
//   - OK      otherwise
//
// Name score alone CANNOT safely separate good from bad: canonical names are
// often wolt-era hyper-abbreviations ("ΜΩΡΟΠ.FOR ALL KARITE 90T") or even
// translations ("Ocean" ↔ "ΩΚΕΑΝΟΥ") — sampled FP rate in every band under
// 0.5 was 30%+. So everything under SUSPECT_FLOOR goes through a Groq
// same/different judgement (LLM=1) — the same model the resolver trusts for
// creating mappings — and APPLY=1 only ever fixes verdict=different rows:
//   1. delete the ChainProductMapping row
//   2. unlink that chain SKU's discounts (productId → null; rows stay visible
//      display-first, re-resolved properly through the Review queue)
//   3. delete PriceSnapshots for (productId, chain) when the chain no longer
//      has ANY link to the product — those snapshots recorded a different
//      product's price and poison the honest-pricing history
//
// Usage:
//   node src/scripts/audit-mappings.mjs                  # dry-run report
//   LLM=1 node src/scripts/audit-mappings.mjs            # + Groq verdicts (cached)
//   LLM=1 APPLY=1 node src/scripts/audit-mappings.mjs    # fix verdict=different
//
// Scratch outputs (don't commit): mapping-audit-report.json,
// mapping-audit-verdicts.json (the resumable verdict cache).
//
// dotenv first (ESM hoist trap).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { nameSimilarity } from '../lib/offer-similarity.ts';
import { samePack } from '../lib/packaging.ts';

const APPLY = process.env.APPLY === '1';
const LLM = process.env.LLM === '1' || APPLY; // applying requires verdicts
const HARD_FLOOR = 0.34; // below this = clearly a different product (report label)
const SUSPECT_FLOOR = 0.5; // matches COMPARISON_SIMILARITY_FLOOR
const PACE_MS = parseInt(process.env.PACE_MS || '2200', 10);
const BATCH = 8;
const MODEL = process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const VERDICT_CACHE = './mapping-audit-verdicts.json';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Judge a batch of (chain name, canonical name) pairs: same sellable item?
async function judgeBatch(apiKey, rows) {
  const list = rows
    .map((r, i) => `${i + 1}. A: "${r.offerName}"\n   B: "${r.productName}"`)
    .join('\n');
  const prompt = `You are auditing a Greek supermarket product catalog. For each numbered pair, decide if name A and name B describe the SAME exact sellable item — same brand, same variant/flavor/scent/color, same size AND same pack/bundle count. Names may abbreviate words (ΦΙΛ.=Φιλέτο, ΚΤΨ=κατεψυγμένο), switch Greek/Latin script, or translate words (Ocean=Ωκεανού) — that still counts as the same item. A different variant, flavor, size, piece count, or product type is "different". If you genuinely cannot tell, use "unsure".

${list}

Reply with strict JSON: {"verdicts": ["same"|"different"|"unsure", ...]} with exactly ${rows.length} entries, in order.`;

  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 512,
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    return { error: `network: ${err.message || err.name}` };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { error: `${res.status}: ${body.slice(0, 160)}`, status: res.status };
  }
  try {
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
    const v = parsed.verdicts;
    if (!Array.isArray(v) || v.length !== rows.length) return { error: `bad shape: ${JSON.stringify(v).slice(0, 80)}` };
    return { verdicts: v.map((x) => (['same', 'different', 'unsure'].includes(x) ? x : 'unsure')) };
  } catch (err) {
    return { error: `parse: ${err.message}` };
  }
}

async function run() {
  const { default: prisma } = await import('../lib/prisma.ts');

  const mappings = await prisma.chainProductMapping.findMany({
    include: { product: { select: { id: true, name: true } } },
  });
  console.log(`${mappings.length} mappings to audit`);

  // Latest offer name per (chain, itemcode) — ordered asc so the last write
  // into the map is the most recent name the chain used for that SKU.
  const offers = await prisma.discount.findMany({
    where: { chainItemcode: { not: null } },
    orderBy: { updatedAt: 'asc' },
    select: { supermarket: true, chainItemcode: true, productName: true },
  });
  const offerName = new Map();
  for (const o of offers) offerName.set(`${o.supermarket}::${o.chainItemcode}`, o.productName);
  console.log(`${offerName.size} (chain, itemcode) pairs carry an offer name`);

  const bad = [];
  const suspect = [];
  const packOnly = [];
  let unknown = 0;
  let ok = 0;

  for (const m of mappings) {
    const name = offerName.get(`${m.supermarket}::${m.chainItemcode}`);
    if (!name) { unknown += 1; continue; }
    const score = nameSimilarity(name, m.product.name);
    const packOk = samePack(name, m.product.name);
    const row = {
      mappingId: m.id,
      productId: m.productId,
      chain: m.supermarket,
      itemcode: m.chainItemcode,
      offerName: name,
      productName: m.product.name,
      score: Number(score.toFixed(3)),
      packOk,
    };
    if (score < HARD_FLOOR) bad.push(row);
    else if (score < SUSPECT_FLOOR) suspect.push(row);
    else if (!packOk) packOnly.push(row);
    else ok += 1;
  }

  bad.sort((a, b) => a.score - b.score);
  suspect.sort((a, b) => a.score - b.score);
  packOnly.sort((a, b) => b.score - a.score);

  console.log(`\nOK ${ok} · BAD ${bad.length} · SUSPECT ${suspect.length} · PACK-only ${packOnly.length} · no-offer-name ${unknown}`);
  console.log('\n── BAD (sample of 25) ──');
  for (const r of bad.slice(0, 25)) {
    console.log(`  [${r.score}${r.packOk ? '' : ' PACK'}] ${r.chain}/${r.itemcode}`);
    console.log(`      chain: ${r.offerName}`);
    console.log(`      canon: ${r.productName}`);
  }
  console.log('\n── SUSPECT (sample of 15) ──');
  for (const r of suspect.slice(0, 15)) {
    console.log(`  [${r.score}] ${r.chain}/${r.itemcode}`);
    console.log(`      chain: ${r.offerName}`);
    console.log(`      canon: ${r.productName}`);
  }
  console.log('\n── PACK-only (sample of 10, report-only) ──');
  for (const r of packOnly.slice(0, 10)) {
    console.log(`  [${r.score}] ${r.chain}/${r.itemcode}`);
    console.log(`      chain: ${r.offerName}`);
    console.log(`      canon: ${r.productName}`);
  }

  writeFileSync('./mapping-audit-report.json', JSON.stringify({ bad, suspect, packOnly }, null, 2));
  console.log(`\nFull report → mapping-audit-report.json`);

  if (!LLM) {
    console.log('\nDry run — LLM=1 adds Groq verdicts; LLM=1 APPLY=1 fixes verdict=different.');
    await prisma.$disconnect();
    return;
  }

  // ── Groq verdict pass over every questionable mapping ─────────────────────
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { console.error('❌ GROQ_API_KEY not set'); process.exit(1); }

  const cache = existsSync(VERDICT_CACHE) ? JSON.parse(readFileSync(VERDICT_CACHE, 'utf8')) : {};
  const keyOf = (r) => `${r.chain}::${r.itemcode}`;
  const candidates = [...bad, ...suspect, ...packOnly];
  const todo = candidates.filter((r) => !cache[keyOf(r)]);
  console.log(`\nLLM pass: ${candidates.length} questionable mappings, ${todo.length} not yet judged`);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const res = await judgeBatch(apiKey, batch);
    if (res.error) {
      console.log(`  batch ${i / BATCH + 1}: ${res.error}${res.status === 429 ? ' — backing off 60s' : ''}`);
      if (res.status === 429) { await sleep(60000); i -= BATCH; }
      await sleep(PACE_MS);
      continue;
    }
    batch.forEach((r, j) => { cache[keyOf(r)] = res.verdicts[j]; });
    writeFileSync(VERDICT_CACHE, JSON.stringify(cache, null, 2));
    if ((i / BATCH) % 10 === 0) console.log(`  judged ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
    await sleep(PACE_MS);
  }

  const judged = candidates.map((r) => ({ ...r, verdict: cache[keyOf(r)] ?? 'unjudged' }));
  const different = judged.filter((r) => r.verdict === 'different');
  const tally = judged.reduce((acc, r) => ((acc[r.verdict] = (acc[r.verdict] ?? 0) + 1), acc), {});
  console.log(`\nVerdicts: ${JSON.stringify(tally)}`);
  writeFileSync('./mapping-audit-report.json', JSON.stringify({ judged }, null, 2));

  if (!APPLY) {
    console.log(`Dry run — APPLY=1 would fix ${different.length} verdict=different mappings.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\nAPPLY: fixing ${different.length} verdict=different mappings…`);
  let unlinked = 0;
  let snapshotsDeleted = 0;
  for (const r of different) {
    await prisma.chainProductMapping.delete({ where: { id: r.mappingId } });
    const res = await prisma.discount.updateMany({
      where: { supermarket: r.chain, chainItemcode: r.itemcode, productId: r.productId },
      data: { productId: null },
    });
    unlinked += res.count;
  }
  // Snapshot cleanup AFTER all unlinks, so "does the chain still link to the
  // product" sees the final state. A surviving link = either another (good)
  // mapping or a legacy-path discount row still pointing at the product.
  const pairs = new Set(different.map((r) => `${r.productId}::${r.chain}`));
  for (const pair of pairs) {
    const [productId, chain] = pair.split('::');
    const stillMapped = await prisma.chainProductMapping.findFirst({
      where: { productId, supermarket: chain },
      select: { id: true },
    });
    if (stillMapped) continue;
    const stillLinked = await prisma.discount.findFirst({
      where: { productId, supermarket: chain },
      select: { id: true },
    });
    if (stillLinked) continue;
    const res = await prisma.priceSnapshot.deleteMany({
      where: { productId, supermarket: chain },
    });
    snapshotsDeleted += res.count;
  }
  console.log(`Deleted ${different.length} mappings · unlinked ${unlinked} discounts · removed ${snapshotsDeleted} poisoned snapshots`);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
