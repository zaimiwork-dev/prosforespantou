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
//   PACE_MS    (default 13000) throttle between Groq calls — see MODEL note
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
// Measured prompt size for this resolver is ~2.4k chars ≈ 0.8–1.5k tokens plus
// 256 output, so the TOKEN limits bind long before the request limits:
//   TPM 8K   → ~4.5 requests/min → PACE_MS must be ≥ ~13s (hence the default)
//   TPD 200K → ~112 items/day    → the 2.7k backlog drains over ~3-4 weeks
// The run therefore stops cleanly when the daily budget is spent and resumes
// on the next nightly pass. Reducing tokens per request (short candidate ids,
// trimmed scaffold) is the lever that shortens the drain — a follow-up.
const PACE_MS = parseInt(process.env.PACE_MS || '13000', 10);
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
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ').replace(/[^a-zα-ω0-9]/gi, '');
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);
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
        max_tokens: 256,
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
  const text = data.choices?.[0]?.message?.content;
  if (!text) return { error: 'Empty Groq response' };
  try { return { result: JSON.parse(text) }; } catch { return { error: `unparseable: ${text.slice(0, 200)}` }; }
}

function buildPrompt(rawName, rawPrice, rawBrand, candidates) {
  const list = candidates.map((p) => `${p.id} | ${p.name}`).join('\n');
  const brandLine = rawBrand ? `Brand: "${rawBrand}" (chain-supplied; may be missing from Name)\n` : '';
  return `
You are an expert data matching AI for a Greek supermarket aggregator.
Match a RAW extracted deal name against a short list of CANDIDATE PRODUCTS, and assign a CATEGORY.

CANDIDATE PRODUCTS (Format: ID | Name):
${list}

RAW DEAL TO MATCH:
${brandLine}Name: "${rawName}"
Price: ${rawPrice}

ALLOWED CATEGORIES (Pick exactly one):
"Φρούτα & Λαχανικά", "Κρέας & Ψάρι", "Γαλακτοκομικά & Είδη Ψυγείου", "Τυριά & Αλλαντικά", "Σαλάτες & Αλοιφές", "Κονσέρβες", "Αρτοποιία", "Κατεψυγμένα", "Είδη Παντοπωλείου", "Πρωινό & Ροφήματα", "Σνακ & Γλυκά", "Κάβα", "Προσωπική Φροντίδα", "Βρεφικά Είδη", "Είδη Καθαρισμού & Σπιτιού", "Είδη Κατοικιδίων", "Άλλο"

INSTRUCTIONS:
1. **BRAND MUST MATCH EXACTLY.** First word(s) of name = brand. If RAW DEAL brand differs from EVERY candidate's brand → "suggestedProductId": "NEW", confidence 100.
2. **QUANTITY MUST MATCH EXACTLY.** Compare weight (γρ/g/kg), volume (ml/lt), pack size (τεμ/x). 750ml vs 1lt → NEW. 6x53γρ vs 10x53γρ → NEW.
3. Only if BOTH brand and quantity match → return the candidate's UUID with confidence reflecting how exact the variant match is.
4. Confidence 0-100. Use 0 when no candidate has the right brand at all.
5. Category hints: Eggs → Είδη Παντοπωλείου; Cheeses/Deli → Τυριά & Αλλαντικά; Dips/Spreads → Σαλάτες & Αλοιφές; Canned → Κονσέρβες.
6. Return JSON ONLY with keys: rawName, suggestedProductId, confidence, category. No prose.

OUTPUT shape:
{ "rawName": "${rawName}", "suggestedProductId": "uuid-or-NEW", "confidence": 95, "category": "..." }
`;
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
        const { result, error, status, retryAfterMs } = await callGroq(apiKey, prompt);
        if (result) { llm = result; break; }
        // Honour Groq's own retry-after when it sends one (per-minute token
        // window); otherwise back off progressively.
        const wait = retryAfterMs || (status === 429 ? 30000 : 2000 * attempt);
        console.log(`🔁 Groq ${status || 'err'} (${attempt}/3) ${String(error).slice(0, 120)} — wait ${wait}ms`);
        await sleep(wait);
      }
      if (!llm) { console.log('⛔ giving up'); errors++; await sleep(PACE_MS); continue; }

      // Validate the LLM response
      let chosenProductId = null;
      let rejectReason = null;
      if (llm.confidence >= 90 && isUuid(llm.suggestedProductId)) {
        const cand = top.find((c) => c.id === llm.suggestedProductId);
        if (!cand) { rejectReason = 'hallucinated UUID'; hallucinations++; }
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
            chosenProductId = llm.suggestedProductId;
          }
        }
      } else if (llm.suggestedProductId === 'NEW' || llm.confidence < 90) {
        rejectReason = `low confidence (${llm.confidence}%, suggestion=${llm.suggestedProductId})`;
        lowConf++;
      } else {
        rejectReason = `malformed UUID "${llm.suggestedProductId}"`;
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
                suggestedProductId: isUuid(llm.suggestedProductId) ? llm.suggestedProductId : null,
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
    console.error(`   If this is 404/model_not_found, the model was retired: check`);
    console.error(`   https://console.groq.com/docs/deprecations and update GROQ_MODEL`);
    console.error(`   (free tier only — see the MODEL note at the top of this file).`);
    process.exit(1);
  }
  console.error(`\n❌ ${e.stack || e.message}`);
  process.exit(1);
});
