// LLM resolver for PendingMatch rows — chain-agnostic.
//
// Reads PendingMatch rows for one chain, asks Groq to match each one against
// the canonical catalog, and on a confident hit writes Discount + PriceSnapshot
// + MatchCache and deletes the PendingMatch row. On an uncertain hit, updates
// the row's suggestedProductId + aiConfidence so the admin Review tab can show
// the LLM's best guess.
//
// This is the standalone version of what groq-matcher.mjs used to do in-line
// during Masoutis ingestion. The new chain-direct adapter architecture
// (lib/ingest-offers.mjs) writes every uncertain match into PendingMatch and
// never invents a Product — this resolver is the second pass that turns those
// rows into real Discounts.
//
// Usage:
//   CHAIN=masoutis SOURCE=web node src/scripts/resolve-pending-matches.mjs
//   CHAIN=ab SOURCE=web LIMIT=50 node src/scripts/resolve-pending-matches.mjs
//   DRY_RUN=1 ... (no DB writes — just report)
//
// Env:
//   CHAIN      (required) chain slug — masoutis/ab/kritikos/...
//   SOURCE     (default 'web') 'web' | 'leaflet' — source tag for resolved Discounts
//   LIMIT      (default ∞) cap items to process (smoke test)
//   PACE_MS    (default 8000) throttle between Groq calls — see MODEL note
//   GROQ_MODEL (default 'openai/gpt-oss-120b')
//   DRY_RUN=1  → no DB writes
//
// dotenv first (ESM hoist trap — DB import comes later).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { computeHotScore } from '../lib/hotness.ts';
import { categorize } from '../lib/categories.ts';
import { samePack } from '../lib/packaging.ts';
import { foldHomoglyphs } from '../lib/offer-similarity.ts';

const CHAIN = process.env.CHAIN;
const SOURCE = process.env.SOURCE || 'web';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
// MODEL — 2026-09-02. The previous default, meta-llama/llama-4-scout-17b-16e-
// instruct, was DEPRECATED by Groq and shut down on 2026-07-17. Every nightly
// resolver run from that date to 2026-09-02 called it, got `404
// model_not_found` on all ~482 items, and still exited 0 — which is why the
// backlog silently grew to 2,732 while CI stayed green. See GroqFatalError
// below: a permanent Groq error must now abort the whole run, non-zero. The
// resolvers workflow additionally gates on step outcomes, because every step
// there is continue-on-error and would otherwise still report success.
//
// Replacement chosen: openai/gpt-oss-120b — one of Groq's two documented
// successors for the retired scout model, and present in the FREE-TIER rate
// limit table. NOTE: llama-3.3-70b-versatile is a Groq production model but is
// NOT on the free tier, so it would fail the same way; do not "upgrade" to it
// without a paid plan.
//
// Free-tier budget for openai/gpt-oss-120b: 30 RPM, 1K RPD, 8K TPM, 200K TPD.
// The TOKEN limits bind long before the request limits, so tokens per call —
// not calls — decide how fast the backlog drains. Measured at 1,241 tokens/call
// on 2026-09-02 (CI 33623570913): ~161 items/day, PACE_MS ≥ ~9.3s.
//
// 2026-09-03: the prompt was cut down (numbered candidates instead of UUIDs, a
// tighter scaffold — see buildPrompt). Re-measured in CI 33685203658:
// 815 tokens/call, so ~245 items/day and a TPM-safe floor of 6.1s. PACE_MS
// dropped 13s → 8s accordingly (33% headroom over that floor, for prompts
// larger than the sample). Since TPD is the binding limit, a faster pace does
// not process more per day — it finishes the day's allowance sooner, which is
// what keeps the combined nightly job inside its 350-minute budget.
//
// When the daily allowance is spent the run stops cleanly and the next nightly
// pass resumes. It prints its own measured tokens/call and items/day at the
// end — trust those numbers over this comment.
const PACE_MS = parseInt(process.env.PACE_MS || '8000', 10);
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!CHAIN) {
  console.error('Usage: CHAIN=<chain-slug> [SOURCE=web|leaflet] [LIMIT=N] [DRY_RUN=1] node src/scripts/resolve-pending-matches.mjs');
  process.exit(1);
}
if (!['web', 'leaflet'].includes(SOURCE)) {
  console.error(`Invalid SOURCE='${SOURCE}'. Must be 'web' or 'leaflet'.`);
  process.exit(1);
}

// Chain slug → Store.name. MUST match lib/ingest-offers.mjs.
const SM_MAPPING = {
  ab: 'AB Vassilopoulos',
  lidl: 'Lidl',
  sklavenitis: 'Σκλαβενίτης',
  mymarket: 'My Market',
  masoutis: 'Μασούτης',
  bazaar: 'Bazaar',
  kritikos: 'Κρητικός',
  marketin: 'Market In',
  galaxias: 'Γαλαξίας',
  efresh: 'e-fresh',
};
if (!SM_MAPPING[CHAIN]) {
  console.error(`Unknown chain slug "${CHAIN}". Known: ${Object.keys(SM_MAPPING).join(', ')}`);
  process.exit(1);
}

// ── Token + brand helpers (verbatim from groq-matcher.mjs) ───────────────────
function tokensFor(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter((w) => w.length >= 3);
}
function calculateOverlap(a, b) {
  const set = new Set(tokensFor(b));
  return tokensFor(a).filter((w) => set.has(w)).length;
}

const LATIN_TO_GREEK = {
  th: 'θ', ch: 'χ', ps: 'ψ', ou: 'ου', mp: 'μπ', nt: 'ντ', gk: 'γκ',
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', z: 'ζ', h: 'η', i: 'ι',
  k: 'κ', l: 'λ', m: 'μ', n: 'ν', x: 'ξ', o: 'ο', p: 'π', r: 'ρ',
  s: 'σ', t: 'τ', u: 'υ', y: 'υ', f: 'φ', v: 'β', w: 'ω', q: 'κ',
  c: 'κ', j: 'τζ',
};

function normalizeBrandToken(s) {
  if (!s) return '';
  const flat = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ').replace(/[^a-zα-ω0-9]/gi, '');
  // Repair mixed-script typos: chain feeds write «ΝΩMA» with a Latin M, which
  // made this guard reject a correct match as a brand mismatch against «ΝΩΜΑ»
  // (CI run 33623570913). Only mixed-script words are touched — see
  // foldHomoglyphs; a real Latin brand like "Nescafe" is left alone.
  return foldHomoglyphs(flat);
}
function transliterateLatinToGreek(s) {
  if (!s) return '';
  let out = '';
  let i = 0;
  while (i < s.length) {
    const two = s[i] + (s[i + 1] ?? '');
    if (LATIN_TO_GREEK[two]) { out += LATIN_TO_GREEK[two]; i += 2; }
    else if (LATIN_TO_GREEK[s[i]]) { out += LATIN_TO_GREEK[s[i]]; i++; }
    else { out += s[i]; i++; }
  }
  return out;
}
function brandsMatch(rawFull, candFull) {
  const a = normalizeBrandToken((rawFull || '').trim().split(/\s+/)[0]);
  const b = normalizeBrandToken((candFull || '').trim().split(/\s+/)[0]);
  if (!a || !b) return true;
  if (a === b) return true;
  const aLatin = /^[a-z0-9]+$/.test(a);
  const bLatin = /^[a-z0-9]+$/.test(b);
  if (aLatin && !bLatin) return transliterateLatinToGreek(a) === b;
  if (!aLatin && bLatin) return a === transliterateLatinToGreek(b);
  return false;
}

// Brand-aware variant: when the adapter persisted a real brand (AB's
// manufacturerName, Lidl's brand field, etc.), use THAT for the guard instead
// of the first token of rawName. AB's "Σαλάτα Δροσερή" with brand "Σινάκου"
// should match a candidate named "Σινάκου Σαλάτα Δροσερή" — first-token
// matching would reject "Σαλάτα" vs "Σινάκου".
function brandsMatchWithBrand(rawBrand, candFull) {
  if (!rawBrand) return null; // caller falls back to brandsMatch(rawFull, candFull)
  const a = normalizeBrandToken(rawBrand);
  const candFirst = normalizeBrandToken((candFull || '').trim().split(/\s+/)[0]);
  if (!a || !candFirst) return true;
  if (a === candFirst) return true;
  // Also allow if our brand token appears anywhere in the candidate name (some
  // candidates have multi-word brands like "Δωδώνη Α.Ε.").
  const candFlat = normalizeBrandToken(candFull || '');
  if (candFlat.includes(a)) return true;
  const aLatin = /^[a-z0-9]+$/.test(a);
  const bLatin = /^[a-z0-9]+$/.test(candFirst);
  if (aLatin && !bLatin) return transliterateLatinToGreek(a) === candFirst;
  if (!aLatin && bLatin) return a === transliterateLatinToGreek(candFirst);
  return false;
}

// (The UUID validator that lived here is gone: the model now answers with a
// candidate number, so a bad answer is out-of-range rather than a fake id.)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Groq call ────────────────────────────────────────────────────────────────

// A permanent, run-level Groq failure: wrong/retired model, bad key, no access.
// Retrying the next item cannot help, so this aborts the whole run and exits
// non-zero. Before 2026-09-02 these were swallowed per-item and the job still
// reported success — the failure mode that hid a 7-week outage.
class GroqFatalError extends Error {}
// The free-tier daily token/request allowance is spent. Expected, not a defect:
// stop cleanly, report how many rows remain, exit 0 so the nightly job stays
// green and simply continues tomorrow.
class GroqBudgetExhausted extends Error {}

const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 413]);
// Groq spells the window in the 429 body, e.g. "... on tokens per day (TPD) ...".
const isDailyLimit = (body) => /per\s*day|\bTPD\b|\bRPD\b/i.test(body || '');

async function callGroq(apiKey, prompt) {
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
        // gpt-oss is a REASONING model: it spends output tokens thinking
        // before it emits the JSON. The old `max_tokens: 256` (fine for the
        // retired scout model) truncated it mid-thought, and Groq rejected the
        // request with 400 json_validate_failed / "max completion tokens
        // reached before generating a valid document" — verified in CI run
        // 33623301115. So: ask for minimal reasoning, don't ship it back, and
        // give the answer real headroom. max_tokens is deprecated in favour of
        // max_completion_tokens.
        reasoning_effort: 'low',
        include_reasoning: false,
        max_completion_tokens: 1024,
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    return { error: `network: ${err.message || err.name || 'unknown'}`, status: null };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (PERMANENT_STATUSES.has(res.status)) {
      throw new GroqFatalError(`${res.status} ${body.slice(0, 300)}`);
    }
    if (res.status === 429 && isDailyLimit(body)) {
      throw new GroqBudgetExhausted(body.slice(0, 200));
    }
    // Groq sends `retry-after` in seconds on a per-minute 429.
    const retryAfterMs = Math.round(parseFloat(res.headers.get('retry-after') || '0') * 1000);
    return { error: `${res.status}: ${body.slice(0, 200)}`, status: res.status, retryAfterMs };
  }
  let data;
  try { data = await res.json(); } catch (err) { return { error: `json-parse: ${err.message}`, status: null }; }
  // Real token usage, so the free-tier budget maths below is measured rather
  // than estimated (reasoning tokens count against TPD too).
  const usage = data.usage ? { total: data.usage.total_tokens ?? 0 } : null;
  const text = data.choices?.[0]?.message?.content;
  if (!text) return { error: 'Empty Groq response', usage };
  try { return { result: JSON.parse(text), usage }; } catch { return { error: `unparseable: ${text.slice(0, 200)}`, usage }; }
}

// Candidates are numbered 1..N rather than listed by UUID (2026-09-03).
//
// A UUID is 36 characters of high-entropy hex that no tokenizer compresses —
// roughly 12-18 tokens each, so ten of them cost ~150 tokens per call and buy
// nothing: the model only has to point at a row we already hold in memory.
// Groq's free tier caps us on TOKENS per day, not requests, so this is the
// lever that shortens the backlog drain.
//
// It also deletes a whole failure class. With UUIDs the model could invent a
// plausible-looking id, which we had to detect after the fact ("hallucinated
// UUID"). An index is either within 1..N or it isn't.
function buildPrompt(rawName, rawPrice, rawBrand, candidates) {
  const list = candidates.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
  const brandLine = rawBrand ? `Brand: "${rawBrand}" (chain-supplied; may be missing from Name)\n` : '';
  return `You match Greek supermarket product names.

CANDIDATES:
${list}

DEAL:
${brandLine}Name: "${rawName}"
Price: ${rawPrice}

CATEGORIES (pick exactly one):
"Φρούτα & Λαχανικά", "Κρέας & Ψάρι", "Γαλακτοκομικά & Είδη Ψυγείου", "Τυριά & Αλλαντικά", "Σαλάτες & Αλοιφές", "Κονσέρβες", "Αρτοποιία", "Κατεψυγμένα", "Είδη Παντοπωλείου", "Πρωινό & Ροφήματα", "Σνακ & Γλυκά", "Κάβα", "Προσωπική Φροντίδα", "Βρεφικά Είδη", "Είδη Καθαρισμού & Σπιτιού", "Είδη Κατοικιδίων", "Άλλο"

RULES:
1. BRAND must match exactly (brand = first word(s)). If no candidate shares the deal's brand → match 0.
2. QUANTITY must match exactly — weight (γρ/g/kg), volume (ml/lt), pack (τεμ/x). 750ml vs 1lt → 0. 6x53γρ vs 10x53γρ → 0.
3. Only when BOTH match, return that candidate's NUMBER; otherwise 0.
4. confidence 0-100, reflecting how exact the variant match is.
5. Return JSON only: {"match": <number 1-${candidates.length} or 0>, "confidence": <0-100>, "category": "<one above>"}`;
}

// ── DB retry (same shape as ingest-offers.mjs) ───────────────────────────────
const RETRY_DELAYS = [5000, 10000, 20000, 30000, 60000];
async function withDbRetry(label, fn) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (e) {
      const transient = /EAUTHTIMEOUT|ECONNREFUSED|ETIMEDOUT|Connection terminated|connection|socket|08006/i.test(e.message || '');
      if (!transient || attempt >= RETRY_DELAYS.length) throw e;
      const wait = RETRY_DELAYS[attempt];
      console.log(`   ⏳ ${label} hiccup — retry ${attempt + 1} in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

async function run() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { console.error('❌ GROQ_API_KEY not set in env'); process.exit(1); }

  const { default: prisma } = await import('../lib/prisma.ts');

  const pending = await withDbRetry('load pending', () =>
    prisma.pendingMatch.findMany({
      where: { supermarket: CHAIN },
      orderBy: { createdAt: 'asc' },
      take: Number.isFinite(LIMIT) ? LIMIT : undefined,
    })
  );
  console.log(`🤖 LLM resolver: chain="${CHAIN}" source="${SOURCE}" ${DRY_RUN ? '(DRY_RUN)' : ''}`);
  console.log(`   pending rows to process: ${pending.length}`);
  if (pending.length === 0) { await prisma.$disconnect(); return; }

  // Use ALL canonical Products as the candidate pool. Cross-chain products
  // share one row via barcode, so a "Coca-Cola 1.5L" pending from AB should
  // still find the canonical Product even if it was first tagged with another
  // chain's slug.
  const candidates = await withDbRetry('load products', () =>
    prisma.product.findMany({ select: { id: true, name: true } })
  );
  console.log(`   candidate pool: ${candidates.length} canonical Products`);

  const storeName = SM_MAPPING[CHAIN];
  const store = await withDbRetry('ensureStore', () =>
    prisma.store.upsert({ where: { name: storeName }, create: { name: storeName }, update: {} })
  );

  let resolved = 0, stillPending = 0, errors = 0, brandRejects = 0, hallucinations = 0, lowConf = 0, packRejects = 0;
  // Set when the free-tier daily allowance runs out mid-run (see MODEL note).
  let stoppedEarly = null;
  // Measured Groq token consumption — turns the free-tier drain estimate into
  // a real number (reasoning tokens count against TPD as well).
  let tokensUsed = 0, tokenedCalls = 0;

  for (let i = 0; i < pending.length; i++) {
    const pm = pending[i];
    process.stdout.write(`[${i + 1}/${pending.length}] "${pm.rawName.slice(0, 60)}"... `);

    try {
      // When the adapter supplied a real brand (e.g. AB's manufacturerName),
      // include it in the token-overlap score so brand-stripped names like
      // "Σαλάτα Δροσερή" still surface "Σινάκου Σαλάτα Δροσερή" candidates.
      const effectiveName = pm.brand ? `${pm.brand} ${pm.rawName}` : pm.rawName;
      const top = candidates
        .map((c) => ({ ...c, score: calculateOverlap(effectiveName, c.name) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      const prompt = buildPrompt(pm.rawName, pm.rawPrice, pm.brand, top);

      // Permanent failures and daily-budget exhaustion now THROW out of
      // callGroq and are handled at run level — never per-item, or a dead
      // model looks like 482 individually-unlucky items (see MODEL note).
      let llm = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { result, error, status, retryAfterMs, usage } = await callGroq(apiKey, prompt);
        if (usage) { tokensUsed += usage.total; tokenedCalls += 1; }
        if (result) { llm = result; break; }
        // Honour Groq's own retry-after when it sends one (per-minute token
        // window); otherwise back off progressively.
        const wait = retryAfterMs || (status === 429 ? 30000 : 2000 * attempt);
        console.log(`🔁 Groq ${status || 'err'} (${attempt}/3) ${String(error).slice(0, 120)} — wait ${wait}ms`);
        await sleep(wait);
      }
      if (!llm) { console.log('⛔ giving up'); errors++; await sleep(PACE_MS); continue; }

      // Validate the LLM response. `match` is a 1-based index into `top` (0 =
      // "none of these"); anything outside that range is a malformed answer,
      // not a product — see buildPrompt for why this replaced UUIDs.
      let chosenProductId = null;
      let rejectReason = null;
      const matchIdx = Number(llm.match);
      const inRange = Number.isInteger(matchIdx) && matchIdx >= 1 && matchIdx <= top.length;
      if (llm.confidence >= 90 && inRange) {
        const cand = top[matchIdx - 1];
        if (!cand) { rejectReason = 'index out of range'; hallucinations++; }
        else {
          // Use brand-aware guard when the adapter persisted a brand;
          // otherwise fall back to first-token matching.
          const ok = pm.brand
            ? brandsMatchWithBrand(pm.brand, cand.name)
            : brandsMatch(pm.rawName, cand.name);
          if (!ok) {
            const expected = pm.brand || pm.rawName.split(/\s+/)[0];
            const got = cand.name.split(/\s+/)[0];
            rejectReason = `brand mismatch ('${expected}' vs '${got}')`;
            brandRejects++;
          } else if (!samePack(pm.rawName, cand.name)) {
            // Pack-size guard: never match a multipack/multibuy to a single
            // unit (or vice versa) — it makes a 12-pack price read as a single.
            rejectReason = `pack mismatch ('${pm.rawName}' vs '${cand.name}')`;
            packRejects++;
          } else {
            chosenProductId = cand.id;
          }
        }
      } else if (matchIdx === 0 || llm.confidence < 90) {
        // 0 = the model found no candidate with the right brand and size.
        rejectReason = `no confident match (conf=${llm.confidence}%, match=${llm.match})`;
        lowConf++;
      } else {
        rejectReason = `malformed match "${llm.match}" (expected 0-${top.length})`;
        hallucinations++;
      }

      if (!chosenProductId) {
        // Update the PendingMatch with the LLM's best guess so the admin
        // Review tab can show it. Don't delete — admin will decide.
        if (!DRY_RUN) {
          await withDbRetry('update pending', () =>
            prisma.pendingMatch.update({
              where: { id: pm.id },
              data: {
                aiConfidence: llm.confidence || 0,
                // The model answers with a candidate NUMBER, so resolve it back
                // to the real id here — the Review tab still gets the LLM's
                // best guess even when a guard rejected it.
                suggestedProductId: inRange ? top[matchIdx - 1].id : null,
              },
            })
          );
        }
        console.log(`⚠️ STILL PENDING — ${rejectReason}`);
        stillPending++;
        await sleep(PACE_MS);
        continue;
      }

      // Confident hit — write Discount + MatchCache + PriceSnapshot, drop PendingMatch.
      if (DRY_RUN) {
        const candName = top.find((c) => c.id === chosenProductId)?.name;
        console.log(`✅ would resolve → "${candName}" (conf=${llm.confidence})`);
        resolved++;
        await sleep(PACE_MS);
        continue;
      }

      const now = new Date();
      const validUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const originalPrice = null; // PendingMatch doesn't carry originalPrice; resolver assumes single-price (ΜΟΝΟ-style).

      await withDbRetry('write resolved', async () => {
        // Display-first: the ingest pipeline already wrote this offer as a
        // visible productless Discount with the chain's REAL dates/image/
        // original price. Claiming = just setting productId — overwriting the
        // rest with resolver-synthesized data (now+14d, no original) would
        // degrade the row.
        const claimed = await prisma.discount.updateMany({
          where: { supermarket: CHAIN, source: SOURCE, productName: pm.rawName, productId: null },
          data: { productId: chosenProductId },
        });
        if (claimed.count === 0) {
          // Legacy path — no productless row exists (pre-display-first
          // backlog, or a showUnmatched-off chain like Lidl).
          const existing = await prisma.discount.findFirst({
            where: { productId: chosenProductId, supermarket: CHAIN, source: SOURCE },
          });
          const discountData = {
            productName: pm.rawName,
            // The LLM's category is a department-level guess → keep it as the
            // subcategory hint and let the shared categorizer have final say
            // (uniform with every other write path).
            category: categorize(pm.rawName, llm.category),
            subcategory: llm.category || null,
            discountedPrice: pm.rawPrice,
            originalPrice,
            validFrom: now,
            validUntil,
            imageUrl: pm.imageUrl || null,
            storeId: store.id,
            productId: chosenProductId,
            supermarket: CHAIN,
            source: SOURCE,
            isActive: true,
          };
          // originalPrice is null here (ΜΟΝΟ-style), so % contributes 0 — score
          // rides on KVI/brand/mechanic + clicks; daily cron is authoritative.
          const hotScore = computeHotScore({
            productName: pm.rawName,
            description: null,
            discountPercent: null,
            createdAt: existing ? existing.createdAt : now,
            clicks: existing ? existing.clickCount : 0,
          });
          if (existing) {
            await prisma.discount.update({ where: { id: existing.id }, data: { ...discountData, hotScore } });
          } else {
            await prisma.discount.create({ data: { ...discountData, hotScore } });
          }
        }

        // MatchCache — next adapter run for the same rawName hits this and skips the LLM.
        await prisma.matchCache.upsert({
          where: { rawName_supermarket: { rawName: pm.rawName, supermarket: CHAIN } },
          create: {
            rawName: pm.rawName,
            supermarket: CHAIN,
            productId: chosenProductId,
            brandToken: normalizeBrandToken(pm.brand || pm.rawName.split(/\s+/)[0]) || null,
            source: 'llm',
          },
          update: { productId: chosenProductId, lastUsedAt: new Date(), source: 'llm' },
        });

        // PriceSnapshot — only when price actually changed.
        const last = await prisma.priceSnapshot.findFirst({
          where: { productId: chosenProductId, supermarket: CHAIN },
          orderBy: { recordedAt: 'desc' },
        });
        if (!last || last.price !== pm.rawPrice) {
          await prisma.priceSnapshot.create({
            data: {
              productId: chosenProductId,
              supermarket: CHAIN,
              price: pm.rawPrice,
              isDiscounted: !!originalPrice,
            },
          });
        }

        // Drop the resolved PendingMatch.
        await prisma.pendingMatch.delete({ where: { id: pm.id } });
      });

      console.log(`✅ RESOLVED (conf=${llm.confidence}) → ${llm.category}`);
      resolved++;
    } catch (e) {
      // Run-level conditions must not be counted as one item's bad luck.
      // Fatal → propagate, run exits non-zero, CI turns red, owner is emailed.
      if (e instanceof GroqFatalError) throw e;
      // Budget → expected on the free tier; stop cleanly and resume tomorrow.
      if (e instanceof GroqBudgetExhausted) { stoppedEarly = e.message; break; }
      console.log(`❌ ${e.message?.slice(0, 200)}`);
      errors++;
    }
    await sleep(PACE_MS);
  }

  console.log(`\n🏁 Resolver finished for chain="${CHAIN}" source="${SOURCE}"${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  console.log(`   ✅ resolved:       ${resolved}`);
  console.log(`   ⚠️  still pending:  ${stillPending} (low-conf=${lowConf} brand-rej=${brandRejects} pack-rej=${packRejects} hallucination=${hallucinations})`);
  console.log(`   ❌ errors:         ${errors}`);
  if (tokenedCalls > 0) {
    const avg = Math.round(tokensUsed / tokenedCalls);
    // Free tier: 8K tokens/min, 200K tokens/day (openai/gpt-oss-120b).
    console.log(`   🔢 groq tokens:    ${tokensUsed} over ${tokenedCalls} call(s), avg ${avg}/call`);
    console.log(`      → free-tier ceiling at this size: ~${Math.floor(200000 / avg)} items/day, ` +
                `TPM-safe pace ≥ ${Math.ceil(60000 / (8000 / avg))}ms (PACE_MS is ${PACE_MS})`);
  }
  if (stoppedEarly) {
    const touched = resolved + stillPending + errors;
    console.log(`   ⏸️  STOPPED EARLY — Groq free-tier daily budget spent after ${touched} item(s).`);
    console.log(`      ${pending.length - touched} row(s) of this chain's queue remain; the next nightly run continues.`);
    console.log(`      Groq said: ${stoppedEarly}`);
  }

  await prisma.$disconnect();
}

run().catch((e) => {
  if (e instanceof GroqFatalError) {
    // Loud and specific: this is the class of failure that ran silently from
    // 2026-07-17 to 2026-09-02 (retired model → 404 on every item).
    console.error(`\n❌ GROQ PERMANENT FAILURE — aborting the whole run.`);
    console.error(`   ${e.message}`);
    console.error(`   Model in use: ${MODEL}`);
    if (/model_not_found|does not exist/i.test(e.message)) {
      console.error(`   → The model was RETIRED. Check`);
      console.error(`     https://console.groq.com/docs/deprecations, pick a successor that is`);
      console.error(`     on the FREE TIER, and update the MODEL default in this file.`);
    } else if (/json_validate_failed|max completion tokens/i.test(e.message)) {
      console.error(`   → The model ran out of output budget before emitting valid JSON.`);
      console.error(`     Reasoning models spend output tokens thinking: raise`);
      console.error(`     max_completion_tokens and/or lower reasoning_effort in callGroq.`);
    } else if (/invalid_api_key|401|403/i.test(e.message)) {
      console.error(`   → Auth problem: check the GROQ_API_KEY secret.`);
    }
    process.exit(1);
  }
  console.error(`\n❌ ${e.stack || e.message}`);
  process.exit(1);
});
