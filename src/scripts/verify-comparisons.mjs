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
// Groq free tier: openai/gpt-oss-120b (reasoning low), ~200K tokens/day shared with the
// nightly resolvers; measured 11-22: ~290 tokens per pair (8 per request) →
// at most ~650 pairs/day, so the first full pass (1,433 pairs) takes 2–3 nights.
// Eval on the 81-pair fixture: 0 of 6 different pairs judged «same», 48 of 63
// correct pairs kept, 4 of 12 «unsure»-labelled pairs judged «same».
// A daily-budget stop exits 0: the next run resumes where this one stopped.
//
// Outside judge (works locally — no Groq): when a backlog is too big for the
// free tier, hand the pairs to another judge and import its verdicts.
//   EXPORT_FILE=pairs.json EXPORT_SCOPE=new,unsure,same node src/scripts/verify-comparisons.mjs
//   (judge pairs.json by src/scripts/comparison-judge-rules.md → out.json:
//    [{id, onlyA, onlyB, v, why}])
//   DRY_RUN=1 IMPORT_FILE=out.json IMPORT_MODEL=<name> REPLACE_UNSURE=1 node …  # report only
//   IMPORT_FILE=out.json IMPORT_MODEL=<name> REPLACE_UNSURE=1 node …            # write
// 11-22: Claude Sonnet agents judged the fixture by those rules at 0 of 6
// wrong shown, 48 of 63 kept, 0 of 12 «unsure» shown and no correct pair
// called «different» (Groq: 7) — so it may replace Groq's «unsure»; a Groq
// «same» it disagrees with is pulled down (mergeVerdict).
//
// Cross-store item links (2026-11-23, nightly): LINKS_META=<links-meta.json from
// link-items.mjs MODE=export> judges the proposed links instead of the live
// offer pairs. Word-identical pairs (lib/name-exact) are recorded without
// asking (model 'name-exact'); the rest go to Groq, most visible first, LIMIT
// per run, stopping cleanly on the daily budget. Pairs already judged are skipped.
//   LINKS_META=/tmp/link-out/links-meta.json LIMIT=400 node src/scripts/verify-comparisons.mjs
//
// dotenv first (ESM hoist trap).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { readFileSync, writeFileSync } from 'node:fs';
import { samePack } from '../lib/packaging.ts';
import { areComparableNames } from '../lib/offer-similarity.ts';
import { mergeVerdict, pairKeyOf } from '../lib/comparison-verdict.ts';
import { sameWordsAndSize } from '../lib/name-exact.ts';
import { RETIRED_SUPERMARKET_IDS } from '../lib/constants.js';

const EVAL = process.env.EVAL === '1';
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = parseInt(process.env.LIMIT || '0', 10) || Infinity;
const PACE_MS = parseInt(process.env.PACE_MS || '10000', 10);
const BATCH = 8;
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const REASONING_EFFORT = process.env.REASONING_EFFORT || 'low';
// EVAL only: score each of these efforts on the fixture, one after the other.
const EVAL_EFFORTS = (process.env.EVAL_EFFORTS || 'low').split(',').map((s) => s.trim()).filter(Boolean);
const EVAL_FILE = process.env.EVAL_FILE || 'src/scripts/fixtures/comparison-eval-pairs.json';
const EXPORT_FILE = process.env.EXPORT_FILE || '';
const EXPORT_SCOPE = (process.env.EXPORT_SCOPE || 'new').split(',').map((s) => s.trim()).filter(Boolean);
const IMPORT_FILE = process.env.IMPORT_FILE || '';
const IMPORT_MODEL = process.env.IMPORT_MODEL || '';
const REPLACE_UNSURE = process.env.REPLACE_UNSURE === '1';
const LINKS_META = process.env.LINKS_META || '';
const FINAL_MODELS = new Set(['owner', 'barcode']);
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

// The first prompt (8de40d7) judged the pair as a whole and called rye and
// wheat toast bread of one brand and size «same» ("identical brand and
// size"): it never looked at the one word that differed. A second version
// that made it list the one-sided words and treat any descriptive word as
// telling products apart showed no wrong pair but hid 29 of 63 correct ones
// (it called «Βαφή Μαλλιών», «Λακ» or the maker's name in front of the brand a
// variant). This one separates CONFLICT (both names state a detail, the
// values differ → different) from OMISSION (one chain did not write it →
// fine), and stays cautious only about one-sided edition words. Examples in
// the prompt are deliberately NOT taken from the eval fixture.
async function judgeBatch(apiKey, rows, effort = REASONING_EFFORT) {
  const list = rows
    .map((r, i) => `${i + 1}. A: "${r.nameA}"\n   B: "${r.nameB}"`)
    .join('\n');
  const prompt = `Two Greek supermarket chains each list a product. For each numbered pair, decide whether listing A and listing B are the SAME sellable item, so a shopper can fairly compare their prices.

Step 1. Write down the words that appear in only one of the two names ("onlyA", "onlyB"). Ignore capital letters, accents, word order, and the same word in Greek or English (Vanilla = Βανίλια, Lemon = Λεμόνι, Medium = Μέτρια, XL = Extra Large, 1,5lt = 1500ml, gr = g = γρ.).

Step 2. Mark each such word:
- OMITTED: something the other chain simply did not write. Chains often leave out the product type (Βαφή Μαλλιών, Σερβιέτες, Αφρόλουτρο, Υγρό Πιάτων, Ταμπόν), the company written before the brand («Nestle Nescafe» = «Nescafe»), a claim or description (Αντιβακτηριδιακό, 24ωρη προστασία, με Ενεργό Χλώριο, Κατεψυγμένο, σε Φάκελο), the ingredients spelled out, the origin, or the size or count (when the other name states no different one). Equivalent units count as the same (45 μεζούρες = 45 πλύσεις).
- VARIANT: a word that says WHICH product of the brand it is: flavour, scent, colour, shade or model number, grain or flour (Σίκαλης = rye, Σίτου = wheat, Ολικής = wholemeal), fat %, age range, or an edition the brand also sells without it (Ultra, Sensitive, Max, Pro, Light, Zero, 3σε1).

Step 3. Decide:
- "different": the brands differ, or both names state the same kind of detail with different values (rye vs wheat, two different scents, 2 vs 5 refills, shade 5/0 vs 6/0, different sizes).
- "unsure": a VARIANT word appears in one name only, or one name has no brand at all.
- "same": every one-sided word is OMITTED and nothing conflicts.
A wrong "same" shows a shopper a false price comparison.

${list}

Reply with strict JSON: {"verdicts": [{"onlyA": ["..."], "onlyB": ["..."], "v": "same" | "different" | "unsure", "why": "<at most 8 words>"}, ...]} with exactly ${rows.length} entries, in order.`;

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
        // gpt-oss reasons first, and a truncated thought is a hard 400
        // (json_validate_failed) — hence the generous completion budget.
        reasoning_effort: effort,
        include_reasoning: false,
        max_completion_tokens: 4096,
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
    const words = (w) => (Array.isArray(w) ? w.filter((s) => typeof s === 'string').join(', ') : '');
    return {
      tokens: data.usage?.total_tokens ?? 0,
      verdicts: v.map((x) => {
        const verdict = typeof x === 'string' ? x : x?.v;
        const why = typeof x?.why === 'string' ? x.why : '';
        // The owner reviews hidden pairs from this text: keep the word diff.
        const reason = `${why} [A: ${words(x?.onlyA) || '-'} | B: ${words(x?.onlyB) || '-'}]`.trim();
        return {
          verdict: VERDICTS.includes(verdict) ? verdict : 'unsure',
          reason: reason.slice(0, 300),
        };
      }),
    };
  } catch (err) {
    return { error: `parse: ${err.message}` };
  }
}

// Judge rows in batches; onBatch(batch, verdicts) persists each one as it lands.
// Returns { done, tokens, stopped?, fatal? } (tokens = Groq's own count).
async function judgeAll(apiKey, rows, onBatch, effort = REASONING_EFFORT) {
  let consecutiveErrors = 0;
  let tokens = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await judgeBatch(apiKey, batch, effort);
    if (res.error) {
      // A per-DAY 429 never clears inside this run: stop, resume next run.
      if (res.status === 429 && /per\s*day|\bTPD\b|\bRPD\b/i.test(res.error)) {
        console.log(`  Groq daily free-tier budget spent after ${i} pairs — stopping; the next run resumes.`);
        return { done: i, tokens, stopped: 'daily-budget' };
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
      if (!softError || consecutiveErrors >= 3) return { done: i, tokens, fatal: res.error };
      await sleep(PACE_MS);
      continue;
    }
    consecutiveErrors = 0;
    tokens += res.tokens;
    await onBatch(batch, res.verdicts);
    if ((i / BATCH) % 10 === 0) console.log(`  judged ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
    if (i + BATCH < rows.length) await sleep(PACE_MS);
  }
  return { done: rows.length, tokens };
}

// ── EVAL: the hand-labelled fixture ─────────────────────────────────────────

async function runEval(apiKey) {
  for (const effort of EVAL_EFFORTS) {
    await evalOnce(apiKey, effort);
    if (process.exitCode) return;
  }
}

async function evalOnce(apiKey, effort) {
  const { pairs } = JSON.parse(readFileSync(EVAL_FILE, 'utf8'));
  console.log(`\n════ EVAL: ${pairs.length} hand-labelled pairs, model ${MODEL}, reasoning ${effort}`);
  const got = new Map();
  const t0 = Date.now();
  const result = await judgeAll(apiKey, pairs, async (batch, verdicts) => {
    batch.forEach((p, j) => got.set(p.n, verdicts[j]));
  }, effort);
  console.log(`  took ${Math.round((Date.now() - t0) / 1000)} s, ${result.tokens} tokens (${Math.round(result.tokens / Math.max(1, result.done))} per pair)`);

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
        // Keyed by the two chain items («slots»): judged once, whatever their names become.
        const key = pairKeyOf(
          { chain: a.supermarket, code: a.chainItemcode, name: a.productName },
          { chain: b.supermarket, code: b.chainItemcode, name: b.productName },
        );
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
          codeA: a.chainItemcode ?? null,
          nameA: a.productName,
          chainB: b.supermarket,
          codeB: b.chainItemcode ?? null,
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
  const existingRows = await prisma.comparisonVerdict.findMany({ select: { pairKey: true, verdict: true, model: true } });
  const existing = new Map(existingRows.map((r) => [r.pairKey, r.verdict]));
  const existingFull = new Map(existingRows.map((r) => [r.pairKey, r]));
  const fresh = [...pairs.values()].filter((p) => !existing.has(p.pairKey));
  const proven = fresh.filter((p) => p.proven);
  const todo = fresh.filter((p) => !p.proven).sort((a, b) => b.priority - a.priority);
  console.log(`🔎 active offers: ${activeCount}; live cross-chain pairs the sheet could show: ${pairs.size}`);
  console.log(`   already judged: ${pairs.size - fresh.length}; new: ${fresh.length} (barcode-proven: ${proven.length}, for the model: ${todo.length})${DRY_RUN ? ' — DRY_RUN' : ''}`);

  const row = (p, v, model) => ({
    pairKey: p.pairKey, chainA: p.chainA, codeA: p.codeA, nameA: p.nameA, chainB: p.chainB, codeB: p.codeB, nameB: p.nameB,
    verdict: v.verdict, reason: v.reason, model,
  });
  // ── Outside judge: hand the pairs out as a file, take verdicts back ──────
  // EXPORT_FILE=x.json [EXPORT_SCOPE=new,unsure,same] writes [{id, nameA, nameB}]
  // (id = pairKey), most visible first. IMPORT_FILE=x.json IMPORT_MODEL=name
  // reads [{id, v, why, onlyA, onlyB}] back and stores it through
  // mergeVerdict (lib/comparison-verdict): owner/barcode rows are final,
  // «different» stays, a «same» needs the second judge to agree, and «unsure»
  // is replaced only with REPLACE_UNSURE=1. With DRY_RUN=1 the import only
  // reports what it would change.
  if (EXPORT_FILE) {
    const scopes = new Set(EXPORT_SCOPE);
    const pick = [...pairs.values()].filter((p) => {
      const e = existingFull.get(p.pairKey);
      if (!e) return scopes.has('new') && !p.proven;
      return !FINAL_MODELS.has(e.model) && scopes.has(e.verdict);
    }).sort((a, b) => b.priority - a.priority);
    writeFileSync(EXPORT_FILE, JSON.stringify(pick.map((p) => ({ id: p.pairKey, nameA: p.nameA, nameB: p.nameB })), null, 1));
    console.log(`   exported ${pick.length} pairs (${[...scopes].join(', ')}) to ${EXPORT_FILE}`);
    await prisma.$disconnect();
    return;
  }

  if (IMPORT_FILE) {
    if (!IMPORT_MODEL) throw new Error('IMPORT_MODEL is required with IMPORT_FILE');
    const incoming = JSON.parse(readFileSync(IMPORT_FILE, 'utf8'));
    const counts = { created: 0, updated: 0, unchanged: 0, notLive: 0 };
    const changes = [];
    const creates = [];
    for (const r of incoming) {
      const p = pairs.get(r.id);
      if (!p) { counts.notLive++; continue; }
      const v = VERDICTS.includes(r.v) ? r.v : 'unsure';
      const words = (w) => (Array.isArray(w) ? w.filter((s) => typeof s === 'string').join(', ') : '');
      const reason = `${typeof r.why === 'string' ? r.why : ''} [A: ${words(r.onlyA) || '-'} | B: ${words(r.onlyB) || '-'}]`.trim().slice(0, 300);
      const before = existingFull.get(r.id);
      const next = mergeVerdict(before, v, { replaceUnsure: REPLACE_UNSURE });
      if (next === null) { counts.unchanged++; continue; }
      if (!before) {
        creates.push(row(p, { verdict: next, reason }, IMPORT_MODEL));
        counts.created++;
      } else {
        changes.push({ p, before, next, reason });
        counts.updated++;
      }
      existing.set(r.id, next);
    }
    console.log(`   import from ${IMPORT_FILE} as «${IMPORT_MODEL}»${DRY_RUN ? ' — DRY_RUN, nothing written' : ''}: ${JSON.stringify(counts)}`);
    for (const c of changes) console.log(`   ${c.before.verdict} → ${c.next}: ${c.p.chainA}: ${c.p.nameA}  <>  ${c.p.chainB}: ${c.p.nameB}`);
    if (!DRY_RUN) {
      for (const batch of chunk(creates, 500)) await prisma.comparisonVerdict.createMany({ data: batch, skipDuplicates: true });
      for (const c of changes) {
        await prisma.comparisonVerdict.update({
          where: { pairKey: c.p.pairKey },
          data: { verdict: c.next, model: IMPORT_MODEL, reason: `${c.reason} · was ${c.before.verdict} (${c.before.model})`.slice(0, 400) },
        });
      }
    }
  }

  if (DRY_RUN) {
    if (!IMPORT_FILE) for (const p of todo.slice(0, 10)) console.log(`   next: ${p.chainA}: ${p.nameA}  <>  ${p.chainB}: ${p.nameB}`);
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
  const ask = IMPORT_FILE ? [] : todo.slice(0, LIMIT);
  if (ask.length > 0) {
    console.log(`   asking ${MODEL} (reasoning ${REASONING_EFFORT}) about ${ask.length} pairs`);
    result = await judgeAll(apiKey, ask, async (batch, verdicts) => {
      await prisma.comparisonVerdict.createMany({
        data: batch.map((p, j) => row(p, verdicts[j], `${MODEL} ${REASONING_EFFORT}`)),
        skipDuplicates: true,
      });
      batch.forEach((p, j) => existing.set(p.pairKey, verdicts[j].verdict));
    });
    console.log(`   judged ${result.done} pairs, ${result.tokens} Groq tokens (${Math.round(result.tokens / Math.max(1, result.done))} per pair)`);
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

// ── LINKS: proposed cross-store item links (link-items.mjs MODE=export) ─────
async function runLinks(apiKey) {
  const { default: prisma } = await import('../lib/prisma.ts');
  const meta = JSON.parse(readFileSync(LINKS_META, 'utf8'));
  const existing = new Set((await prisma.comparisonVerdict.findMany({ select: { pairKey: true } })).map((r) => r.pairKey));
  const fresh = Object.entries(meta)
    .filter(([id]) => !existing.has(id))
    .map(([id, m]) => ({
      pairKey: id,
      chainA: m.a.chain, codeA: m.a.code, nameA: m.a.name,
      chainB: m.b.chain, codeB: m.b.code, nameB: m.b.name,
      priority: m.priority ?? 0,
    }));
  const exact = fresh.filter((p) => sameWordsAndSize(p.nameA, p.nameB));
  const todo = fresh.filter((p) => !sameWordsAndSize(p.nameA, p.nameB)).sort((a, b) => b.priority - a.priority);
  console.log(`🔗 proposed links: ${Object.keys(meta).length}; new: ${fresh.length} (word-identical: ${exact.length}, for the model: ${todo.length})${DRY_RUN ? ' — DRY_RUN' : ''}`);
  const row = (p, verdict, reason, model) => ({
    pairKey: p.pairKey, chainA: p.chainA, codeA: p.codeA, nameA: p.nameA, chainB: p.chainB, codeB: p.codeB, nameB: p.nameB,
    verdict, reason: `link · ${reason}`.slice(0, 300), model,
  });
  if (DRY_RUN) {
    for (const p of todo.slice(0, 10)) console.log(`   next: ${p.chainA}: ${p.nameA}  <>  ${p.chainB}: ${p.nameB}`);
    await prisma.$disconnect();
    return;
  }
  for (const batch of chunk(exact, 500)) {
    await prisma.comparisonVerdict.createMany({
      data: batch.map((p) => row(p, 'same', 'same words and size after folding', 'name-exact')),
      skipDuplicates: true,
    });
  }
  console.log(`   recorded ${exact.length} word-identical links`);
  let result = { done: 0, tokens: 0 };
  const ask = apiKey ? todo.slice(0, LIMIT) : [];
  if (!apiKey && todo.length) console.log('   GROQ_API_KEY not set — only the word-identical links were recorded');
  if (ask.length > 0) {
    console.log(`   asking ${MODEL} (reasoning ${REASONING_EFFORT}) about ${ask.length} links`);
    result = await judgeAll(apiKey, ask, async (batch, verdicts) => {
      await prisma.comparisonVerdict.createMany({
        data: batch.map((p, j) => row(p, verdicts[j].verdict, verdicts[j].reason, `${MODEL} ${REASONING_EFFORT}`)),
        skipDuplicates: true,
      });
    });
    console.log(`   judged ${result.done} links, ${result.tokens} Groq tokens`);
  }
  await prisma.$disconnect();
  if (result.fatal) { console.error(`
❌ stopped: ${result.fatal}`); process.exitCode = 1; }
}

const apiKey = process.env.GROQ_API_KEY;
if (!DRY_RUN && !EXPORT_FILE && !IMPORT_FILE && !LINKS_META && !apiKey) { console.error('❌ GROQ_API_KEY not set'); process.exit(1); }
(EVAL ? runEval(apiKey) : LINKS_META ? runLinks(apiKey) : runLive(apiKey)).catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
