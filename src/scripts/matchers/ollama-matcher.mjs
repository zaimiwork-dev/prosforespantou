import fs from 'fs';

const INPUT_FILE = './pending_masoutis_deals.json';

// Simple helper to calculate text overlap for pre-filtering
function calculateOverlap(str1, str2) {
  const words1 = str1.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/);
  const words2 = str2.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/);
  let overlap = 0;
  for (const w1 of words1) {
    if (w1.length < 3) continue; // ignore tiny words
    for (const w2 of words2) {
      if (w1.includes(w2) || w2.includes(w1)) {
        overlap++;
        break;
      }
    }
  }
  return overlap;
}

async function runMatcher() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Matcher Error: File not found at ${INPUT_FILE}. Run the Extractor first.`);
    process.exit(1);
  }

  const rawDeals = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`🤖 Smart Ollama Matcher Agent: Loaded ${rawDeals.length} raw deals from Extractor.`);

  // Import Prisma client dynamically
  const { default: prisma } = await import('../../lib/prisma.ts');

  // Get the store ID for Masoutis so we can link it properly
  const store = await prisma.store.findUnique({ where: { name: 'Μασούτης' } });
  if (!store) {
    console.error('❌ Store "Μασούτης" not found in DB.');
    process.exit(1);
  }

  // Get Master Catalog for Masoutis
  const masterProducts = await prisma.product.findMany({
    where: { supermarket: 'masoutis' },
    select: { id: true, name: true }
  });

  console.log(`📚 Master Catalog: Loaded ${masterProducts.length} known products for Masoutis.`);

  let matchedCount = 0;
  let pendingCount = 0;

  console.log(`\n⚙️ Processing ${rawDeals.length} deals ONE-BY-ONE using Gemma 4 + Local Pre-Filtering...`);

  for (let i = 0; i < rawDeals.length; i++) {
    const rawDeal = rawDeals[i];
    process.stdout.write(`[${i+1}/${rawDeals.length}] Analyzing "${rawDeal.rawName}"... `);

    // 1. PRE-FILTERING: Find the top 10 most likely products in the Master Catalog
    // Instead of sending 980 items to Gemma, we send 10. This stops it from hallucinating.
    const candidates = masterProducts
      .map(p => ({ ...p, score: calculateOverlap(rawDeal.rawName, p.name) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const catalogList = candidates.map(p => `${p.id} | ${p.name}`).join('\n');

    const prompt = `
You are an expert data matching AI for a Greek supermarket aggregator.
Your task is to match a RAW extracted deal name against a short list of CANDIDATE PRODUCTS from our catalog, and assign the correct CATEGORY.

CANDIDATE PRODUCTS (Format: ID | Name):
${catalogList}

RAW DEAL TO MATCH:
Name: "${rawDeal.rawName}"
Price: ${rawDeal.rawPrice}

ALLOWED CATEGORIES (Pick one exactly as written):
"Φρούτα & Λαχανικά", "Κρέας & Ψάρι", "Γαλακτοκομικά & Είδη Ψυγείου", "Τυριά & Αλλαντικά", "Σαλάτες & Αλοιφές", "Κονσέρβες", "Αρτοποιία", "Κατεψυγμένα", "Είδη Παντοπωλείου", "Πρωινό & Ροφήματα", "Σνακ & Γλυκά", "Κάβα", "Προσωπική Φροντίδα", "Βρεφικά Είδη", "Είδη Καθαρισμού & Σπιτιού", "Είδη Κατοικιδίων", "Άλλο"

INSTRUCTIONS:
1. Find the most likely matching product in the CANDIDATE PRODUCTS list. If none match well, set "suggestedProductId" to "NEW" and confidence to 100.
2. STRICTURE ON QUANTITIES: Compare the "rawName" with the candidate's "Name".
   - You MUST verify the weight (g/γρ/kg), volume (ml/lt), and count (pcs/τεμ).
   - If the name matches but the QUANTITY is different (e.g., 750ml vs 1lt), you MUST set "suggestedProductId" to "NEW" and confidence to 100.
3. Calculate your confidence score from 0 to 100.
4. Assign the most appropriate ALLOWED CATEGORY.
   - Eggs (Αυγά) -> "Είδη Παντοπωλείου"
   - Cheeses/Deli -> "Τυριά & Αλλαντικά"
   - Dips/Spreads (Τυροκαυτερή, etc.) -> "Σαλάτες & Αλοιφές"
   - Canned items (Τόνος, etc.) -> "Κονσέρβες"
5. Respond ONLY with a valid JSON object. No markdown formatting.

JSON OUTPUT FORMAT:
{
  "rawName": "${rawDeal.rawName}",
  "suggestedProductId": "uuid-from-candidates-or-NEW",
  "confidence": 95,
  "category": "Γαλακτοκομικά & Είδη Ψυγείου"
}
`;

    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gemma4',
          prompt: prompt,
          format: {
            "type": "object",
            "properties": {
              "rawName": { "type": "string" },
              "suggestedProductId": { "type": "string" },
              "confidence": { "type": "number" },
              "category": { "type": "string" }
            },
            "required": ["rawName", "suggestedProductId", "confidence", "category"]
          },
          stream: false,
          options: {
            temperature: 0
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        console.log(`❌ Ollama Error: ${data.error.message}`);
        await new Promise(r => setTimeout(r, 2000));
        i--; // retry
        continue;
      }

      let res;
      try {
         res = JSON.parse(data.response);
      } catch (parseErr) {
         console.log('❌ Failed to parse JSON');
         continue;
      }

      try {
            let productId = null;
            let isNewProduct = false;

            if (res.confidence >= 90 && res.suggestedProductId === "NEW") {
                if (!rawDeal.imageUrl) {
                    console.log(`❌ DROPPING: No image (Strict Rule).`);
                    continue;
                }
                const newProduct = await prisma.product.create({
                    data: {
                        name: res.rawName,
                        description: res.rawName,
                        imageUrl: rawDeal.imageUrl,
                        supermarket: rawDeal.supermarket,
                        storeId: store.id
                    }
                });
                productId = newProduct.id;
                isNewProduct = true;
                console.log(`🌟 CREATED NEW: -> ${res.category}`);
                
            } else if (res.confidence >= 90 && res.suggestedProductId && res.suggestedProductId !== "null") {
                productId = res.suggestedProductId;
            }

            if (productId) {
                const existing = await prisma.discount.findFirst({
                    where: { productId: productId, supermarket: rawDeal.supermarket, isActive: true }
                });

                if (existing && !isNewProduct) {
                    console.log(`⏭️  SKIPPING (Already Active)`);
                    continue;
                }

                let discountPercent = null;
                const finalOriginalPrice = rawDeal.originalPrice;
                if (finalOriginalPrice && finalOriginalPrice > rawDeal.rawPrice) {
                    discountPercent = Math.round(((finalOriginalPrice - rawDeal.rawPrice) / finalOriginalPrice) * 100);
                }

                const now = new Date();
                const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

                await prisma.discount.create({
                    data: {
                        productName: res.rawName,
                        category: res.category || rawDeal.category || 'Άλλο',
                        discountedPrice: rawDeal.rawPrice,
                        originalPrice: finalOriginalPrice,
                        discountPercent: discountPercent,
                        validFrom: now,
                        validUntil: nextWeek,
                        isActive: true,
                        supermarket: rawDeal.supermarket,
                        storeId: store.id,
                        productId: productId
                    }
                });
                console.log(`✅ MATCHED (${res.confidence}%) -> ${res.category}`);
                matchedCount++;
            } else {
                if (!rawDeal.imageUrl) {
                    console.log(`❌ DROPPING: No image (Strict Rule).`);
                    continue;
                }

                await prisma.pendingMatch.create({
                    data: {
                        rawName: res.rawName,
                        rawPrice: rawDeal.rawPrice,
                        supermarket: rawDeal.supermarket,
                        aiConfidence: res.confidence || 0,
                        suggestedProductId: res.suggestedProductId && res.suggestedProductId !== "null" && res.suggestedProductId !== "NEW" ? res.suggestedProductId : null
                    }
                });
                console.log(`⚠️ REVIEW NEEDED (${res.confidence}%)`);
                pendingCount++;
            }
      } catch (dbErr) {
            console.log(`❌ DB Error: ${dbErr.message}`);
      }
    } catch (err) {
      console.log(`❌ Network Error: ${err.message}`);
    }
  }

  console.log('\n🏁 Smart Matcher Agent finished processing.');
  console.log(`🟢 Auto-Matched & Published: ${matchedCount} deals.`);
  console.log(`🟡 Sent to Review Queue: ${pendingCount} deals.`);
}

runMatcher();