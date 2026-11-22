// AI check of every comparison pair (owner decision 2026-11-22: "AI check of
// each pair"). The comparison sheet, «cheaper elsewhere» and the card chip
// put two chains' listings side by side as THE SAME product. The rule guards
// (pack, variant, quantity, number, name similarity) still let through about
// 1 in 12–18 different products (Palmolive Pink vs Mineral Massage, rye vs
// wheat toast bread). So every live cross-chain pair the rules allow is judged
// ONCE here and the verdict stored in comparison_verdicts; the readers hide
// what is not confirmed (src/lib/comparison-verdict.ts, VERDICT_MODE).
//
// What gets judged: exactly the pairs the sheet could show — active, publicly
// visible offers on one productId, from two different chains, passing
// samePack + areComparableNames (filterComparable's guards). Pairs where BOTH
// chain SKUs were matched to the product by their own barcode are recorded as
// «same» without asking the model (model = 'barcode'). Existing rows are never
// re-judged or overwritten, so an owner correction (model = 'owner') sticks.
// Pairs are judged most-visible first (higher hotScore).
//
// Usage (Groq is blocked from the dev PC — run in CI, see scrape-chains.yml):
//   DRY_RUN=1 node src/scripts/verify-comparisons.mjs   # count pairs, no Groq, no writes (works locally)
//   EVAL=1 node src/scripts/verify-comparisons.mjs      # judge the hand-labelled fixture, no DB
//   LIMIT=200 node src/scripts/verify-comparisons.mjs   # judge up to 200 new pairs
//   node src/scripts/verify-comparisons.mjs             # judge every new pair (stops cleanly on the daily budget)
//
// Groq free tier: openai/gpt-oss-120b, ~200K tokens/day shared with the
// nightly resolvers; 8 pairs per request ≈ 1.3K tokens → ~1,200 pairs/day.
// A daily-budget stop exits 0: the next run resumes where this one stopped.
//
// dotenv first (ESM hoist trap).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { readFileSync } from 'node:fs';
import { samePack } from '../lib/packaging.ts';
import { areComparableNames } from '../lib/offer-similarity.ts';
import { pairKey } from '../lib/comparison-verdict.ts';
import { RETIRED_SUPERMARKET_IDS } from '../lib/constants.js';

const EVAL = process.env.EVAL === '1';
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = parseInt(process.env.LIMIT || '0', 10) || Infinity;
const PACE_MS = parseInt(process.env.PACE_MS || '10000', 10);
const BATCH = 8;
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const EVAL_FILE = process.env.EVAL_FILE || 'src/scripts/fixtures/comparison-eval-pairs.json';
const VERDICTS = ['same', 'different', 'unsure'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// JS twin of lib/public-deal-filters PUBLIC_DEAL_VISIBILITY_WHERE (same as
// recompute-comparison-counts.mjs): hidden rows are never shown, never judged.
const publiclyVisible = (d) =>
  d.supermarket !== 'mymarket' || d.originalPrice != null || d.description != null;

// ── Groq ─────────────────────────────────────────────────────────────────────

async function judgeBatch(apiKey, rows) {
  const list = rows
    .map((r, i) => `${i + 1}. A: "${r.nameA}"\n   B: "${r.nameB}"`)
    .join('\n');
  const prompt = `Two Greek supermarket chains each list a product. For each numbered pair, decide whether listing A and listing B are the SAME sellable item, so a shopper can fairly compare their prices: same brand, same product line and variant (flavour, scent, colour, shade number, model, type such as rye vs wheat or sensitive vs regular), same size or weight, and the same pack contents (number of pieces, refills, gifts).

The chains write names differently. None of these make items different: word order, capital letters, abbreviations (ΚΤΨ = κατεψυγμένο, ΑΠΟΣΜ/ΚΟ = αποσμητικό), Greek vs Latin spelling or translation of the same word (Vanilla = Βανίλια, Orange = Πορτοκάλι), units written differently (gr = g = γρ.), or one chain adding a generic description (Κατεψυγμένο, Υγρό Απορρυπαντικό Πιάτων, Αφρόλουτρο).

Answer "different" when any brand, line, variant, size or pack detail conflicts. Answer "unsure" when a detail you would need is missing from one name (for example one name has no brand, or names a variant the other does not mention). Answer "same" only when you are confident: a wrong "same" shows a shopper a false price comparison.

${list}

Reply with strict JSON: {"verdicts": [{"v": "same" | "different" | "unsure", "why": "<at most 8 words>"}, ...]} with exactly ${rows.length} entries, in order.`;

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
        // Same settings as audit-mappings.mjs: gpt-oss reasons first, and a
        // truncated thought is a hard 400 (json_validate_failed).
        reasoning_effort: 'low',
        include_reasoning: false,
        max_completion_tokens: 2048,
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    return { error: `network: ${err.message || err.name}` };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { error: `${res.status}: ${body.slice(0, 200)}`, status: res.status };
  }
  try {
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
    const v = parsed.verdicts;
    if (!Array.isArray(v) || v.length !== rows.length) return { error: `bad shape: ${JSON.stringify(v).slice(0, 100)}` };
    return {
      verdicts: v.map((x) => {
        const verdict = typeof x === 'string' ? x : x?.v;
        return {
          verdict: VERDICTS.includes(verdict) ? verdict : 'unsure',
          reason: typeof x?.why === 'string' ? x.why.slice(0, 160) : null,
        };
      }),
    };
  } catch (err) {
    return { error: `parse: ${err.message}` };
  }
}

// Judge rows in batches; onBatch(batch, verdicts) persists each one as it lands.
// Returns { done, stopped? , fatal? }.
async function judgeAll(apiKey, rows, onBatch) {
  let consecutiveErrors = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await judgeBatch(apiKey, batch);
    if (res.error) {
      // A per-DAY 429 never clears inside this run: stop, resume next run.
      if (res.status === 429 && /per\s*day|\bTPD\b|\bRPD\b/i.test(res.error)) {
        console.log(`  Groq daily free-tier budget spent after ${i} pairs — stopping; the next run resumes.`);
        return { done: i, stopped: 'daily-budget' };
      }
      if (res.status === 429) {
        console.log(`  batch ${i / BATCH + 1}: per-minute limit — backing off 60s`);
        await sleep(60000);
        i -= BATCH;
        continue;
      }
      consecutiveErrors++;
      console.log(`  batch ${i / BATCH + 1}: ${res.error}`);
      // Auth/billing/model errors will not heal on the next batch. A malformed
      // answer for one batch (bad shape, json_validate_failed) might: skip it,
      // its pairs stay unjudged and are asked again next run.
      const softError = !res.status || /json_validate_failed|output_parse/i.test(res.error);
      if (!softError || consecutiveErrors >= 3) return { done: i, fatal: res.error };
      await sleep(PACE_MS);
      continue;
    }
    consecutiveErrors = 0;
    await onBatch(batch, res.verdicts);
    if ((i / BATCH) % 10 === 0) console.log(`  judged ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
    if (i + BATCH < rows.length) await sleep(PACE_MS);
  }
  return { done: rows.length };
}

// ── EVAL: the hand-labelled fixture ─────────────────────────────────────────

async function runEval(apiKey) {
  const { pairs } = JSON.parse(readFileSync(EVAL_FILE, 'utf8'));
  console.log(`EVAL: ${pairs.length} hand-labelled pairs, model ${MODEL}`);
  const got = new Map();
  const result = await judgeAll(apiKey, pairs, async (batch, verdicts) => {
    batch.forEach((p, j) => got.set(p.n, verdicts[j]));
  });

  const table = {};
  for (const label of VERDICTS) table[label] = { same: 0, different: 0, unsure: 0, unjudged: 0 };
  for (const p of pairs) table[p.label][got.get(p.n)?.verdict ?? 'unjudged']++;
  console.log('\nlabel → model verdict');
  for (const label of VERDICTS) console.log(`  ${label.padEnd(9)} ${JSON.stringify(table[label])}`);

  const count = (label) => pairs.filter((p) => p.label === label).length;
  console.log(`\nWRONG pairs the model would SHOW: ${table.different.same} of ${count('different')}   ← must be 0`);
  console.log(`Correct pairs the model keeps:    ${table.same.same} of ${count('same')}`);
  console.log(`Unsure-labelled pairs it shows:   ${table.unsure.same} of ${count('unsure')}`);

  console.log('\nEvery disagreement:');
  for (const p of pairs) {
    const g = got.get(p.n);
    if (!g || g.verdict === p.label) continue;
    console.log(`  #${p.n} label=${p.label} model=${g.verdict} (${g.reason ?? '-'})\n      A ${p.chainA}: ${p.nameA}\n      B ${p.chainB}: ${p.nameB}`);
  }
  if (result.fatal) { console.error(`\n❌ stopped: ${result.fatal}`); process.exitCode = 1; }
}

// ── Live pairs ──────────────────────────────────────────────────────────────

async function livePairs(prisma, now) {
  const active = await prisma.discount.findMany({
    where: { isActive: true, validUntil: { gt: now }, productId: { not: null } },
    select: {
      id: true,
      productId: true,
      productName: true,
      supermarket: true,
      originalPrice: true,
      description: true,
      chainItemcode: true,
      hotScore: true,
    },
  });

  const barcodeMapped = new Set(
    (await prisma.chainProductMapping.findMany({
      where: { matchedVia: 'barcode' },
      select: { supermarket: true, chainItemcode: true, productId: true },
    })).map((m) => `${m.supermarket}|${m.chainItemcode}|${m.productId}`)
  );
  const barcodeProven = (d) => d.chainItemcode != null && barcodeMapped.has(`${d.supermarket}|${d.chainItemcode}|${d.productId}`);

  const byPid = new Map();
  for (const d of active) {
    if (!publiclyVisible(d) || RETIRED_SUPERMARKET_IDS.has(d.supermarket)) continue;
    const arr = byPid.get(d.productId) || [];
    arr.push(d);
    byPid.set(d.productId, arr);
  }

  const pairs = new Map();
  for (const cluster of byPid.values()) {
    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const a = cluster[i];
        const b = cluster[j];
        if (a.supermarket === b.supermarket) continue;
        if (!samePack(a.productName, b.productName) || !areComparableNames(a.productName, b.productName)) continue;
        const key = pairKey(a.supermarket, a.productName, b.supermarket, b.productName);
        const priority = Math.max(a.hotScore ?? 0, b.hotScore ?? 0);
        const proven = barcodeProven(a) && barcodeProven(b);
        const prev = pairs.get(key);
        if (prev) {
          prev.priority = Math.max(prev.priority, priority);
          prev.proven ||= proven;
          continue;
        }
        pairs.set(key, {
          pairKey: key,
          chainA: a.supermarket,
          nameA: a.productName,
          chainB: b.supermarket,
          nameB: b.productName,
          priority,
          proven,
        });
      }
    }
  }
  return { activeCount: active.length, pairs };
}

async function runLive(apiKey) {
  const { default: prisma } = await import('../lib/prisma.ts');
  const now = new Date();
  const { activeCount, pairs } = await livePairs(prisma, now);
  const existing = new Map(
    (await prisma.comparisonVerdict.findMany({ select: { pairKey: true, verdict: true } })).map((r) => [r.pairKey, r.verdict])
  );
  const fresh = [...pairs.values()].filter((p) => !existing.has(p.pairKey));
  const proven = fresh.filter((p) => p.proven);
  const todo = fresh.filter((p) => !p.proven).sort((a, b) => b.priority - a.priority);
  console.log(`🔎 active offers: ${activeCount}; live cross-chain pairs the sheet could show: ${pairs.size}`);
  console.log(`   already judged: ${pairs.size - fresh.length}; new: ${fresh.length} (barcode-proven: ${proven.length}, for the model: ${todo.length})${DRY_RUN ? ' — DRY_RUN' : ''}`);

  const row = (p, v, model) => ({
    pairKey: p.pairKey, chainA: p.chainA, nameA: p.nameA, chainB: p.chainB, nameB: p.nameB,
    verdict: v.verdict, reason: v.reason, model,
  });
  if (DRY_RUN) {
    for (const p of todo.slice(0, 10)) console.log(`   next: ${p.chainA}: ${p.nameA}  <>  ${p.chainB}: ${p.nameB}`);
    await prisma.$disconnect();
    return;
  }

  for (const batch of chunk(proven, 500)) {
    await prisma.comparisonVerdict.createMany({
      data: batch.map((p) => row(p, { verdict: 'same', reason: 'same barcode at both chains' }, 'barcode')),
      skipDuplicates: true,
    });
    for (const p of batch) existing.set(p.pairKey, 'same');
  }

  let result = { done: 0 };
  const ask = todo.slice(0, LIMIT);
  if (ask.length > 0) {
    console.log(`   asking ${MODEL} about ${ask.length} pairs`);
    result = await judgeAll(apiKey, ask, async (batch, verdicts) => {
      await prisma.comparisonVerdict.createMany({
        data: batch.map((p, j) => row(p, verdicts[j], MODEL)),
        skipDuplicates: true,
      });
      batch.forEach((p, j) => existing.set(p.pairKey, verdicts[j].verdict));
    });
  }

  // Where every LIVE pair stands now — the number to watch before switching
  // VERDICT_MODE to 'require-same' (every live pair judged).
  const tally = { same: 0, different: 0, unsure: 0, unjudged: 0 };
  const hidden = [];
  for (const p of pairs.values()) {
    const v = existing.get(p.pairKey) ?? 'unjudged';
    tally[VERDICTS.includes(v) ? v : 'unjudged']++;
    if (v === 'different' || v === 'unsure') hidden.push({ ...p, v });
  }
  console.log(`\n🏁 live pairs: ${pairs.size} → ${JSON.stringify(tally)}`);
  console.log(`   hidden from shoppers (different/unsure), most visible first — owner review:`);
  for (const p of hidden.sort((a, b) => b.priority - a.priority).slice(0, 40)) {
    console.log(`   [${p.v}] ${p.chainA}: ${p.nameA}  <>  ${p.chainB}: ${p.nameB}`);
  }
  await prisma.$disconnect();
  if (result.fatal) { console.error(`\n❌ stopped: ${result.fatal}`); process.exitCode = 1; }
}

const apiKey = process.env.GROQ_API_KEY;
if (!DRY_RUN && !apiKey) { console.error('❌ GROQ_API_KEY not set'); process.exit(1); }
(EVAL ? runEval(apiKey) : runLive(apiKey)).catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
