// LINK-01 — offline cross-chain product linking: evaluate, then propose links.
//
// READ-ONLY on data: reads JSON-lines exports (no database, no network) and
// writes reports under <repo>/.local-scratch/LINK-01/. Nothing here applies a
// link; that is a separate owner decision.
//
//   LINK_DATA_DIR=<dir with products/mappings/chain_names/shelf_prices .jsonl>
//   LINK_OUT_DIR=<output dir>        (default <repo>/.local-scratch/LINK-01)
//   LINK_THRESHOLD=0.xx              (override the train-chosen threshold)
//   LINK_SEED=n                      (sampling seed, default 1111)
//   LINK_REQUIRE_SIZE=0              (allow links when a name states no size; default: required)
//   LINK_NO_BRAND_FIELD=1            (ignore products.brand; reproduces the first runs)
//
//   node src/scripts/link-products-offline.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildLinkContext, parseName, scoreParsed, phoneticKey,
} from '../lib/product-linker.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const DATA = process.env.LINK_DATA_DIR
  || 'C:/Users/Work/prosforespantou-next/.local-scratch/audit-1111/data';
const OUT = process.env.LINK_OUT_DIR || path.join(REPO, '.local-scratch', 'LINK-01');
const SEED = Number(process.env.LINK_SEED || 1111);

// ───────── tiny deterministic helpers ─────────
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const splitOf = (productId) => (hashStr(productId + ':link01') % 100 < 55 ? 'train' : 'test');
const readJsonl = (f) => fs.readFileSync(path.join(DATA, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const pct = (x) => (x * 100).toFixed(1) + '%';
const STRONG = new Set(['barcode', 'catalog', null]);

// AB keeps the brand in its own field and leaves it out of the name («Φρέσκο
// Γάλα Πλήρες 1lt», brand ΔΕΛΤΑ; 99 % of AB products have the field). Taking the
// name's first word as the brand then pairs a brandless name with whichever
// brand matches the rest — the 11-13 hand review found 16 right of 39 AB
// proposals, one of them AB milk linked to ΜΑΡΑΤΑ, Σκλαβενίτης' own label.
// products.brand belongs to the chain that created the record, so it is only
// put in front of that chain's name, and only when the name lacks it.
const USE_BRAND_FIELD = !process.env.LINK_NO_BRAND_FIELD;
const foldWords = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ')
  .split(/[^a-z0-9α-ω]+/).filter((w) => w.length >= 2);
function withBrand(name, brand) {
  if (!USE_BRAND_FIELD || !brand) return name;
  const words = foldWords(brand);
  if (!words.length) return name; // «-»
  const have = new Set(foldWords(name).map((w) => phoneticKey(w)));
  return have.has(phoneticKey(words[0])) ? name : `${String(brand).trim()} ${name}`;
}

// ───────── load + build items ─────────
function loadItems() {
  const products = readJsonl('products.jsonl');
  const mappings = readJsonl('mappings.jsonl');
  const names = readJsonl('chain_names.jsonl');
  const shelf = readJsonl('shelf_prices.jsonl');

  const prodById = new Map(products.map((p) => [p.id, p]));
  const viaOf = new Map(); // productId|chain -> via
  const viasByProduct = new Map();
  for (const m of mappings) {
    viaOf.set(`${m.productId}|${m.chain}`, m.via);
    if (!viasByProduct.has(m.productId)) viasByProduct.set(m.productId, []);
    viasByProduct.get(m.productId).push(m);
  }
  const shelfBy = new Map();
  for (const s of shelf) shelfBy.set(`${s.productId}|${s.chain}`, s);

  const cnBy = new Map();
  for (const c of names) {
    const k = `${c.productId}|${c.chain}`;
    const prev = cnBy.get(k);
    if (!prev || (!prev.active && c.active)) cnBy.set(k, c);
  }

  const items = []; // one per (product, chain)
  for (const p of products) {
    const chains = [...new Set(p.chains)];
    const lacking = chains.filter((c) => !cnBy.has(`${p.id}|${c}`));
    // product.name belongs to the chain that created the record. Certain for a
    // single-chain product; for multi-chain we only use it when exactly one
    // chain has no chain-side name of its own (the only place it can be from).
    const originChain = chains.length === 1 ? chains[0] : (lacking.length === 1 ? lacking[0] : null);
    for (const c of chains) {
      const k = `${p.id}|${c}`;
      const cn = cnBy.get(k);
      let name = null;
      let price = null;
      let active = false;
      if (cn) { name = cn.name; price = cn.price; active = !!cn.active; }
      else if (c === originChain) name = p.name;
      if (!name) continue;
      const rawName = name;
      if (c === originChain) name = withBrand(name, p.brand);
      const sh = shelfBy.get(k);
      let at = null;
      if (price == null && sh) price = sh.price;
      if (sh && price === sh.price) at = Date.parse(sh.recordedAt);
      items.push({
        id: k, productId: p.id, chain: c, name, rawName, price, at, active,
        barcode: p.barcode, via: viaOf.get(k) ?? null, nChains: chains.length, fromProductName: !cn,
      });
    }
  }
  return { products, prodById, items, viasByProduct, brands: products.map((p) => p.brand).filter(Boolean) };
}

// ───────── ground truth ─────────
function buildTruth(items, viasByProduct) {
  const byProduct = new Map();
  for (const it of items) {
    if (!byProduct.has(it.productId)) byProduct.set(it.productId, []);
    byProduct.get(it.productId).push(it);
  }
  const positives = [];
  let strictOnly = 0;
  for (const [pid, its] of byProduct) {
    if (!its[0].barcode) continue;
    const ms = viasByProduct.get(pid) || [];
    if (!ms.length || !ms.every((m) => STRONG.has(m.via))) continue;
    const distinctChains = new Set(its.map((i) => i.chain));
    if (distinctChains.size < 2) continue;
    const strict = ms.every((m) => m.via === 'barcode' || m.via === 'catalog');
    for (let i = 0; i < its.length; i++) {
      for (let j = i + 1; j < its.length; j++) {
        if (its[i].chain === its[j].chain) continue;
        if (strict) strictOnly += 1;
        positives.push({ a: its[i], b: its[j], label: 1, kind: 'pos', strict });
      }
    }
  }

  // Negatives. Barcodes are NOT usable as negative labels: the first run showed
  // bazaar/kritikos pairs with different barcodes that are plainly the same
  // item (split duplicate records — exactly what this tool hunts). Labels that
  // ARE reliable: one chain sells two different SKUs as two items.
  //  sib-cross: P is a known multi-chain item (P@x, P@y). Any OTHER product Q
  //             at chain y is a different item from P@x, because chain y lists
  //             both P@y and Q. Hard variant: Q shares P's first word (brand).
  //  sib-same : two different products at the SAME chain sharing a first word.
  //  random   : random cross-chain pairs (easy; sanity only).
  const trusted = (i) => i.nChains === 1 || STRONG.has(i.via);
  const pool = items.filter(trusted);
  const firstKey = (it) => phoneticKey(foldFirst(it.name));
  const poolBy = new Map(); // chain|brandkey -> items
  for (const it of pool) {
    const k = it.chain + '|' + firstKey(it);
    if (!poolBy.has(k)) poolBy.set(k, []);
    poolBy.get(k).push(it);
  }
  const negatives = [];
  const seen = new Set();
  const addNeg = (a, b, kind) => {
    if (a.productId === b.productId) return;
    if (splitOf(a.productId) !== splitOf(b.productId)) return;
    const k = a.id < b.id ? `${a.id}#${b.id}` : `${b.id}#${a.id}`;
    if (seen.has(k)) return;
    seen.add(k);
    negatives.push({ a, b, label: 0, kind });
  };
  const pickSome = (arr, n) => {
    const c = [...arr]; const out = [];
    while (out.length < n && c.length) out.push(c.splice(Math.floor(rand() * c.length), 1)[0]);
    return out;
  };
  for (const p of positives) {
    for (const [from, to] of [[p.a, p.b], [p.b, p.a]]) {
      const group = (poolBy.get(to.chain + '|' + firstKey(from)) || []).filter((q) => q.productId !== to.productId && q.productId !== from.productId);
      for (const q of pickSome(group, 4)) addNeg(from, q, 'sib-cross');
    }
  }
  const SAME_CAP = 9000;
  const sameCands = [];
  for (const group of poolBy.values()) {
    if (group.length < 2) continue;
    for (const a of group) {
      const others = group.filter((q) => q.productId !== a.productId);
      for (const q of pickSome(others, 2)) sameCands.push([a, q]);
    }
  }
  for (const [a, q] of pickSome(sameCands, SAME_CAP)) addNeg(a, q, 'sib-same');
  for (let n = 0; n < 2000; n++) {
    const a = pool[Math.floor(rand() * pool.length)];
    const b = pool[Math.floor(rand() * pool.length)];
    if (a.chain !== b.chain) addNeg(a, b, 'random');
  }
  return { positives, negatives, strictOnly };
}

function foldFirst(name) {
  const t = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ').replace(/['’`´^]/g, '');
  return t.split(/[^a-z0-9α-ω]+/).filter((w) => w.length >= 2)[0] || '';
}

// ───────── evaluation ─────────
function makeScorer(ctx) {
  const cache = new Map();
  const parse = (it) => {
    let p = cache.get(it.id);
    if (!p) { p = parseName(it.name, ctx); cache.set(it.id, p); }
    return p;
  };
  const score = (a, b) => scoreParsed(parse(a), parse(b), a, b, ctx);
  return { parse, score };
}

function curve(pairs, thresholds, negWeight = 1) {
  return thresholds.map((t) => {
    let tp = 0; let fp = 0; let fn = 0;
    for (const p of pairs) {
      const hit = p.r.veto === null && p.r.score >= t;
      if (p.label === 1) { if (hit) tp++; else fn++; }
      else if (hit) fp++;
    }
    const w = fp * negWeight;
    return { t, tp, fp, fn, precision: tp + w ? tp / (tp + w) : 1, recall: tp + fn ? tp / (tp + fn) : 0 };
  });
}

function chooseThreshold(trainPairs, targetPrecision) {
  const ts = [];
  for (let t = 0.3; t <= 1.0001; t += 0.01) ts.push(Math.round(t * 100) / 100);
  const c = curve(trainPairs, ts);
  const ok = c.filter((x) => x.precision >= targetPrecision && x.tp > 0);
  return ok.length ? ok[0].t : null;
}

function mdTable(rows, cols) {
  const head = `| ${cols.map((c) => c[0]).join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n`;
  return head + rows.map((r) => `| ${cols.map((c) => c[1](r)).join(' | ')} |`).join('\n') + '\n';
}

function samplePositives(positives, n) {
  const copy = [...positives];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

// ───────── retrieval (the real job) ─────────
function sizeKey(p) {
  const s = p.size.sizes[0];
  return s ? `${s.dim}:${Math.round(s.total)}` : null;
}

function buildIndex(items, parse) {
  // index by 4-char prefix of every token key -> item list (blocking)
  const idx = new Map();
  const byChainBrand = new Map();
  for (const it of items) {
    const p = parse(it);
    const seen = new Set();
    for (const t of p.tokens) {
      const k = t.key.slice(0, 4);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(it);
    }
    if (p.brand) {
      const bk = p.brand.split(' ')[0].slice(0, 4);
      if (!byChainBrand.has(bk)) byChainBrand.set(bk, []);
      byChainBrand.get(bk).push(it);
    }
  }
  return { idx, byBrand: byChainBrand };
}

// sameProductOk: the retrieval simulation asks for the item of the SAME product
// at another chain (that is the ground truth), so it must stay a candidate; the
// real job links separate product records and skips it.
function candidatesFor(a, index, parse, sameProductOk = false) {
  const pa = parse(a);
  const set = new Map();
  if (!pa.brand) return [];
  // B contains A's brand as a token
  for (const k of pa.brand.split(' ')) {
    for (const b of index.idx.get(k.slice(0, 4)) || []) set.set(b.id, b);
  }
  // A contains B's brand as a token
  for (const t of pa.tokens) {
    for (const b of index.byBrand.get(t.key.slice(0, 4)) || []) set.set(b.id, b);
  }
  return [...set.values()].filter((b) => b.chain !== a.chain && (sameProductOk || b.productId !== a.productId));
}

/** best candidate per other chain for source item a, with margin to the runner-up */
function bestPerChain(a, index, scorer, minScore, sameProductOk = false) {
  const byChain = new Map();
  for (const b of candidatesFor(a, index, scorer.parse, sameProductOk)) {
    const r = scorer.score(a, b);
    if (r.veto || r.score < minScore) continue;
    if (!byChain.has(b.chain)) byChain.set(b.chain, []);
    byChain.get(b.chain).push({ b, r });
  }
  const out = [];
  for (const [chain, list] of byChain) {
    list.sort((x, y) => y.r.score - x.r.score);
    const second = list[1] ? list[1].r.score : 0;
    out.push({ chain, b: list[0].b, r: list[0].r, margin: list[0].r.score - second, nCand: list.length });
  }
  return out;
}

// ───────── main ─────────
function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const { products, items, viasByProduct, brands } = loadItems();
  const ctx = buildLinkContext(items.map((i) => i.name), brands);
  ctx.requireSameSize = process.env.LINK_REQUIRE_SIZE !== '0';
  const scorer = makeScorer(ctx);
  console.log(`items ${items.length}, products ${products.length}`);

  const truth = buildTruth(items, viasByProduct);
  const splitPairs = { train: [], test: [] };
  for (const p of [...truth.positives, ...truth.negatives]) {
    const sp = splitOf(p.a.productId);
    if (sp !== splitOf(p.b.productId)) continue;
    splitPairs[sp].push({ ...p, r: scorer.score(p.a, p.b) });
  }
  const cnt = (arr, f) => arr.filter(f).length;
  const sizes = {};
  for (const sp of ['train', 'test']) {
    const a = splitPairs[sp];
    sizes[sp] = { pos: cnt(a, (p) => p.label === 1), cross: cnt(a, (p) => p.kind === 'sib-cross'), same: cnt(a, (p) => p.kind === 'sib-same'), rand: cnt(a, (p) => p.kind === 'random') };
  }
  console.log('set sizes', JSON.stringify(sizes), 'positives strict-only', truth.strictOnly);

  // threshold chosen on TRAIN only
  const TARGET = 0.98;
  const chosen = process.env.LINK_THRESHOLD ? Number(process.env.LINK_THRESHOLD) : chooseThreshold(splitPairs.train, TARGET);
  const thr95Train = chooseThreshold(splitPairs.train, 0.95);
  const THRESH = chosen ?? 0.95;
  console.log('threshold(train, p>=98%)', chosen, ' p>=95%', thr95Train);

  const grid = [];
  for (let t = 0.4; t <= 1.0001; t += 0.05) grid.push(Math.round(t * 100) / 100);
  if (!grid.includes(THRESH)) grid.push(THRESH);
  if (thr95Train && !grid.includes(thr95Train)) grid.push(thr95Train);
  grid.sort((x, y) => x - y);

  // ----- eval.md -----
  let md = `# LINK-01 offline evaluation\n\nGenerated ${new Date().toISOString()} from \`${DATA}\`.\n\n`;
  md += `## Ground truth\n\n- Items (product x chain with a chain-side name): ${items.length}\n`;
  md += `- Positives: products with a barcode, mapped at >= 2 chains, every mapping via barcode / catalog / legacy-null (no \`cache\`). `;
  md += `Strict barcode+catalog only: ${truth.strictOnly} pairs (legacy-null mappings added because bazaar/kritikos publish barcodes; see the positive audit in the report).\n`;
  md += `- Hard negatives: same first word (brand), different chain, different barcode. Random negatives: random cross-chain pairs with different barcodes.\n`;
  md += `- Split by product id (hash, 55/45); pairs that straddle the split are dropped.\n\n`;
  md += mdTable(['train', 'test'].map((sp) => ({ sp, ...sizes[sp] })), [
    ['split', (r) => r.sp], ['positives', (r) => r.pos], ['sib-cross negatives', (r) => r.cross], ['sib-same negatives', (r) => r.same], ['random negatives', (r) => r.rand],
  ]);
  md += `\nThreshold chosen on TRAIN for precision >= 98%: **${chosen ?? 'not reachable'}**; for >= 95%: **${thr95Train ?? 'not reachable'}**.\n\n`;

  for (const sp of ['train', 'test']) {
    md += `## Precision / recall by threshold — ${sp}\n\n`;
    const c1 = curve(splitPairs[sp], grid);
    const c10 = curve(splitPairs[sp], grid, 10);
    md += mdTable(c1.map((c, i) => ({ ...c, p10: c10[i].precision })), [
      ['threshold', (r) => r.t.toFixed(2)], ['TP', (r) => r.tp], ['FP', (r) => r.fp], ['FN', (r) => r.fn],
      ['precision', (r) => pct(r.precision)], ['recall', (r) => pct(r.recall)], ['precision if negatives x10', (r) => pct(r.p10)],
    ]);
    md += '\n';
  }

  // test at chosen thresholds
  const tc = (t) => curve(splitPairs.test, [t])[0];
  const atChosen = chosen != null ? tc(chosen) : null;
  const at95 = thr95Train != null ? tc(thr95Train) : null;
  md += `## Test result at the train-chosen thresholds\n\n`;
  md += mdTable([
    atChosen && { name: 'train P>=98%', ...atChosen },
    at95 && { name: 'train P>=95%', ...at95 },
  ].filter(Boolean), [
    ['rule', (r) => r.name], ['threshold', (r) => r.t.toFixed(2)], ['TP', (r) => r.tp], ['FP', (r) => r.fp],
    ['precision', (r) => pct(r.precision)], ['recall', (r) => pct(r.recall)],
  ]);

  // veto breakdown on positives (why are we losing recall?)
  const vetoPos = {};
  for (const p of [...splitPairs.train, ...splitPairs.test].filter((x) => x.label === 1)) {
    const k = p.r.veto ?? (p.r.score >= THRESH ? 'LINKED' : 'below-threshold');
    vetoPos[k] = (vetoPos[k] || 0) + 1;
  }
  md += `\n## Why positives are not linked (train+test, at threshold ${THRESH})\n\n`;
  md += mdTable(Object.entries(vetoPos).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ k, v })), [['outcome', (r) => r.k], ['positives', (r) => r.v]]);

  // per chain pair
  const pairKey = (p) => [p.a.chain, p.b.chain].sort().join(' / ');
  const byPair = new Map();
  for (const p of [...splitPairs.train, ...splitPairs.test]) {
    const k = pairKey(p);
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(p);
  }
  md += `\n## Per chain pair (train+test pooled, threshold ${THRESH})\n\n`;
  md += mdTable([...byPair.entries()].map(([k, arr]) => ({ k, ...curve(arr, [THRESH])[0], npos: cnt(arr, (x) => x.label === 1) }))
    .filter((r) => r.npos > 0 || r.fp > 0).sort((x, y) => y.npos - x.npos), [
    ['chain pair', (r) => r.k], ['positives', (r) => r.npos], ['TP', (r) => r.tp], ['FP', (r) => r.fp],
    ['precision', (r) => pct(r.precision)], ['recall', (r) => pct(r.recall)],
  ]);

  // confusion examples
  const fmt = (p) => `- [${p.a.chain}] ${p.a.name} (${p.a.price ?? '?'}) <> [${p.b.chain}] ${p.b.name} (${p.b.price ?? '?'}) — score ${p.r.score.toFixed(2)}${p.r.veto ? ' veto:' + p.r.veto : ''} [${p.kind}] {${p.r.reasons.join(', ')}}`;
  const all = [...splitPairs.train, ...splitPairs.test];
  const fps = all.filter((p) => p.label === 0 && !p.r.veto && p.r.score >= THRESH).sort((x, y) => y.r.score - x.r.score);
  const fns = all.filter((p) => p.label === 1 && (p.r.veto || p.r.score < THRESH)).sort((x, y) => y.r.score - x.r.score);
  md += `\n## False positives at ${THRESH} (negatives we would link — check for ground-truth noise: duplicate barcodes)\n\n${fps.slice(0, 40).map(fmt).join('\n') || '(none)'}\n`;
  md += `\n## Missed positives (sample of 40 of ${fns.length})\n\n${fns.slice(0, 40).map(fmt).join('\n')}\n`;
  const vetoNeg = {};
  for (const p of all.filter((x) => x.label === 0)) vetoNeg[p.r.veto ?? 'no-veto'] = (vetoNeg[p.r.veto ?? 'no-veto'] || 0) + 1;
  md += `\n## How negatives were rejected\n\n${mdTable(Object.entries(vetoNeg).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ k, v })), [['veto', (r) => r.k], ['negatives', (r) => r.v]])}\n`;

  // positive audit sample
  const audit = samplePositives(truth.positives, 50);
  fs.writeFileSync(path.join(OUT, 'positive-audit.md'), '# 50 random ground-truth positives (label by eye: same item?)\n\n' + audit.map((p, i) => `${i + 1}. [${p.a.chain}] ${p.a.name} <> [${p.b.chain}] ${p.b.name}`).join('\n') + '\n');

  // ----- retrieval simulation on the test split -----
  const sim = simulateRetrieval(items, truth, scorer, THRESH);
  md += `\n## Retrieval simulation (the real job, on test-split barcoded multi-chain products)\n\n`;
  md += `For each test positive pair (A at chain x, B at chain y) the job searches ALL test-split items at chain y for A's best candidate (blocking, vetoes, threshold ${THRESH}).\n\n`;
  md += mdTable(sim, [
    ['rule', (r) => r.rule], ['queries', (r) => r.n], ['proposed', (r) => r.proposed], ['correct', (r) => r.correct],
    ['precision', (r) => pct(r.proposed ? r.correct / r.proposed : 1)], ['recall', (r) => pct(r.correct / r.n)],
  ]);
  fs.writeFileSync(path.join(OUT, 'eval.md'), md);
  console.log(`eval done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (process.env.LINK_SKIP_JOB) return;
  // ----- the real job -----
  runJob(items, scorer, THRESH);
  console.log(`all done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function simulateRetrieval(items, truth, scorer, thresh) {
  const testItems = items.filter((i) => splitOf(i.productId) === 'test');
  const index = buildIndex(testItems, scorer.parse);
  const rules = [
    { rule: 'best >= threshold', ok: () => true },
    { rule: 'best >= threshold and margin >= 0.05', ok: (c) => c.margin >= 0.05 },
    { rule: 'best >= threshold and margin >= 0.10', ok: (c) => c.margin >= 0.10 },
  ];
  const queries = truth.positives.filter((p) => splitOf(p.a.productId) === 'test');
  const res = rules.map((r) => ({ rule: r.rule, n: 0, proposed: 0, correct: 0 }));
  for (const q of queries) {
    for (const [from, to] of [[q.a, q.b], [q.b, q.a]]) {
      const found = bestPerChain(from, index, scorer, thresh, true).find((c) => c.chain === to.chain);
      rules.forEach((rule, i) => {
        res[i].n += 1;
        if (found && rule.ok(found)) {
          res[i].proposed += 1;
          if (found.b.productId === to.productId) res[i].correct += 1;
        }
      });
    }
  }
  return res;
}

function runJob(items, scorer, thresh) {
  const index = buildIndex(items, scorer.parse);
  const single = items.filter((i) => i.nChains === 1);
  const proposals = new Map(); // unordered pair key -> proposal
  for (const a of single) {
    for (const c of bestPerChain(a, index, scorer, thresh)) {
      const b = c.b;
      const k = a.productId < b.productId ? `${a.productId}#${b.productId}` : `${b.productId}#${a.productId}`;
      const prev = proposals.get(k);
      if (!prev || c.r.score > prev.score) {
        proposals.set(k, { a, b, score: c.r.score, margin: c.margin, nCand: c.nCand, reasons: c.r.reasons });
      }
    }
  }
  const list = [...proposals.values()];
  fs.writeFileSync(path.join(OUT, 'candidates.jsonl'), list.map((p) => JSON.stringify({
    a: { productId: p.a.productId, chain: p.a.chain, name: p.a.name, price: p.a.price },
    b: { productId: p.b.productId, chain: p.b.chain, name: p.b.name, price: p.b.price },
    score: Number(p.score.toFixed(4)), margin: Number(p.margin.toFixed(4)), reasons: p.reasons,
  })).join('\n') + '\n');

  // review sample
  const picks = samplePositives(list, 200);
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const pr = (it) => parseName(it.name).size.sizes.map((s) => `${s.count > 1 ? s.count + 'x' : ''}${s.unit}${s.dim}`).join('+');
  const csv = ['score,margin,chain_a,name_a,size_a,price_a,chain_b,name_b,size_b,price_b,verdict(right/wrong)']
    .concat(picks.map((p) => [p.score.toFixed(3), p.margin.toFixed(3), p.a.chain, q(p.a.name), q(pr(p.a)), p.a.price ?? '', p.b.chain, q(p.b.name), q(pr(p.b)), p.b.price ?? '', ''].join(',')));
  fs.writeFileSync(path.join(OUT, 'review-sample.csv'), '﻿' + csv.join('\n') + '\n');

  // impact on LIVE offers
  const liveOffers = items.filter((i) => i.active && !i.fromProductName);
  const gainedBy = new Map();
  const gainedLiveRival = new Map();
  const chainsOfProduct = new Map();
  for (const it of items) {
    if (!chainsOfProduct.has(it.productId)) chainsOfProduct.set(it.productId, new Set());
    chainsOfProduct.get(it.productId).add(it.chain);
  }
  const itemsOf = new Map();
  for (const it of items) { if (!itemsOf.has(it.productId)) itemsOf.set(it.productId, []); itemsOf.get(it.productId).push(it); }
  const rivalsOf = new Map(); // item id -> Set of rival chains via proposed links
  const link = (x, y) => {
    if (!rivalsOf.has(x.id)) rivalsOf.set(x.id, new Map());
    rivalsOf.get(x.id).set(y.chain, (rivalsOf.get(x.id).get(y.chain) || false) || y.active);
  };
  for (const p of list) {
    // both products: every item of A's product gains B's chain and vice versa
    for (const ai of itemsOf.get(p.a.productId) || []) link(ai, p.b);
    for (const bi of itemsOf.get(p.b.productId) || []) link(bi, p.a);
  }
  let gainAny = 0; let gainLive = 0;
  const byChain = new Map();
  for (const o of liveOffers) {
    const hadRival = (chainsOfProduct.get(o.productId)?.size ?? 0) > 1;
    const r = rivalsOf.get(o.id);
    const row = byChain.get(o.chain) || { live: 0, alreadyComparable: 0, gain: 0, gainLive: 0 };
    row.live += 1;
    if (hadRival) row.alreadyComparable += 1;
    if (!hadRival && r && r.size > 0) { row.gain += 1; gainAny += 1; if ([...r.values()].some(Boolean)) { row.gainLive += 1; gainLive += 1; } }
    byChain.set(o.chain, row);
  }
  let md = `# LINK-01 impact (offline, proposals above threshold ${thresh})\n\n`;
  md += `Proposed links: ${list.length}. Live offers (chain_names active=true): ${liveOffers.length}.\n\n`;
  md += `"Gain" = live offer whose product is today known at ONE chain and would be linked to a product at another chain. "Gain with live rival offer" additionally requires the rival chain item to be a live offer itself.\n\n`;
  md += mdTable([...byChain.entries()].sort((x, y) => y[1].live - x[1].live).map(([k, v]) => ({ k, ...v }))
    .concat([{ k: 'TOTAL', live: liveOffers.length, alreadyComparable: [...byChain.values()].reduce((s, v) => s + v.alreadyComparable, 0), gain: gainAny, gainLive }]), [
    ['chain', (r) => r.k], ['live offers', (r) => r.live], ['already on a multi-chain product', (r) => r.alreadyComparable],
    ['would gain a rival chain', (r) => r.gain], ['gain with live rival offer', (r) => r.gainLive],
    ['% of live', (r) => pct(r.gain / r.live)],
  ]);
  fs.writeFileSync(path.join(OUT, 'impact.md'), md);
  console.log(`proposals ${list.length}, live gain ${gainAny} (live rival ${gainLive})`);
}

main();
