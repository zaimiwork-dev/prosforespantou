import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

// Cloud-fast counterpart to ollama-matcher.mjs. Same architecture (source
// isolation, candidate pre-filter, UUID validation, upsert, end-of-run
// deactivation, LIMIT mode, PriceSnapshot) — only the LLM call differs.
//
// Groq Llama-4 Scout (same model as the Lidl leaflet cron). Free tier ≈ 30 RPM
// for chat completions. 2s pacing keeps us safely under that. ~6 minutes for
// 200 items, ~90 minutes for 2000.

const SOURCE = process.env.SOURCE || 'web';
const INPUT_FILE = process.env.INPUT_FILE || './pending_masoutis_deals.json';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const PACE_MS = parseInt(process.env.PACE_MS || '2000', 10);
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

if (!['web', 'leaflet', 'manual'].includes(SOURCE)) {
  console.error(`❌ Invalid SOURCE='${SOURCE}'. Must be one of: web, leaflet, manual`);
  process.exit(1);
}

function tokensFor(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter((w) => w.length >= 3);
}

function calculateOverlap(str1, str2) {
  const set2 = new Set(tokensFor(str2));
  return tokensFor(str1).filter((w) => set2.has(w)).length;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// First-token brand check. Llama-4 occasionally returns a wrong-brand UUID
// even when the prompt forbids it (e.g. "Arla Protein" → "Μεβγάλ High
// Protein"). Deterministic safety net — but tolerant of Latin/Greek
// transliteration so "Fix" matches "Φιξ", "Pampers" matches "Πάμπερς", etc.
const LATIN_TO_GREEK = {
  th: 'θ', ch: 'χ', ps: 'ψ', ou: 'ου', mp: 'μπ', nt: 'ντ', gk: 'γκ',
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε',
  z: 'ζ', h: 'η', i: 'ι', k: 'κ', l: 'λ',
  m: 'μ', n: 'ν', x: 'ξ', o: 'ο', p: 'π',
  r: 'ρ', s: 'σ', t: 'τ', u: 'υ', y: 'υ',
  f: 'φ', v: 'β', w: 'ω', q: 'κ', c: 'κ', j: 'τζ',
};

function normalizeBrandToken(s) {
  if (!s) return '';
  return s.toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
    .replace(/[^a-zα-ω0-9]/gi, '');
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

function brandsMatch(rawFullName, candidateFullName) {
  const a = normalizeBrandToken((rawFullName || '').trim().split(/\s+/)[0]);
  const b = normalizeBrandToken((candidateFullName || '').trim().split(/\s+/)[0]);
  if (!a || !b) return true; // unknown — don't block; defer to LLM judgment
  if (a === b) return true;
  const aIsLatin = /^[a-z0-9]+$/.test(a);
  const bIsLatin = /^[a-z0-9]+$/.test(b);
  if (aIsLatin && !bIsLatin) return transliterateLatinToGreek(a) === b;
  if (!aIsLatin && bIsLatin) return a === transliterateLatinToGreek(b);
  return false;
}

async function callGroq(apiKey, prompt) {
  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 256,
      }),
      // Default Node fetch timeout is 10s — too short on flaky links.
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    // Network-level failures (timeout, ECONNRESET, DNS) — return as transient
    // so the caller's retry loop catches them. Without this, an unhandled
    // promise rejection would kill the whole run.
    return { error: `network: ${err.message || err.name || 'unknown'}`, status: null };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { error: `${res.status}: ${body.slice(0, 200)}`, status: res.status };
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    return { error: `json-parse: ${err.message || 'unknown'}`, status: null };
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) return { error: 'Empty Groq response' };
  try {
    return { result: JSON.parse(text) };
  } catch {
    return { error: `Could not parse JSON: ${text.slice(0, 200)}` };
  }
}

async function runMatcher() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Matcher Error: File not found at ${INPUT_FILE}. Run the Extractor first.`);
    process.exit(1);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('❌ GROQ_API_KEY not set in .env.local. Get one at https://console.groq.com/keys');
    process.exit(1);
  }

  const rawDeals = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`🤖 Groq Matcher (model='${MODEL}', source='${SOURCE}', pace=${PACE_MS}ms): Loaded ${rawDeals.length} raw deals from ${INPUT_FILE}.`);

  const { default: prisma } = await import('../../lib/prisma.ts');

  // Supabase pooler can be cold (auto-paused free tier) or hold stale
  // connections from prior killed runs. Real recovery time observed: ~45s.
  // Allow up to ~125s of patience before giving up.
  async function withDbRetry(label, fn) {
    const delays = [5000, 10000, 20000, 30000, 60000];
    for (let attempt = 1; attempt <= delays.length + 1; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const transient = /EAUTHTIMEOUT|connection|terminated|ECONN|timeout|socket|08006|reach database/i.test(err.message || '');
        if (transient && attempt <= delays.length) {
          const wait = delays[attempt - 1];
          console.log(`🔁 ${label} failed (${attempt}/${delays.length + 1}): ${err.message.slice(0, 80)}. Retrying in ${wait/1000}s...`);
          await sleep(wait);
          continue;
        }
        throw err;
      }
    }
  }

  const store = await withDbRetry('store.findUnique', () =>
    prisma.store.findUnique({ where: { name: 'Μασούτης' } })
  );
  if (!store) {
    console.error('❌ Store "Μασούτης" not found in DB.');
    process.exit(1);
  }

  const masterProducts = await withDbRetry('product.findMany', () =>
    prisma.product.findMany({ where: { supermarket: 'masoutis' }, select: { id: true, name: true } })
  );
  console.log(`📚 Master Catalog: Loaded ${masterProducts.length} known products for Masoutis.`);

  const runStartedAt = new Date();
  let matchedCount = 0;
  let pendingCount = 0;
  let updatedCount = 0;
  const total = LIMIT && LIMIT > 0 ? Math.min(LIMIT, rawDeals.length) : rawDeals.length;

  console.log(`\n⚙️ Processing ${total} deals one-by-one via Groq...${LIMIT ? ' (LIMIT mode — deactivation will be SKIPPED)' : ''}`);

  let cacheHits = 0;
  let autoAcceptHits = 0;

  for (let i = 0; i < total; i++) {
    try {
    const rawDeal = rawDeals[i];
    process.stdout.write(`[${i + 1}/${total}] "${rawDeal.rawName.slice(0, 60)}"... `);

    // === CACHE LOOKUP ===
    // Persistent (rawName, supermarket) → productId mapping. If we matched
    // this raw name on a prior cycle, reuse the result. Skips pre-filter +
    // LLM entirely.
    let productIdFromShortcut = null;
    let shortcutSource = null;
    let cachedRow = null;
    try {
      cachedRow = await prisma.matchCache.findUnique({
        where: { rawName_supermarket: { rawName: rawDeal.rawName, supermarket: rawDeal.supermarket } },
      });
    } catch (cacheErr) {
      // Non-fatal — just fall through to normal matching.
      console.log(`(cache lookup failed: ${cacheErr.message?.slice(0, 60)}) `);
    }
    if (cachedRow) {
      productIdFromShortcut = cachedRow.productId;
      shortcutSource = 'cache';
      cacheHits++;
      // Bump lastUsedAt — best-effort, don't block.
      prisma.matchCache.update({
        where: { id: cachedRow.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {});
    }

    const candidates = masterProducts
      .map((p) => ({ ...p, score: calculateOverlap(rawDeal.rawName, p.name) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // === AUTO-ACCEPT ===
    // Strict: every significant rawName token must appear in the top
    // candidate's name AND the brands must match AND we need at least 3
    // significant tokens (avoid 1-token flukes). This catches the common case
    // where the supermarket's data is structurally identical to our catalog
    // SKU — e.g. "Pampers Premium Care 50τεμ." matching the same name verbatim.
    if (!productIdFromShortcut && candidates.length > 0) {
      const top = candidates[0];
      const rawTokens = tokensFor(rawDeal.rawName);
      const topTokenSet = new Set(tokensFor(top.name));
      const allRawIn = rawTokens.length >= 3 && rawTokens.every((w) => topTokenSet.has(w));
      if (allRawIn && brandsMatch(rawDeal.rawName, top.name)) {
        productIdFromShortcut = top.id;
        shortcutSource = 'auto_accept';
        autoAcceptHits++;
      }
    }

    const catalogList = candidates.map((p) => `${p.id} | ${p.name}`).join('\n');

    const prompt = `
You are an expert data matching AI for a Greek supermarket aggregator.
Match a RAW extracted deal name against a short list of CANDIDATE PRODUCTS, and assign a CATEGORY.

CANDIDATE PRODUCTS (Format: ID | Name):
${catalogList}

RAW DEAL TO MATCH:
Name: "${rawDeal.rawName}"
Price: ${rawDeal.rawPrice}

ALLOWED CATEGORIES (Pick exactly one):
"Φρούτα & Λαχανικά", "Κρέας & Ψάρι", "Γαλακτοκομικά & Είδη Ψυγείου", "Τυριά & Αλλαντικά", "Σαλάτες & Αλοιφές", "Κονσέρβες", "Αρτοποιία", "Κατεψυγμένα", "Είδη Παντοπωλείου", "Πρωινό & Ροφήματα", "Σνακ & Γλυκά", "Κάβα", "Προσωπική Φροντίδα", "Βρεφικά Είδη", "Είδη Καθαρισμού & Σπιτιού", "Είδη Κατοικιδίων", "Άλλο"

INSTRUCTIONS:
1. **BRAND MUST MATCH EXACTLY.** The first word(s) of the product name are the brand (e.g. "Φιξ Ελλάς", "Arla", "Pampers", "Coca-Cola"). If the brand of the RAW DEAL differs from every CANDIDATE PRODUCT's brand → "suggestedProductId": "NEW", confidence 100. A "Φιξ Ελλάς" beer is NEVER a match for a "Pils Hellas" beer; an "Arla Protein" drink is NEVER a match for a "Μεβγάλ High Protein" drink. Same product category, different brands = NEW.
2. **QUANTITY MUST MATCH EXACTLY.** Compare weight (γρ/g/kg), volume (ml/lt), pack size (τεμ/x). 750ml vs 1lt → NEW. 6x53γρ vs 10x53γρ → NEW.
3. Only if BOTH brand and quantity match → return the candidate's UUID with confidence reflecting how exact the variant match is.
4. Confidence is 0-100. Use 0 when no candidate has the right brand at all.
5. Category hints: Eggs → Είδη Παντοπωλείου; Cheeses/Deli → Τυριά & Αλλαντικά; Dips/Spreads → Σαλάτες & Αλοιφές; Canned → Κονσέρβες.
6. Return JSON ONLY with keys: rawName, suggestedProductId, confidence, category. No prose.

OUTPUT shape:
{ "rawName": "${rawDeal.rawName}", "suggestedProductId": "uuid-or-NEW", "confidence": 95, "category": "..." }
`;

    let llmResult = null;
    if (productIdFromShortcut) {
      // Synthesize an LLM-shaped result so the existing DB-write branch
      // doesn't need a parallel implementation. category falls back to
      // rawDeal.category which the existing Discount row will likely
      // overwrite via update-in-place anyway.
      llmResult = {
        rawName: rawDeal.rawName,
        suggestedProductId: productIdFromShortcut,
        confidence: 100,
        category: rawDeal.category || 'Άλλο',
      };
    } else {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { result, error, status } = await callGroq(apiKey, prompt);
        if (result) { llmResult = result; break; }
        const transient = !status || status === 429 || status >= 500;
        if (!transient) {
          console.log(`❌ Groq fatal: ${error}`);
          break;
        }
        const wait = status === 429 ? 30000 : 2000 * attempt;
        console.log(`🔁 Groq ${status || 'err'} (${attempt}/3), waiting ${wait}ms...`);
        await sleep(wait);
      }
      if (!llmResult) { console.log('⛔ giving up'); await sleep(PACE_MS); continue; }
    }

    const res = llmResult;

    let dbAttempt = 0;
    while (dbAttempt < 3) {
      try {
        let productId = null;
        if (productIdFromShortcut) {
          // Cache hit OR auto-accept — already validated upstream, trust it.
          productId = productIdFromShortcut;
        } else if (res.confidence >= 90 && isUuid(res.suggestedProductId)) {
          const candidate = candidates.find((c) => c.id === res.suggestedProductId);
          if (candidate) {
            if (!brandsMatch(rawDeal.rawName, candidate.name)) {
              const rb = (rawDeal.rawName || '').split(/\s+/)[0];
              const cb = (candidate.name || '').split(/\s+/)[0];
              console.log(`⚠️ BRAND MISMATCH ('${rb}' vs '${cb}') — routing to review`);
            } else {
              productId = res.suggestedProductId;
            }
          } else {
            console.log(`⚠️ UUID not in candidates — routing to review`);
          }
        } else if (res.confidence >= 90 && res.suggestedProductId && res.suggestedProductId !== 'NEW' && res.suggestedProductId !== 'null') {
          console.log(`⚠️ Malformed UUID "${res.suggestedProductId}" — routing to review`);
        }

        if (!productId && rawDeal.imageUrl) {
          const newProduct = await prisma.product.create({
            data: {
              name: res.rawName,
              imageUrl: rawDeal.imageUrl,
              supermarket: rawDeal.supermarket,
              storeId: store.id
            }
          });
          productId = newProduct.id;
          shortcutSource = 'auto_create';
        }

        if (productId) {
          let discountPercent = null;
          const finalOriginalPrice = rawDeal.originalPrice;
          if (finalOriginalPrice && finalOriginalPrice > rawDeal.rawPrice) {
            discountPercent = Math.round(((finalOriginalPrice - rawDeal.rawPrice) / finalOriginalPrice) * 100);
          }

          // Date Logic:
          // Web offers (subitem=1) always end on the upcoming Sunday.
          // Leaflet offers (subitem=2) have specific dates, which can be passed via ENV.
          let validFrom = process.env.VALID_FROM ? new Date(process.env.VALID_FROM) : new Date();
          let validUntil;
          
          if (process.env.VALID_UNTIL) {
            validUntil = new Date(process.env.VALID_UNTIL);
          } else if (SOURCE === 'web') {
            // Find the upcoming Sunday
            validUntil = new Date();
            const daysUntilSunday = 7 - validUntil.getDay();
            validUntil.setDate(validUntil.getDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday)); // If today is Sunday, it means next Sunday
            validUntil.setHours(23, 59, 59, 999);
          } else {
            // Fallback for missing leaflet dates
            validUntil = new Date(validFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
          }

          const existing = await prisma.discount.findFirst({
            where: { productId, supermarket: rawDeal.supermarket, source: SOURCE },
            orderBy: { updatedAt: 'desc' },
          });

          if (existing) {
            await prisma.discount.update({
              where: { id: existing.id },
              data: {
                productName: res.rawName,
                category: res.category || rawDeal.category || 'Άλλο',
                discountedPrice: rawDeal.rawPrice,
                originalPrice: finalOriginalPrice,
                discountPercent,
                validFrom: validFrom,
                validUntil: validUntil,
                isActive: true,
              },
            });
            const tag = shortcutSource === 'cache' ? '💾 CACHE' : shortcutSource === 'auto_accept' ? '⚡ AUTO' : '🔄 UPDATED';
            console.log(`${tag} (${res.confidence}%) -> ${res.category}`);
            updatedCount++;
          } else {
            await prisma.discount.create({
              data: {
                productName: res.rawName,
                category: res.category || rawDeal.category || 'Άλλο',
                discountedPrice: rawDeal.rawPrice,
                originalPrice: finalOriginalPrice,
                discountPercent,
                validFrom: validFrom,
                validUntil: validUntil,
                isActive: true,
                supermarket: rawDeal.supermarket,
                storeId: store.id,
                productId,
                source: SOURCE,
              },
            });
            const tag = shortcutSource === 'cache' ? '💾 CACHE+CREATED' : shortcutSource === 'auto_accept' ? '⚡ AUTO+CREATED' : '✅ MATCHED';
            console.log(`${tag} (${res.confidence}%) -> ${res.category}`);
            matchedCount++;
          }

          await prisma.priceSnapshot.create({
            data: {
              productId,
              supermarket: rawDeal.supermarket,
              price: rawDeal.rawPrice,
              isDiscounted: !!finalOriginalPrice,
            },
          });

          // Persist this match for next cycle. Skip if it came FROM the cache
          // (we already bumped lastUsedAt on read). Write on auto_accept and
          // on fresh LLM matches.
          if (shortcutSource !== 'cache') {
            try {
              await prisma.matchCache.upsert({
                where: { rawName_supermarket: { rawName: rawDeal.rawName, supermarket: rawDeal.supermarket } },
                create: {
                  rawName: rawDeal.rawName,
                  supermarket: rawDeal.supermarket,
                  productId,
                  brandToken: normalizeBrandToken((rawDeal.rawName || '').split(/\s+/)[0]) || null,
                  source: shortcutSource === 'auto_accept' ? 'auto_accept' : 'llm',
                },
                update: {
                  productId,
                  lastUsedAt: new Date(),
                  source: shortcutSource === 'auto_accept' ? 'auto_accept' : 'llm',
                },
              });
            } catch (cacheWriteErr) {
              // Non-fatal — the match is already in Discount. Just log.
              console.log(`(cache write failed: ${cacheWriteErr.message?.slice(0, 60)})`);
            }
          }
        } else {
          if (!rawDeal.imageUrl) {
            console.log(`❌ DROPPING: No image (Strict Rule).`);
            break;
          }
          await prisma.pendingMatch.upsert({
            where: { rawName_supermarket: { rawName: res.rawName, supermarket: rawDeal.supermarket } },
            create: {
              rawName: res.rawName,
              rawPrice: rawDeal.rawPrice,
              supermarket: rawDeal.supermarket,
              aiConfidence: res.confidence || 0,
              suggestedProductId: isUuid(res.suggestedProductId) ? res.suggestedProductId : null,
              imageUrl: rawDeal.imageUrl || null,
            },
            update: {
              rawPrice: rawDeal.rawPrice,
              aiConfidence: res.confidence || 0,
              suggestedProductId: isUuid(res.suggestedProductId) ? res.suggestedProductId : null,
              imageUrl: rawDeal.imageUrl || null,
            },
          });
          console.log(`⚠️ REVIEW NEEDED (${res.confidence}%)`);
          pendingCount++;
        }
        break;
      } catch (dbErr) {
        dbAttempt++;
        const transient = /connection|terminated|ECONN|timeout|socket/i.test(dbErr.message || '');
        if (transient && dbAttempt < 3) {
          console.log(`🔁 DB blip, retrying (${dbAttempt}/3): ${dbErr.message}`);
          await sleep(2000);
          continue;
        }
        console.log(`❌ DB Error (attempt ${dbAttempt}): ${dbErr.message}`);
        break;
      }
    }

    await sleep(PACE_MS);
    } catch (itemErr) {
      // Defense in depth — never let a single bad item kill the whole run.
      console.log(`❌ Item-level error (skipped): ${itemErr.message?.slice(0, 200)}`);
      await sleep(PACE_MS);
    }
  }

  let staleCount = 0;
  if (!LIMIT) {
    const stale = await prisma.discount.updateMany({
      where: {
        supermarket: 'masoutis',
        source: SOURCE,
        isActive: true,
        updatedAt: { lt: runStartedAt },
      },
      data: { isActive: false },
    });
    staleCount = stale.count;
  }

  const llmCalls = total - cacheHits - autoAcceptHits;
  console.log('\n🏁 Groq Matcher finished.');
  console.log(`💾 Cache hits: ${cacheHits}    ⚡ Auto-accepted: ${autoAcceptHits}    🤖 LLM calls: ${llmCalls}`);
  console.log(`🟢 Created: ${matchedCount}`);
  console.log(`🔄 Updated: ${updatedCount}`);
  console.log(`🟡 Sent to Review Queue: ${pendingCount}`);
  console.log(`🪦 Deactivated: ${LIMIT ? 'SKIPPED (LIMIT set)' : staleCount}`);
}

runMatcher();
