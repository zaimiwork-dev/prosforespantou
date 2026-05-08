import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

// Cloud-fast counterpart to ollama-matcher.mjs. Same architecture (source
// isolation, candidate pre-filter, UUID validation, upsert, end-of-run
// deactivation, LIMIT mode, PriceSnapshot) — only the LLM call differs.
//
// Gemini 2.0 Flash free tier: 15 RPM / 1500 RPD / 1M tokens-per-day. We pace
// at 4s per call which keeps us safely under 15 RPM. ~12 minutes for 200 items.

const SOURCE = process.env.SOURCE || 'web';
const INPUT_FILE = process.env.INPUT_FILE || './pending_masoutis_deals.json';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const PACE_MS = parseInt(process.env.PACE_MS || '4000', 10); // 4s = 15 RPM. Lower at your own risk.

if (!['web', 'leaflet', 'manual'].includes(SOURCE)) {
  console.error(`❌ Invalid SOURCE='${SOURCE}'. Must be one of: web, leaflet, manual`);
  process.exit(1);
}

function calculateOverlap(str1, str2) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter((w) => w.length >= 3);
  const set2 = new Set(norm(str2));
  return norm(str1).filter((w) => set2.has(w)).length;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(apiKey, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              rawName: { type: 'string' },
              suggestedProductId: { type: 'string' },
              confidence: { type: 'number' },
              category: { type: 'string' },
            },
            required: ['rawName', 'suggestedProductId', 'confidence', 'category'],
          },
          temperature: 0,
        },
      }),
    }
  );
  const data = await res.json();
  if (data.error) {
    const msg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
    return { error: msg, status: res.status };
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { error: 'Empty Gemini response', raw: data };
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not set in .env.local. Get one at https://aistudio.google.com/apikey');
    process.exit(1);
  }

  const rawDeals = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`🤖 Gemini Matcher (source='${SOURCE}', pace=${PACE_MS}ms): Loaded ${rawDeals.length} raw deals from ${INPUT_FILE}.`);

  const { default: prisma } = await import('../../lib/prisma.ts');

  const store = await prisma.store.findUnique({ where: { name: 'Μασούτης' } });
  if (!store) {
    console.error('❌ Store "Μασούτης" not found in DB.');
    process.exit(1);
  }

  const masterProducts = await prisma.product.findMany({
    where: { supermarket: 'masoutis' },
    select: { id: true, name: true },
  });
  console.log(`📚 Master Catalog: Loaded ${masterProducts.length} known products for Masoutis.`);

  const runStartedAt = new Date();
  let matchedCount = 0;
  let pendingCount = 0;
  let updatedCount = 0;
  const total = LIMIT && LIMIT > 0 ? Math.min(LIMIT, rawDeals.length) : rawDeals.length;

  console.log(`\n⚙️ Processing ${total} deals one-by-one via Gemini 2.0 Flash...${LIMIT ? ' (LIMIT mode — deactivation will be SKIPPED)' : ''}`);

  for (let i = 0; i < total; i++) {
    const rawDeal = rawDeals[i];
    process.stdout.write(`[${i + 1}/${total}] "${rawDeal.rawName.slice(0, 60)}"... `);

    const candidates = masterProducts
      .map((p) => ({ ...p, score: calculateOverlap(rawDeal.rawName, p.name) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

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
1. If a candidate matches well, return its UUID. Otherwise set "suggestedProductId" to "NEW".
2. Verify weight/volume/count exactly. Different quantity = NOT a match → "NEW".
3. Confidence is 0-100.
4. Category hints: Eggs → Είδη Παντοπωλείου; Cheeses/Deli → Τυριά & Αλλαντικά; Dips/Spreads → Σαλάτες & Αλοιφές; Canned → Κονσέρβες.
5. JSON only, no prose.

OUTPUT:
{ "rawName": "${rawDeal.rawName}", "suggestedProductId": "uuid-or-NEW", "confidence": 95, "category": "..." }
`;

    let llmResult = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { result, error, status } = await callGemini(apiKey, prompt);
      if (result) { llmResult = result; break; }
      const transient = !status || status === 429 || status >= 500;
      if (!transient) {
        console.log(`❌ Gemini fatal: ${error}`);
        break;
      }
      const wait = status === 429 ? 30000 : 2000 * attempt;
      console.log(`🔁 Gemini ${status || 'err'} (${attempt}/3), waiting ${wait}ms...`);
      await sleep(wait);
    }
    if (!llmResult) { console.log('⛔ giving up'); await sleep(PACE_MS); continue; }

    const res = llmResult;

    let dbAttempt = 0;
    while (dbAttempt < 3) {
      try {
        let productId = null;
        if (res.confidence >= 90 && isUuid(res.suggestedProductId)) {
          const inCandidates = candidates.some((c) => c.id === res.suggestedProductId);
          if (inCandidates) productId = res.suggestedProductId;
          else console.log(`⚠️ UUID not in candidates — routing to review`);
        } else if (res.confidence >= 90 && res.suggestedProductId && res.suggestedProductId !== 'NEW' && res.suggestedProductId !== 'null') {
          console.log(`⚠️ Malformed UUID "${res.suggestedProductId}" — routing to review`);
        }

        if (productId) {
          let discountPercent = null;
          const finalOriginalPrice = rawDeal.originalPrice;
          if (finalOriginalPrice && finalOriginalPrice > rawDeal.rawPrice) {
            discountPercent = Math.round(((finalOriginalPrice - rawDeal.rawPrice) / finalOriginalPrice) * 100);
          }

          const now = new Date();
          const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

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
                validFrom: now,
                validUntil: nextWeek,
                isActive: true,
              },
            });
            console.log(`🔄 UPDATED (${res.confidence}%) -> ${res.category}`);
            updatedCount++;
          } else {
            await prisma.discount.create({
              data: {
                productName: res.rawName,
                category: res.category || rawDeal.category || 'Άλλο',
                discountedPrice: rawDeal.rawPrice,
                originalPrice: finalOriginalPrice,
                discountPercent,
                validFrom: now,
                validUntil: nextWeek,
                isActive: true,
                supermarket: rawDeal.supermarket,
                storeId: store.id,
                productId,
                source: SOURCE,
              },
            });
            console.log(`✅ MATCHED (${res.confidence}%) -> ${res.category}`);
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

  console.log('\n🏁 Gemini Matcher finished.');
  console.log(`🟢 Created: ${matchedCount}`);
  console.log(`🔄 Updated: ${updatedCount}`);
  console.log(`🟡 Sent to Review Queue: ${pendingCount}`);
  console.log(`🪦 Deactivated: ${LIMIT ? 'SKIPPED (LIMIT set)' : staleCount}`);
}

runMatcher();
