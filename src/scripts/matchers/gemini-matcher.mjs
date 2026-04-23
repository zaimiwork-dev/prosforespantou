import fs from 'fs';

const INPUT_FILE = './pending_masoutis_deals.json';

async function runMatcher() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Matcher Error: File not found at ${INPUT_FILE}. Run the Extractor first.`);
    process.exit(1);
  }

  const rawDeals = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`🤖 Matcher Agent: Loaded ${rawDeals.length} raw deals from Extractor.`);

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

  // You can set GEMINI_API_KEY in .env.local, Next.js / tsx will pick it up
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is missing in environment variables.');
    process.exit(1);
  }

  // We process deals in small batches so the AI doesn't get overwhelmed and lose accuracy
  const BATCH_SIZE = 30;
  
  // Create a map for fast lookup
  const catalogMap = new Map(masterProducts.map(p => [p.id, p.name]));
  const catalogList = masterProducts.map(p => `${p.id} | ${p.name}`).join('\n');

  let matchedCount = 0;
  let pendingCount = 0;

  for (let i = 0; i < rawDeals.length; i += BATCH_SIZE) {
    const batch = rawDeals.slice(i, i + BATCH_SIZE);
    console.log(`\n⚙️ Processing batch ${Math.floor(i/BATCH_SIZE) + 1} (${batch.length} items)...`);

    const prompt = `
You are an expert data matching AI for a Greek supermarket aggregator.
Your task is to match RAW extracted deal names against our MASTER CATALOG, and also assign them the correct CATEGORY.

MASTER CATALOG (Format: ID | Name):
${catalogList}

RAW DEALS TO MATCH:
${JSON.stringify(batch.map(d => ({ rawName: d.rawName, rawPrice: d.rawPrice, originalPrice: d.originalPrice })), null, 2)}

ALLOWED CATEGORIES (Pick one exactly as written):
"Φρούτα & Λαχανικά", "Κρέας & Ψάρι", "Γαλακτοκομικά & Είδη Ψυγείου", "Τυριά & Αλλαντικά", "Σαλάτες & Αλοιφές", "Κονσέρβες", "Αρτοποιία", "Κατεψυγμένα", "Είδη Παντοπωλείου", "Πρωινό & Ροφήματα", "Σνακ & Γλυκά", "Κάβα", "Προσωπική Φροντίδα", "Βρεφικά Είδη", "Είδη Καθαρισμού & Σπιτιού", "Είδη Κατοικιδίων", "Άλλο"

INSTRUCTIONS:
1. For each RAW DEAL, find the most likely matching product in the MASTER CATALOG.
2. If the product is NOT in the MASTER CATALOG, set "suggestedProductId" to "NEW" and confidence to 100.
3. STRICTURE ON QUANTITIES: Compare the "rawName" with the catalog's "Name".
   - You MUST verify the weight (g/γρ/kg), volume (ml/lt), and count (pcs/τεμ).
   - If the name matches but the QUANTITY is different (e.g., 750ml vs 1lt, or 500g vs 1kg, or 10pcs vs 8pcs), this is NOT a match.
   - If quantities do not match exactly, you MUST set "suggestedProductId" to null and confidence to 0.
4. Calculate your confidence score from 0 to 100.
5. Assign the most appropriate ALLOWED CATEGORY based on the product name.
   - IMPORTANT: Eggs (Αυγά) MUST always be categorized as "Είδη Παντοπωλείου".
   - IMPORTANT: Cheeses and deli meats MUST be categorized as "Τυριά & Αλλαντικά".
   - IMPORTANT: Dips, spreads, and ready salads (e.g., Τυροκαυτερή, Τζατζίκι, Μελιτζανοσαλάτα, Ταραμοσαλάτα, Ρώσικη) MUST be categorized as "Σαλάτες & Αλοιφές".
   - IMPORTANT: Canned items (e.g., Τόνος, Σαρδέλες, Καλαμπόκι κονσέρβα, Μανιτάρια κονσέρβα) MUST be categorized as "Κονσέρβες".
   - IMPORTANT: Ice cream (Παγωτό) MUST always be categorized as "Κατεψυγμένα".
6. Respond ONLY with a valid JSON object containing an array called "matches". No markdown formatting, no explanations.

JSON OUTPUT FORMAT:
{
  "matches": [
    {
      "rawName": "Exact string from raw deal",
      "rawPrice": 0.00,
      "originalPrice": 0.00,
      "suggestedProductId": "uuid-from-catalog-or-null",
      "confidence": 95,
      "category": "Γαλακτοκομικά & Είδη Ψυγείου"
    }
  ]
}
`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        console.error('❌ Gemini API Error:', data.error.message);
        if (data.error.message.includes('not found') || data.error.message.includes('API key not valid')) {
            console.error('Fatal error, exiting.');
            process.exit(1);
        }
        // Wait longer on error before next batch
        await new Promise(r => setTimeout(r, 6000));
        i -= BATCH_SIZE; // retry this batch
        continue;
      }

      let results;
      try {
         const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
         results = parsed.matches || [];
      } catch (parseErr) {
         console.error('❌ Failed to parse Gemini response:', data.candidates[0].content.parts[0].text);
         await new Promise(r => setTimeout(r, 2000));
         continue;
      }

      for (const res of results) {
        const originalDeal = batch.find(d => d.rawName === res.rawName);
        if (!originalDeal) continue;

        try {
            let productId = null;
            let isNewProduct = false;

            if (res.confidence >= 90 && res.suggestedProductId === "NEW") {
                // ----------------------------------------------------
                // NEW PRODUCT -> Create it in Master Catalog if it has an image
                // ----------------------------------------------------
                if (!originalDeal.imageUrl) {
                    console.log(`❌ DROPPING: "${res.rawName}" because it has no image (Strict Rule).`);
                    continue;
                }
                
                // Create the new product in the catalog
                const newProduct = await prisma.product.create({
                    data: {
                        name: res.rawName,
                        description: res.rawName,
                        imageUrl: originalDeal.imageUrl,
                        supermarket: originalDeal.supermarket,
                        storeId: store.id
                    }
                });
                productId = newProduct.id;
                isNewProduct = true;
                console.log(`🌟 CREATED NEW PRODUCT: ${res.rawName}`);
                
            } else if (res.confidence >= 90 && res.suggestedProductId && res.suggestedProductId !== "null") {
                productId = res.suggestedProductId;
            }

            if (productId) {
                // CHECK FOR EXISTING ACTIVE DISCOUNT FOR THIS PRODUCT
                const existing = await prisma.discount.findFirst({
                    where: {
                        productId: productId,
                        supermarket: originalDeal.supermarket,
                        isActive: true
                    }
                });

                if (existing && !isNewProduct) {
                    console.log(`⏭️  SKIPPING (Already Active): ${res.rawName}`);
                    continue;
                }

                // Calculate discount percent if original price exists
                let discountPercent = null;
                const finalOriginalPrice = res.originalPrice || originalDeal.originalPrice;
                if (finalOriginalPrice && finalOriginalPrice > res.rawPrice) {
                    discountPercent = Math.round(((finalOriginalPrice - res.rawPrice) / finalOriginalPrice) * 100);
                }

                // ----------------------------------------------------
                // CONFIDENT MATCH -> Create Active Discount
                // ----------------------------------------------------
                const now = new Date();
                const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

                await prisma.discount.create({
                    data: {
                        productName: res.rawName,
                        category: res.category || originalDeal.category || 'Άλλο',
                        discountedPrice: res.rawPrice,
                        originalPrice: finalOriginalPrice,
                        discountPercent: discountPercent,
                        validFrom: now,
                        validUntil: nextWeek,
                        isActive: true,
                        supermarket: originalDeal.supermarket,
                        storeId: store.id,
                        productId: productId
                    }
                });
                console.log(`✅ MATCHED (${res.confidence}%): ${res.rawName} -> ${res.category} (${discountPercent || 0}% OFF)`);
                matchedCount++;
            } else {
                // ----------------------------------------------------
                // UNSURE OR NO MATCH -> Send to PendingMatch Review Queue
                // ----------------------------------------------------
                if (!originalDeal.imageUrl) {
                    console.log(`❌ DROPPING: "${res.rawName}" because it has no image (Strict Rule).`);
                    continue; // Skip completely if no image
                }

                await prisma.pendingMatch.create({
                    data: {
                        rawName: res.rawName,
                        rawPrice: res.rawPrice,
                        supermarket: originalDeal.supermarket,
                        aiConfidence: res.confidence || 0,
                        suggestedProductId: res.suggestedProductId && res.suggestedProductId !== "null" && res.suggestedProductId !== "NEW" ? res.suggestedProductId : null
                    }
                });
                console.log(`⚠️  REVIEW NEEDED (${res.confidence}%): ${res.rawName}`);
                pendingCount++;
            }
        } catch (dbErr) {
            console.error(`❌ DB Error for ${res.rawName}:`, dbErr.message);
        }
      }      
      // Delay to respect free tier rate limits
      await new Promise(r => setTimeout(r, 6000));

    } catch (err) {
      console.error('❌ Error processing batch:', err.message);
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  console.log('\n🏁 Matcher Agent finished processing.');
  console.log(`🟢 Auto-Matched & Published: ${matchedCount} deals.`);
  console.log(`🟡 Sent to Review Queue: ${pendingCount} deals.`);
}

runMatcher();